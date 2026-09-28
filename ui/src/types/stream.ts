import type { ChatArtifact } from './artifact';
import type { ChatSource } from './source';
import type { ToolCall } from './tool';
import type { ToolPresentation } from './tools';
import type { ChatPrompt, ChatPromptEvent } from './prompt';

/**
 * Normalized, provider-agnostic token usage.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model?: string;
  details?: Record<string, unknown>;
}

/**
 * Which subsystem produced the failure. Mirrors `AgentErrorLayer` in the
 * harness so a `run.failed` payload needs no translation.
 */
export type ChatErrorLayer = 'provider' | 'tool' | 'run' | 'hook' | 'permission' | 'transport';

/**
 * How serious the failure is. Drives colour, icon and which action is offered:
 *   info    — surfaced, nothing is broken
 *   warning — degraded, the run continues
 *   error   — an operation failed, the run may recover
 *   fatal   — the run is over
 */
export type ChatErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

/**
 * Structured error surfaced to the UI (never "fetch failed").
 *
 * `code`, `message` and `retryable` are the original three fields; `layer`,
 * `severity` and `hint` are what let the UI treat a rate limit, a denied
 * permission and a loop guard differently instead of showing one red banner
 * for everything.
 */
export interface ChatErrorInfo {
  code: string;
  message: string;
  retryable: boolean;
  /** Defaults to `run` when the producer did not say. */
  layer?: ChatErrorLayer;
  /** Defaults to `error` when the producer did not say. */
  severity?: ChatErrorSeverity;
  /** Actionable next step for the user, e.g. "try a different provider". */
  hint?: string;
  details?: unknown;
}

const LAYERS: ReadonlySet<string> = new Set(['provider', 'tool', 'run', 'hook', 'permission', 'transport']);
const SEVERITIES: ReadonlySet<string> = new Set(['info', 'warning', 'error', 'fatal']);

/**
 * Best-effort classification of a bare error string.
 *
 * The harness emits structured errors, but a transport can still hand us a
 * plain string (older servers, a proxy that only relays text, a thrown
 * `Error`). Rather than showing every unknown as a fatal run failure, look for
 * the handful of signals that change the right response: a dropped connection
 * is a warning you can retry, an auth failure is fatal, a rate limit is
 * retryable.
 */
function inferFromText(
  text: string,
): Pick<ChatErrorInfo, 'layer' | 'severity' | 'retryable'> & { code?: string } {
  if (/socket|websocket|disconnect|network|offline|connection (?:closed|lost|reset)|econnreset|failed to fetch/i.test(text)) {
    return { layer: 'transport', severity: 'warning', retryable: true, code: 'transport_disconnected' };
  }
  if (/permission denied|access denied|forbidden|not allowed|unauthori[sz]ed/i.test(text)) {
    return { layer: 'permission', severity: 'warning', retryable: true, code: 'permission_denied' };
  }
  if (/rate.?limit|429|too many requests|quota|overloaded/i.test(text)) {
    return { layer: 'provider', severity: 'error', retryable: true, code: 'provider_rate_limited' };
  }
  if (/api key|unauthorized|401|403|free ?tier/i.test(text)) {
    return { layer: 'provider', severity: 'fatal', retryable: false, code: 'provider_auth' };
  }
  if (/timed? ?out|timeout|stalled/i.test(text)) {
    return { layer: 'provider', severity: 'error', retryable: true, code: 'provider_timeout' };
  }
  if (/cancell?ed|aborted/i.test(text)) {
    return { layer: 'run', severity: 'info', retryable: true, code: 'run_cancelled' };
  }
  return { layer: 'run', severity: 'error', retryable: true };
}

/**
 * Coerce anything error-shaped into a complete `ChatErrorInfo`.
 *
 * Missing `layer`/`severity` are inferred from the code and then the message,
 * so partially populated payloads (and legacy strings) still render sensibly
 * rather than silently defaulting to a hard failure.
 */
export function toChatError(
  input: ChatErrorInfo | string | undefined | null,
  fallback: Partial<ChatErrorInfo> = {},
): ChatErrorInfo {
  if (typeof input === 'string') {
    const message = input.trim() || fallback.message || 'Something went wrong.';
    const guess = inferFromText(message);
    return {
      code: fallback.code ?? guess.code ?? 'error',
      message,
      retryable: fallback.retryable ?? guess.retryable,
      layer: fallback.layer ?? guess.layer,
      severity: fallback.severity ?? guess.severity,
      ...(fallback.hint ? { hint: fallback.hint } : {}),
      ...(fallback.details !== undefined ? { details: fallback.details } : {}),
    };
  }

  const message = (input?.message ?? fallback.message ?? 'Something went wrong.').trim() || 'Something went wrong.';
  // Prefer what the producer sent; fall back to the code, then to the text.
  const guess = inferFromText(`${input?.code ?? ''} ${message}`);
  const layer =
    (input?.layer && LAYERS.has(input.layer) ? input.layer : undefined) ??
    (fallback.layer && LAYERS.has(fallback.layer) ? fallback.layer : undefined) ??
    guess.layer;
  const severity =
    (input?.severity && SEVERITIES.has(input.severity) ? input.severity : undefined) ??
    (fallback.severity && SEVERITIES.has(fallback.severity) ? fallback.severity : undefined) ??
    guess.severity;

  return {
    code: input?.code ?? fallback.code ?? guess.code ?? 'error',
    message,
    retryable: input?.retryable ?? fallback.retryable ?? guess.retryable,
    layer,
    severity,
    ...(input?.hint ?? fallback.hint ? { hint: input?.hint ?? fallback.hint } : {}),
    ...(input?.details ?? fallback.details ? { details: input?.details ?? fallback.details } : {}),
  };
}

/** The connection status reported by transports via `connection:status`. */
export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'offline'
  | 'restored'
  | 'unknown';

/**
 * A normalized chat stream event. Any backend — OpenAI, Anthropic, Gemini,
 * OpenRouter, LangGraph, MCP, an internal agent — can be adapted to this
 * protocol. The UI never talks to a specific provider.
 *
 * Transports yield these events; the runtime folds them into `ChatMessage`.
 */
export type ChatStreamEvent =
  | { type: 'message:start'; messageId: string; conversationId?: string; model?: string }
  | { type: 'text:delta'; messageId?: string; delta: string }
  | { type: 'reasoning:start'; messageId?: string }
  | { type: 'reasoning:delta'; messageId?: string; delta: string }
  | {
      type: 'tool:start';
      messageId?: string;
      toolCallId: string;
      toolName: string;
      input?: unknown;
      /** Icon/label declared by the tool, when it ships any. */
      presentation?: ToolPresentation;
    }
  | { type: 'tool:delta'; messageId?: string; toolCallId: string; delta?: unknown }
  | { type: 'tool:result'; messageId?: string; toolCallId: string; result?: unknown }
  /**
   * A tool call failed. Unlike `error` this is scoped to one tool call: it
   * sets that call's status and error in place, and never ends the run.
   */
  | { type: 'tool:error'; messageId?: string; toolCallId: string; error: ChatErrorInfo | string }
  /**
   * The run is blocked on the user. Non-terminal: the stream stays open and
   * resumes when the answer comes back.
   */
  | {
      type: 'prompt:ask' | 'prompt:permission' | 'prompt:mcp_approval';
      messageId?: string;
      prompt: ChatPromptEvent;
    }
  /** The user answered (or the prompt was cancelled). Closes the prompt. */
  | { type: 'prompt:resolved'; messageId?: string; prompt: Partial<ChatPrompt> & { toolCallId: string } }
  | { type: 'artifact'; messageId?: string; artifact: ChatArtifact }
  | { type: 'source'; messageId?: string; source: ChatSource }
  | { type: 'usage'; messageId?: string; usage: TokenUsage }
  | { type: 'agent:start'; messageId?: string; agentId?: string }
  | {
      type: 'agent:step';
      messageId?: string;
      stepId?: string;
      title: string;
      status: 'running' | 'complete' | 'error';
    }
  | { type: 'agent:complete'; messageId?: string }
  | { type: 'connection:status'; status: Exclude<ConnectionStatus, 'unknown'> }
  | { type: 'message:complete'; messageId: string }
  /**
   * A failure the run recovered from, or one that is still retrying. Unlike
   * `error` this is NOT terminal: the transport keeps the stream open and the
   * message stays `streaming`, so a provider rate limit appears immediately
   * instead of only after the run finally gives up.
   */
  | { type: 'notice'; messageId?: string; error: ChatErrorInfo | string }
  /** Terminal failure: the message is marked `error` and the stream closes. */
  | { type: 'error'; messageId?: string; error: ChatErrorInfo | string };

/** Resolve the message an event targets, falling back to the stream owner. */
export function eventMessageId(event: ChatStreamEvent, fallback: string): string {
  if ('messageId' in event && typeof (event as { messageId?: string }).messageId === 'string') {
    return (event as { messageId: string }).messageId;
  }
  return fallback;
}

export function isToolCall(value: unknown): value is ToolCall {
  return (
    !!value &&
    typeof value === 'object' &&
    'id' in (value as object) &&
    'name' in (value as object) &&
    'status' in (value as object)
  );
}