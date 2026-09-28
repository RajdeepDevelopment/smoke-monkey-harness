/**
 * The bridge between the Smoke Monkey harness and this chat UI.
 *
 * The two halves ship separately and neither one can be wired to the other
 * without a translation layer, which is what this file is:
 *
 *   harness (Node)                      @smoke-monkey/ui (browser)
 *   ---------------                     ------------------------
 *   text.delta                    ->    text:delta
 *   text.thought                  ->    reasoning:delta
 *   tool.started                  ->    tool:start   {toolName, presentation}
 *   tool.output / tool.progress   ->    tool:delta
 *   tool.completed                ->    tool:result
 *   tool.failed                   ->    tool:error
 *   ask_user.required             ->    prompt:ask          (run PAUSES)
 *   permission.required           ->    prompt:permission   (run PAUSES)
 *   mcp.approval_required         ->    prompt:mcp_approval (run PAUSES)
 *   run.warning                   ->    notice              (run continues)
 *   run.interrupted               ->    notice              (terminal)
 *   run.failed                    ->    error               (terminal)
 *
 * and back the other way, when the user answers a paused run:
 *
 *   prompt:ask        -> agent.respond(toolCallId, text)
 *   prompt:permission -> agent.resolvePermission(toolCallId, 'allow' | 'deny')
 *   prompt:mcp_approval -> agent.resolveMcpDecision(toolCallId, decision)
 *
 * The prompts are the reason this cannot be skipped. All three of
 * `ask_user.required`, `permission.required` and `mcp.approval_required` do
 * not resolve on their own: a run that raises one is suspended until the host
 * answers. A host that renders those events but never routes the answer back
 * deadlocks the run — it stops, nothing explains why, and the only way out is
 * a `respond()` the browser cannot reach.
 *
 * ## Using it
 *
 * Server side, once per run:
 *
 * ```ts
 * const bridge = createHarnessBridge({ agent, messageId });
 * const send = (event: ChatStreamEvent) => socket.send(JSON.stringify(event));
 *
 * for await (const event of bridge.events()) send(event);
 *
 * // when the socket receives a client command:
 * socket.on('message', (raw) => {
 *   const msg = JSON.parse(raw);
 *   if (msg.type === 'resolve_ask_user') {
 *     bridge.answer({ toolCallId: msg.data.toolCallId, kind: 'ask', answer: msg.data.response });
 *   } else if (msg.type === 'resolve_permission') {
 *     bridge.answer({ toolCallId: msg.data.toolCallId, kind: 'permission', answer: msg.data.decision });
 *   } else if (msg.type === 'resolve_mcp_approval') {
 *     bridge.answer({
 *       toolCallId: msg.data.toolCallId,
 *       kind: 'mcp_approval',
 *       answer: msg.data.action,
 *       mcpDecision: { action: msg.data.action, names: msg.data.names ?? [] },
 *     });
 *   }
 * });
 * ```
 *
 * The browser side is then just `@smoke-monkey/ui`'s `WebSocketTransport`,
 * which speaks the three command names above.
 *
 * Over SSE there is no socket to answer on, so the host holds the run itself
 * and calls `bridge.answer(...)` when the POST arrives. Nothing here is
 * WebSocket-specific.
 */

import type { ChatStreamEvent, ChatErrorInfo } from '../types/stream';
import type { ToolPresentation, ToolPresentationMap } from '../types/tools';
import type { ChatPromptEvent, ChatMcpApprovalDecision } from '../types/prompt';
import type { ChatPromptResponse } from '../types/transport';

/** The harness event, as it reaches a host subscriber. */
export interface HarnessEvent {
  type: string;
  data?: Record<string, unknown>;
  sessionId?: string;
  runId?: string;
}

/**
 * The slice of `AgentHarness` this bridge needs.
 *
 * Declared structurally rather than importing the harness so `@smoke-monkey/ui`
 * stays free of a Node dependency — it has to load in a browser, and the
 * harness is a server package. Any object with these methods works, including
 * a hand-rolled stand-in in a test.
 */
export interface BridgeAgent {
  on(type: string, cb: (event: HarnessEvent) => void): void;
  onAny(cb: (event: HarnessEvent) => void): void;
  /** Optional: the harness' own presentation registry, read once at start. */
  getToolPresentations?(): ToolPresentationMap;
  /** Answers an `ask_user.required` pause. */
  respond?(toolCallId: string, text: string): void | Promise<void>;
  /** Answers a `permission.required` pause. */
  resolvePermission?(toolCallId: string, decision: 'allow' | 'deny'): void | Promise<void>;
  /** Answers an `mcp.approval_required` pause. */
  resolveMcpDecision?(toolCallId: string, decision: ChatMcpApprovalDecision): void | Promise<void>;
}

export interface HarnessBridgeOptions {
  agent: BridgeAgent;
  /**
   * The message this run belongs to. Run- and tool-level events carry only
   * session/run ids, so the host has to know which message to attach them to.
   */
  messageId?: string;
  /** Override per event, when a host multiplexes several messages. */
  resolveMessageId?: (event: HarnessEvent) => string | undefined;
  /**
   * Presentation for tools the run never announces, keyed by tool name.
   * Defaults to `agent.getToolPresentations()` when the agent has it. A
   * `presentation` on a live event still wins over this.
   */
  presentations?: ToolPresentationMap;
}

export interface HarnessBridge {
  /**
   * Async iterator of UI events for the life of the run. Ends when the run
   * reaches a terminal event (`run.completed` / `run.failed` /
   * `run.interrupted`), so `for await` needs no timeout of its own.
   */
  events(): AsyncGenerator<ChatStreamEvent, void, void>;
  /** Same mapping as `events()`, one harness event at a time. */
  map(event: HarnessEvent): ChatStreamEvent[];
  /** Deliver an answer to a paused run, routing it to the right agent call. */
  answer(response: ChatPromptResponse): void | Promise<void>;
  /** The prompts this run is currently blocked on, keyed by `toolCallId`. */
  readonly pending: ReadonlyMap<string, ChatPromptEvent>;
  /** Stop consuming harness events and clear pending prompts. */
  dispose(): void;
}

function presentationOf(
  data: Record<string, unknown>,
  host: ToolPresentationMap,
): ToolPresentation | undefined {
  // A live event carries its own presentation and it wins; the host registry
  // only fills the gap for tools the run never announced itself.
  const own = data.presentation as ToolPresentation | undefined;
  if (own) return own;
  return host[data.toolName as string];
}

/**
 * The error to show for a failure event, as a complete `ChatErrorInfo`.
 *
 * `run.failed`, `run.warning` and `tool.failed` all carry `errorInfo` next to a
 * flat `error` string, and the structured one wins when it is usable — the flat
 * string is the one to fall back to: it is what a pre-structured server sends,
 * and it is never a worse message.
 *
 * The result is always structured rather than sometimes a bare string, because
 * the string is the worse half. Left to `toChatError`, `user_interrupt` matches
 * no known pattern and is classified as a retryable run error, so deliberately
 * stopping a run would raise a red banner; a synthetic `code` also gives
 * `notice` something stable to de-duplicate on. The shape of `errorInfo` is
 * checked rather than cast, since it arrives as untyped event data and a
 * malformed one would put a missing `code` on every banner it touched.
 */
function errorInfoOf(data: Record<string, unknown>, fallback: ChatErrorInfo): ChatErrorInfo {
  const info = data.errorInfo as Partial<ChatErrorInfo> | undefined;
  // A `code` is what makes `errorInfo` trustworthy as a whole; a `message` is
  // useful on its own, so it is read either way.
  const usable = !!info && typeof info.code === 'string' && typeof info.message === 'string';
  const message =
    (typeof info?.message === 'string' ? info.message : undefined) ??
    (typeof data.error === 'string' ? data.error : undefined) ??
    (typeof data.reason === 'string' ? data.reason : undefined) ??
    fallback.message;
  if (!usable) return { ...fallback, message };
  return {
    ...fallback,
    code: info!.code!,
    message: message!,
    layer: info!.layer ?? fallback.layer,
    severity: info!.severity ?? fallback.severity,
    hint: info!.hint ?? fallback.hint,
    retryable: info!.retryable ?? fallback.retryable ?? false,
    ...(info!.details !== undefined ? { details: info!.details } : {}),
  };
}

/**
 * Map one harness event onto the UI events it produces. Pure and exported on
 * its own, so a host can reuse it over a transport this file does not know
 * about, or exercise it without an agent.
 */
export function mapHarnessEvent(
  event: HarnessEvent,
  opts: {
    messageId?: string;
    /** Override per event, when a host multiplexes several messages. */
    resolveMessageId?: (event: HarnessEvent) => string | undefined;
    hostPresentations?: ToolPresentationMap;
    /** A run has already streamed thought in this message. */
    sawReasoning?: boolean;
  } = {},
): ChatStreamEvent[] {
  const data = event.data ?? {};
  const messageId = opts.resolveMessageId?.(event) ?? opts.messageId;
  const host = opts.hostPresentations ?? {};
  const withMessage = <T extends ChatStreamEvent>(e: T): T => messageId ? ({ ...e, messageId } as T) : e;

  switch (event.type) {
    case 'run.started':
      return [withMessage({ type: 'agent:start', agentId: data.agentId as string })];

    case 'run.completed':
      return [
        withMessage({ type: 'agent:complete' }),
        ...(messageId ? [{ type: 'message:complete' as const, messageId }] : []),
      ];

    // Recovered, or still retrying: NOT terminal. Surfacing these as `error`
    // would end the stream and hide the rest of a run that is about to succeed.
    case 'run.warning':
      return [
        withMessage({
          type: 'notice',
          error: errorInfoOf(data, {
            code: 'run_warning',
            message: 'The run hit a problem and is retrying.',
            layer: 'run',
            severity: 'warning',
            retryable: true,
          }),
        }),
      ];

    // Terminal, but not a failure: the harness has already persisted the
    // transcript and the session stays replyable, so the run ends here. It
    // still has to be a terminal *event* — see TERMINAL_HARNESS_EVENTS, or a
    // `for await` over this bridge would wait forever on an interrupted run.
    case 'run.interrupted':
      return [
        withMessage({
          type: 'notice',
          error: errorInfoOf(data, {
            code: 'run_interrupted',
            message: 'Run interrupted. Your work so far is saved — reply to continue.',
            layer: 'run',
            severity: 'info',
            retryable: true,
          }),
        }),
      ];

    case 'run.failed':
      return [
        withMessage({
          type: 'error',
          error: errorInfoOf(data, {
            code: 'run_failed',
            message: 'The run stopped unexpectedly.',
            layer: 'run',
            severity: 'fatal',
            retryable: true,
          }),
        }),
      ];

    case 'step.started':
      return [
        withMessage({
          type: 'agent:step',
          stepId: (data.step as { id?: string })?.id,
          title: (data.step as { title?: string })?.title ?? 'Working…',
          status: 'running',
        }),
      ];

    case 'step.ended':
      return [
        withMessage({
          type: 'agent:step',
          stepId: (data.step as { id?: string })?.id,
          title: (data.step as { title?: string })?.title ?? 'Working…',
          status: 'complete',
        }),
      ];

    case 'text.delta':
      return [withMessage({ type: 'text:delta', delta: (data.delta as string) ?? '' })];

    case 'text.thought': {
      const delta = (data.delta as string) ?? '';
      // Reasoning needs an opening event before its deltas, unlike text.
      if (opts.sawReasoning) return [withMessage({ type: 'reasoning:delta', delta })];
      return [
        withMessage({ type: 'reasoning:start' }),
        withMessage({ type: 'reasoning:delta', delta }),
      ];
    }

    case 'tool.started':
      return [
        withMessage({
          type: 'tool:start',
          toolCallId: data.toolCallId as string,
          toolName: data.toolName as string,
          input: data.args,
          presentation: presentationOf(data, host),
        }),
      ];

    case 'tool.output':
      return [
        withMessage({
          type: 'tool:delta',
          toolCallId: data.toolCallId as string,
          delta: data.output,
        }),
      ];

    case 'tool.progress': {
      const { toolCallId, ...progress } = data;
      return [
        withMessage({ type: 'tool:delta', toolCallId: toolCallId as string, delta: progress }),
      ];
    }

    case 'tool.completed':
      return [
        withMessage({
          type: 'tool:result',
          toolCallId: data.toolCallId as string,
          result: data.result,
        }),
      ];

    // Scoped to one call: sets that card's error and leaves the run going.
    case 'tool.failed':
      return [
        withMessage({
          type: 'tool:error',
          toolCallId: data.toolCallId as string,
          error: errorInfoOf(data, {
            code: 'tool_failed',
            message: 'The tool call failed.',
            layer: 'tool',
            severity: 'error',
            retryable: true,
          }),
        }),
      ];

    case 'ask_user.required': {
      const prompt: ChatPromptEvent = {
        kind: 'ask',
        toolCallId: data.toolCallId as string,
        question: (data.question as string) ?? 'The agent needs an answer.',
        options: data.options as ChatPromptEvent['options'],
        multiple: data.multiple as boolean | undefined,
      };
      return [withMessage({ type: 'prompt:ask', prompt })];
    }

    case 'permission.required': {
      const prompt: ChatPromptEvent = {
        kind: 'permission',
        toolCallId: data.toolCallId as string,
        question:
          (data.question as string) ??
          `Allow ${String(data.toolName ?? 'this tool')} to run?`,
        toolName: data.toolName as string | undefined,
        input: data.args,
      };
      return [withMessage({ type: 'prompt:permission', prompt })];
    }

    case 'ask_user.response':
      return [
        withMessage({
          type: 'prompt:resolved',
          prompt: {
            toolCallId: data.toolCallId as string,
            kind: 'ask',
            status: 'answered',
            answer: data.response as string,
          },
        }),
      ];

    // The third pause, and the only one that carries a decision the agent acts
    // on rather than an answer it reads. The server list is passed through
    // as-is: the harness owns the shape, and the card only needs the ids.
    case 'mcp.approval_required': {
      const payload = (data.payload ?? {}) as {
        task?: string | null;
        servers?: unknown[];
        recommendedToEnableIds?: string[];
        recommendedToAddIds?: string[];
      };
      const recommended = [...(payload.recommendedToEnableIds ?? []), ...(payload.recommendedToAddIds ?? [])];
      const prompt: ChatPromptEvent = {
        kind: 'mcp_approval',
        toolCallId: data.toolCallId as string,
        question:
          payload.task ??
          (recommended.length
            ? `The agent wants to use ${recommended.join(', ')}. Turn them on?`
            : 'The agent wants to use additional MCP servers. Turn them on?'),
        mcp: {
          task: payload.task ?? null,
          servers: payload.servers ?? [],
          recommendedToEnableIds: payload.recommendedToEnableIds ?? [],
          recommendedToAddIds: payload.recommendedToAddIds ?? [],
        },
      };
      return [withMessage({ type: 'prompt:mcp_approval', prompt })];
    }

    // The harness' own echo of an MCP decision. `answer()` has normally
    // already closed the card by the time this arrives; push() drops it when
    // the prompt is no longer pending.
    case 'mcp.resolved':
      return [
        withMessage({
          type: 'prompt:resolved',
          prompt: {
            toolCallId: data.toolCallId as string,
            kind: 'mcp_approval',
            status: 'answered',
            answer: data.action as string,
            mcpDecision: {
              action: (data.action as ChatMcpApprovalDecision['action']) ?? 'skip',
              names: (data.names as string[]) ?? [],
            },
          },
        }),
      ];

    case 'todo.updated':
      return [
        withMessage({
          type: 'agent:step',
          title: `${(data.todos as unknown[])?.length ?? 0} todos`,
          status: 'running',
        }),
      ];

    default:
      // Context/state/telemetry events have no UI surface yet. Returning
      // nothing keeps a host from having to enumerate the ones it ignores.
      return [];
  }
}

/**
 * The MCP decision for an answer, from the structured field when the host sent
 * one and from the prompt's own recommendation when it did not.
 *
 * The fallback is what makes a three-button card enough: `answer` carries the
 * action, and the server ids come from the same recommendation the prompt
 * already showed the user, so a host that forwards `answer` alone still sends
 * a decision the harness can act on instead of an empty list it would read as
 * "enable nothing". An explicit `mcpDecision` always wins — a card that lets
 * the user untick a server has to be able to send the shorter list.
 */
function mcpDecisionFor(
  response: ChatPromptResponse,
  prompt: ChatPromptEvent,
): ChatMcpApprovalDecision {
  if (response.mcpDecision) return response.mcpDecision;
  const action = (response.answer as ChatMcpApprovalDecision['action']) ?? 'skip';
  if (action === 'skip') return { action, names: [] };
  const names =
    action === 'add'
      ? (prompt.mcp?.recommendedToAddIds ?? [])
      : (prompt.mcp?.recommendedToEnableIds ?? []);
  return { action, names };
}

/**
 * The harness events after which no further event can arrive.
 *
 * `run.interrupted` belongs here for the same reason `run.completed` and
 * `run.failed` do: `finalizeInterrupted` is the last thing an interrupted run
 * does — it persists the transcript, marks the run and session interrupted, and
 * emits. Nothing follows. Treating it as a plain notice (which is what its UI
 * event is) without ending the iteration would leave `for await` parked on a
 * stream that will never produce again, and the host waiting on it forever.
 */
const TERMINAL_HARNESS_EVENTS: ReadonlySet<string> = new Set([
  'run.completed',
  'run.failed',
  'run.interrupted',
]);

/**
 * Wire a live harness run to a chat UI.
 *
 * Nothing here is WebSocket- or transport-specific, so the same bridge drives
 * SSE, a queue, or a test's array of events.
 */
export function createHarnessBridge(opts: HarnessBridgeOptions): HarnessBridge {
  const { agent } = opts;
  const hostPresentations: ToolPresentationMap =
    opts.presentations ?? agent.getToolPresentations?.() ?? {};

  const pending = new Map<string, ChatPromptEvent>();
  let queue: ChatStreamEvent[] = [];
  let notify: (() => void) | null = null;
  let done = false;
  let sawReasoning = false;
  let disposed = false;

  const push = (event: ChatStreamEvent): void => {
    if (disposed) return;
    if (event.type === 'reasoning:start') sawReasoning = true;
    if (event.type === 'prompt:ask' || event.type === 'prompt:permission' || event.type === 'prompt:mcp_approval') {
      pending.set(event.prompt.toolCallId, event.prompt);
    }
    if (event.type === 'prompt:resolved') {
      // An echo of a prompt this bridge already closed. `answer()` resolves the
      // prompt locally, and the harness then echoes `ask_user.response` or
      // `mcp.resolved` for the same call. The reducer is idempotent, so the
      // repeat is harmless in state but is a second event on the wire for one
      // decision — and a `prompt:resolved` for a prompt that was never raised
      // here has no card to close. Either way there is nothing to do.
      if (!pending.has(event.prompt.toolCallId)) return;
      pending.delete(event.prompt.toolCallId);
    }
    queue.push(event);
    if (
      event.type === 'agent:complete' ||
      event.type === 'error' ||
      event.type === 'message:complete'
    ) {
      done = true;
    }
    notify?.();
  };

  const onEvent = (event: HarnessEvent): void => {
    if (disposed) return;
    const mapped = mapHarnessEvent(event, {
      messageId: opts.messageId,
      resolveMessageId: opts.resolveMessageId,
      hostPresentations,
      sawReasoning,
    });
    for (const e of mapped) push(e);
    // Set after mapping, so the terminal event's own UI events are queued and
    // yielded before the iteration ends. `events()` drains the queue first.
    if (TERMINAL_HARNESS_EVENTS.has(event.type)) {
      done = true;
      notify?.();
    }
  };

  // Registered before the host starts the run, so a prompt raised on the very
  // first step is not dropped.
  agent.onAny(onEvent);

  return {
    async *events(): AsyncGenerator<ChatStreamEvent, void, void> {
      for (;;) {
        while (queue.length > 0) {
          const event = queue.shift()!;
          yield event;
        }
        if (done) return;
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
        notify = null;
      }
    },

    map: (event: HarnessEvent) =>
      mapHarnessEvent(event, {
        messageId: opts.messageId,
        resolveMessageId: opts.resolveMessageId,
        hostPresentations,
        sawReasoning,
      }),

    answer(response: ChatPromptResponse): void | Promise<void> {
      const prompt = pending.get(response.toolCallId);
      if (!prompt) {
        throw new Error(
          `No pending ${response.kind} prompt for tool call ${response.toolCallId}. ` +
            `The run may already have moved on.`,
        );
      }

      // Close the prompt on this side rather than waiting to hear about it.
      // The harness echoes `ask_user.response` for an answered question and
      // `mcp.resolved` for an MCP decision, but emits nothing at all for a
      // resolved permission, so a host that only listened would leave the
      // dialog on screen with the run long finished. Emitting here also means
      // the card collapses immediately instead of after the next unrelated
      // event. The echo that follows is dropped by push(): the prompt is no
      // longer pending.
      const mcpDecision = mcpDecisionFor(response, prompt);
      const resolved =
        response.kind === 'ask'
          ? { status: 'answered' as const, answer: String(response.answer) }
          : response.kind === 'mcp_approval'
            ? { status: 'answered' as const, answer: mcpDecision!.action, mcpDecision }
            : {
                status: 'answered' as const,
                decision: response.answer === 'allow' ? ('allow' as const) : ('deny' as const),
              };
      push({
        type: 'prompt:resolved',
        prompt: {
          toolCallId: response.toolCallId,
          kind: response.kind,
          question: prompt.question,
          ...resolved,
        },
      });

      if (response.kind === 'ask') {
        if (!agent.respond) throw new Error('This agent cannot answer ask_user pauses.');
        return agent.respond(response.toolCallId, String(response.answer));
      }
      if (response.kind === 'mcp_approval') {
        if (!agent.resolveMcpDecision) {
          throw new Error('This agent cannot answer MCP approval pauses.');
        }
        return agent.resolveMcpDecision(response.toolCallId, mcpDecision!);
      }
      const decision = response.answer === 'allow' ? 'allow' : 'deny';
      if (!agent.resolvePermission) {
        throw new Error('This agent cannot answer permission pauses.');
      }
      return agent.resolvePermission(response.toolCallId, decision);
    },

    get pending() {
      return pending;
    },

    dispose(): void {
      disposed = true;
      pending.clear();
      notify?.();
    },
  };
}
