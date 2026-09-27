import type { ChatStreamEvent } from '../types/stream';
import { toChatError } from '../types/stream';
import type { StreamParserFn } from './StreamParser';

/**
 * The shape the harness emits on `run.*` / `tool.failed` events.
 *
 * `errorInfo` is the structured form; `error` is the legacy string that is
 * still emitted alongside it for older consumers.
 */
interface AgentEventPayload {
  type?: string;
  toolCallId?: string;
  error?: string;
  errorInfo?: unknown;
  reason?: string;
  [key: string]: unknown;
}

export interface AgentEventParserOptions {
  /**
   * The message the run belongs to. Needed because run/tool events carry only
   * session + run ids, so the transport has to know which message to attach the
   * error to.
   */
  messageId?: string;
  /** Map a harness payload onto a message id when it provides one. */
  resolveMessageId?: (payload: AgentEventPayload) => string | undefined;
}

function messageIdFor(
  payload: AgentEventPayload,
  opts: AgentEventParserOptions,
): string | undefined {
  return opts.resolveMessageId?.(payload) ?? opts.messageId;
}

/**
 * Translate the harness's `run.*` / `tool.failed` events into normalized
 * `ChatStreamEvent`s.
 *
 * This is the piece that makes error handling work end to end: the harness
 * classifies a failure, this maps it onto the right normalized event, and the
 * reducer puts it on the right surface.
 *
 * The mapping is deliberately not flat:
 *   - `run.warning`      → `notice`  (non-terminal; the run is still retrying)
 *   - `tool.failed`      → `tool:error` (scoped to one call, run continues)
 *   - `run.interrupted`  → `notice`  (informational)
 *   - `run.failed`       → `error`   (terminal; closes the stream)
 *
 * Usage:
 * ```ts
 * const parser = new StreamParser();
 * for (const [type, fn] of Object.entries(createAgentEventParsers({ messageId }))) {
 *   parser.register(type, fn);
 * }
 * ```
 */
export function createAgentEventParsers(
  opts: AgentEventParserOptions = {},
): Record<string, StreamParserFn> {
  const errorOf = (payload: AgentEventPayload, fallback: Partial<Parameters<typeof toChatError>[1]>) =>
    toChatError((payload.errorInfo as never) ?? payload.error ?? '', fallback);

  return {
    /**
     * The run is blocked on the user. This is the event that keeps a browser
     * host from deadlocking: without it the run stops on `ask_user.required`
     * and the only way to resume is a server-side call the browser cannot make.
     */
    'ask_user.required': (data): ChatStreamEvent => {
      const p = data as AgentEventPayload;
      const raw = Array.isArray(p.options) ? p.options : [];
      return {
        type: 'prompt:ask',
        messageId: messageIdFor(p, opts),
        prompt: {
          kind: 'ask',
          toolCallId: String(p.toolCallId ?? ''),
          question: String(p.question ?? ''),
          // The harness sends bare strings; normalise to option objects so the
          // card does not have to know which producer it is talking to.
          options: raw.map((o) =>
            typeof o === 'string' ? { value: o } : { value: String((o as { value?: unknown })?.value ?? o) },
          ),
          multiple: Boolean(p.multiple),
        },
      };
    },
    'ask_user.response': (data): ChatStreamEvent => {
      const p = data as AgentEventPayload;
      return {
        type: 'prompt:resolved',
        messageId: messageIdFor(p, opts),
        prompt: {
          toolCallId: String(p.toolCallId ?? ''),
          status: 'answered',
          answer: String(p.response ?? ''),
        },
      };
    },
    'permission.required': (data): ChatStreamEvent => {
      const p = data as AgentEventPayload;
      return {
        type: 'prompt:permission',
        messageId: messageIdFor(p, opts),
        prompt: {
          kind: 'permission',
          toolCallId: String(p.toolCallId ?? ''),
          question: `Allow ${String(p.toolName ?? 'this tool')} to run?`,
          toolName: String(p.toolName ?? ''),
          input: p.args,
        },
      };
    },

    // Non-terminal: the loop hit a provider error and is still retrying, so the
    // user sees a warning immediately instead of only after the run gives up.
    'run.warning': (data): ChatStreamEvent => {
      const p = data as AgentEventPayload;
      return {
        type: 'notice',
        messageId: messageIdFor(p, opts),
        error: toChatError((p.errorInfo as never) ?? p.error ?? '', {
          layer: 'run',
          severity: 'warning',
          retryable: true,
        }),
      };
    },

    // The run was interrupted (user stop, shutdown). Informational.
    'run.interrupted': (data): ChatStreamEvent => {
      const p = data as AgentEventPayload;
      return {
        type: 'notice',
        messageId: messageIdFor(p, opts),
        error: errorOf(p, { code: 'run_interrupted', layer: 'run', severity: 'info', retryable: true }),
      };
    },

    // One tool call failed. Scoped to the call — the run keeps going.
    'tool.failed': (data): ChatStreamEvent | null => {
      const p = data as AgentEventPayload;
      if (!p.toolCallId) return null;
      return {
        type: 'tool:error',
        messageId: messageIdFor(p, opts),
        toolCallId: p.toolCallId,
        error: toChatError((p.errorInfo as never) ?? p.error ?? '', {
          layer: 'tool',
          severity: 'error',
          retryable: true,
        }),
      };
    },

    // Terminal: the run is over. This is the only error event that should end
    // the stream, so the UI can offer a real retry here.
    'run.failed': (data): ChatStreamEvent => {
      const p = data as AgentEventPayload;
      return {
        type: 'error',
        messageId: messageIdFor(p, opts),
        error: toChatError((p.errorInfo as never) ?? p.error ?? '', {
          code: 'run_failed',
          layer: 'run',
          severity: 'fatal',
          retryable: true,
        }),
      };
    },
  };
}
