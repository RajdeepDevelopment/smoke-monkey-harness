import type { ChatStreamEvent } from '../types/stream';
import type { ChatPromptResponse, ChatRequest, ChatRevertRequest, ChatRevertResult, ChatTransport } from '../types/transport';
import { StreamParser } from '../runtime/StreamParser';

export interface WebSocketTransportOptions {
  url: string;
  protocols?: string | string[];
  /** StreamParser armed with your provider's parsers (required). */
  parser: StreamParser;
  /** Serializes the request into the payload sent after connect. */
  payload?: (request: ChatRequest) => unknown;
  /** Max wait for a revert reply, in ms. Default 30000. */
  revertTimeoutMs?: number;
}

/**
 * WebSocket transport. Connects, sends the request JSON, then treats every
 * text message as one `data:`-style payload via `StreamParser`.
 */
export class WebSocketTransport implements ChatTransport {
  /**
   * The socket for the run currently in flight.
   *
   * Held on the instance, not as a local of `send()`, because answering a
   * prompt happens while the run is *paused* — the generator is still awaiting
   * events and the socket is still open, but nothing in the generator's frame
   * can reach it from the outside.
   */
  private socket: WebSocket | null = null;

  constructor(private readonly options: WebSocketTransportOptions) {}

  async *send(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const { url, protocols, parser } = this.options;
    const socket = new WebSocket(url, protocols);
    const queue: ChatStreamEvent[] = [];
    const broken = { fatal: null as Error | null };
    let wake: (() => void) | null = null;
    let closed = false;

    const push = (events: ChatStreamEvent[]) => {
      if (!events.length) return;
      queue.push(...events);
      wake?.();
      wake = null;
    };
    const notify = () => {
      wake?.();
      wake = null;
    };

    const cleanup = () => {
      if (this.socket === socket) this.socket = null;
      try {
        socket.close();
      } catch {
        /* already closed */
      }
    };
    const onAbort = () => {
      broken.fatal = new DOMException('aborted', 'AbortError');
      cleanup();
      notify();
    };

    request.signal?.addEventListener('abort', onAbort, { once: true });

    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      push(parser.parseLine(event.data));
    };
    socket.onclose = () => {
      closed = true;
      notify();
    };
    socket.onerror = () => {
      broken.fatal = broken.fatal ?? new Error('WebSocket connection failed');
      notify();
    };

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        socket.removeEventListener('open', onOpen);
        socket.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => {
        socket.removeEventListener('open', onOpen);
        socket.removeEventListener('error', onError);
        reject(broken.fatal ?? new Error('WebSocket connection failed'));
      };
      socket.addEventListener('open', onOpen);
      socket.addEventListener('error', onError);
    }).catch((err) => {
      request.signal?.removeEventListener('abort', onAbort);
      throw err;
    });

    this.socket = socket;
    socket.send(
      JSON.stringify(this.options.payload ? this.options.payload(request) : defaultPayload(request))
    );

    try {
      while (!closed) {
        if (queue.length) {
          const event = queue.shift()!;
          if (event.type === 'message:complete' || event.type === 'error') cleanup();
          yield event;
        } else if (broken.fatal !== null) {
          // Classify at the boundary so the UI can show "connection lost,
          // retry" rather than a generic red error. An abort is the user
          // stopping the stream, which is informational, not a failure.
          const aborted =
            broken.fatal.name === 'AbortError' || /abort/i.test(broken.fatal.message);
          yield {
            type: 'error',
            error: aborted
              ? { code: 'run_cancelled', layer: 'run', severity: 'info', message: 'The stream was cancelled.', retryable: true }
              : {
                  code: 'transport_disconnected',
                  layer: 'transport',
                  severity: 'warning',
                  message: broken.fatal.message || 'Lost the event connection.',
                  retryable: true,
                  hint: 'Messages already received are safe. Reconnect to continue the run.',
                },
          };
          return;
        } else {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      }
    } finally {
      request.signal?.removeEventListener('abort', onAbort);
      if (this.socket === socket) this.socket = null;
    }
  }

  /**
   * Answer a paused run.
   *
   * The three commands mirror the harness API: `agent.respond(toolCallId,
   * text)`, `agent.resolvePermission(toolCallId, decision)` and
   * `agent.resolveMcpDecision(toolCallId, decision)`.
   */
  /**
   * Undo a finished run. A run's socket closes when it completes, so this
   * opens a short-lived one: it sends `{ type: 'revert', requestId, data }` and
   * resolves with the `data` of the `{ type: 'revert_result', requestId }`
   * reply (server side: `revertHarnessRun`).
   */
  revert(request: ChatRevertRequest): Promise<ChatRevertResult> {
    const { url, protocols } = this.options;
    const requestId = `rv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const empty = { added: [], modified: [], deleted: [] };
    return new Promise<ChatRevertResult>((resolve) => {
      const socket = new WebSocket(url, protocols);
      let settled = false;
      const finish = (result: ChatRevertResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          socket.close();
        } catch {
          /* already closed */
        }
        resolve(result);
      };
      const fail = (error: string) =>
        finish({ ok: false, runId: request.runId, error, changes: empty, filesReverted: false, messagesReverted: false });
      const timer = setTimeout(() => fail('Revert timed out.'), this.options.revertTimeoutMs ?? 30_000);
      socket.onopen = () => socket.send(JSON.stringify({ type: 'revert', requestId, data: request }));
      socket.onerror = () => fail('Could not reach the server to revert.');
      socket.onclose = () => fail('The server closed the connection before replying.');
      socket.onmessage = (event: MessageEvent) => {
        if (typeof event.data !== 'string') return;
        try {
          const msg = JSON.parse(event.data) as { type?: string; requestId?: string; data?: ChatRevertResult };
          if (msg.type === 'revert_result' && msg.requestId === requestId && msg.data) finish(msg.data);
        } catch {
          /* not for us */
        }
      };
    });
  }

  respond(response: ChatPromptResponse): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Cannot answer a prompt: no open run to answer.');
    }
    if (response.kind === 'ask') {
      socket.send(
        JSON.stringify({
          type: 'resolve_ask_user',
          data: { toolCallId: response.toolCallId, response: response.answer },
        }),
      );
      return;
    }
    if (response.kind === 'mcp_approval') {
      const decision = response.mcpDecision ?? { action: 'skip' as const, names: [] };
      socket.send(
        JSON.stringify({
          type: 'resolve_mcp_approval',
          data: { toolCallId: response.toolCallId, ...decision },
        }),
      );
      return;
    }
    socket.send(
      JSON.stringify({
        type: 'resolve_permission',
        data: { toolCallId: response.toolCallId, decision: response.answer },
      }),
    );
  }
}

function defaultPayload(request: ChatRequest): Record<string, unknown> {
  return {
    conversationId: request.conversationId,
    model: request.model,
    system: request.system,
    text: request.text,
    messages: request.messages,
    options: request.options,
  };
}