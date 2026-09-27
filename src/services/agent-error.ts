/**
 * The canonical agent error model.
 *
 * Previously every failure left the loop as a bare string, so a provider rate
 * limit, a denied permission and a loop guard all reached the UI as an
 * identical red banner. Consumers had to pattern-match prose to work out what
 * actually happened and whether a retry could possibly help.
 *
 * An `AgentErrorInfo` answers three questions without any string matching:
 *   - WHERE  did it fail?        `layer`
 *   - HOW BAD is it?            `severity`
 *   - CAN THE USER DO ANYTHING? `retryable` + `hint`
 *
 * `message` stays user-facing and safe to render directly: it never contains a
 * stack trace, and provider responses are summarised rather than echoed.
 */

/** Which subsystem produced the failure. Drives grouping and icon choice in the UI. */
export type AgentErrorLayer =
  | 'provider'   // the model / provider request itself (rate limit, auth, timeout, 5xx)
  | 'tool'       // a specific tool call failed or was refused
  | 'run'        // a guard stopped the whole run (loop, empty responses, mutation cap)
  | 'hook'       // an agent hook blocked the call
  | 'permission' // a permission policy or the user refused access
  | 'transport'; // the event stream / socket could not deliver the update

/**
 * How serious the failure is.
 *   info     — worth surfacing, nothing is broken (a blocked tool the model worked around)
 *   warning  — degraded but the run continues
 *   error    — an operation failed, the run may still recover
 *   fatal    — the run is over, retrying the same request will not help
 */
export type AgentErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

/** Stable machine-readable code, e.g. `provider_rate_limited`. Never shown raw as the headline. */
export interface AgentErrorInfo {
  code: string;
  layer: AgentErrorLayer;
  severity: AgentErrorSeverity;
  /** User-facing one-liner. Safe to render; no stack traces, no raw provider dumps. */
  message: string;
  /** Whether retrying the identical operation could plausibly succeed. */
  retryable: boolean;
  /** Optional actionable next step for the user, e.g. "try a different provider". */
  hint?: string;
  /** Machine-readable extras for debugging. Never rendered without being opened. */
  details?: unknown;
}

const isSeverity = (v: unknown): v is AgentErrorSeverity =>
  v === 'info' || v === 'warning' || v === 'error' || v === 'fatal';

const isLayer = (v: unknown): v is AgentErrorLayer =>
  v === 'provider' || v === 'tool' || v === 'run' || v === 'hook' || v === 'permission' || v === 'transport';

/**
 * Normalise anything error-shaped into a complete `AgentErrorInfo`.
 *
 * Accepts a bare string (legacy call sites, transports, and third-party
 * integrations that predate this model) so nothing has to be migrated in one
 * go. Missing fields are inferred conservatively: an unrecognised error is an
 * `error`-severity `run` failure and is treated as retryable, matching the
 * behaviour the UI had when every error collapsed to `{ code: 'error' }`.
 */
export function toAgentErrorInfo(
  input: string | Partial<AgentErrorInfo> | undefined | null,
  fallback: Partial<AgentErrorInfo> = {},
): AgentErrorInfo {
  if (typeof input === 'string') {
    return {
      code: fallback.code ?? 'error',
      layer: fallback.layer ?? 'run',
      severity: fallback.severity ?? 'error',
      // A whitespace-only string is not a usable message, so fall through to
      // the fallback rather than rendering an empty banner.
      message: input.trim() || fallback.message || 'Something went wrong.',
      retryable: fallback.retryable ?? true,
      ...(fallback.hint ? { hint: fallback.hint } : {}),
      ...(fallback.details !== undefined ? { details: fallback.details } : {}),
    };
  }
  const message = (input?.message ?? fallback.message ?? 'Something went wrong.').trim();
  return {
    code: input?.code ?? fallback.code ?? 'error',
    layer: isLayer(input?.layer) ? input.layer : (fallback.layer ?? 'run'),
    severity: isSeverity(input?.severity) ? input.severity : (fallback.severity ?? 'error'),
    message: message || 'Something went wrong.',
    retryable: input?.retryable ?? fallback.retryable ?? true,
    ...(input?.hint ?? fallback.hint ? { hint: input?.hint ?? fallback.hint } : {}),
    ...(input?.details ?? fallback.details
      ? { details: input?.details ?? fallback.details }
      : {}),
  };
}

/** Pull a useful message out of an unknown throwable. */
export function errorMessageOf(err: unknown): string {
  if (typeof err === 'string') return err.trim();
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  return String(err ?? 'Unknown error');
}

const modelLabel = (modelName?: string, fallback?: string) => `\`${modelName || fallback || 'your selected model'}\``;

/**
 * Classify a provider failure into the structured model.
 *
 * This is the structured twin of the loop's `formatProviderError`: the human
 * sentence is preserved exactly so existing messaging does not change, while
 * the layer/severity/retryability become machine-readable.
 */
export function classifyProviderError(raw: string, modelName?: string): AgentErrorInfo {
  const msg = (raw || '').trim();
  const model =
    /(?:^|[/\s])(oc|cfp|auto|openpipe|omniroute)\/([A-Za-z0-9._-]+)/i.exec(msg)?.[2] ||
    /model\s*[:=]\s*["']?([A-Za-z0-9._/-]+)["']?/i.exec(msg)?.[1] ||
    /([A-Za-z0-9_.-]+\/[A-Za-z0-9_.:-]+)/i.exec(msg)?.[1];
  const status = /\b(429|403|401|408|500|502|503|504|520|529)\b/.exec(msg)?.[1];
  const isRate = /rate.?limit|too many|overloaded|429|quota|insufficient_quota/i.test(msg);
  const isAuth = /403|forbidden|unauthorized|invalid (?:api|access) key|permission|free ?tier/i.test(msg);
  const isTimeout = /timeout|timed out|stalled|no tokens|etimedout|idle/i.test(msg);
  const isServer = !!status && /^5/.test(status);
  const isCancelled = /abort|cancel/i.test(msg);

  const base = { layer: 'provider' as const, details: { status: status ?? null, raw: msg.slice(0, 200) } };

  if (isCancelled) {
    return {
      ...base, code: 'provider_cancelled', severity: 'info', retryable: true,
      message: 'The model request was cancelled.',
      hint: 'Send your message again to retry.',
    };
  }
  if (isRate) {
    return {
      ...base, code: 'provider_rate_limited', severity: 'error', retryable: true,
      message: `Model ${modelLabel(modelName, model)} is rate-limited (429); wait a moment and try again.`,
      hint: 'Wait about a minute, or pick a different provider.',
    };
  }
  if (isAuth) {
    return {
      ...base, code: 'provider_auth', severity: 'fatal', retryable: false,
      message: `Model ${modelLabel(modelName, model)} refused the request (403 — free-tier/permission); pick a different provider or retry later.`,
      hint: 'Check the provider API key and its access tier.',
    };
  }
  if (isTimeout) {
    return {
      ...base, code: 'provider_timeout', severity: 'error', retryable: true,
      message: `Model ${modelLabel(modelName, model)} timed out (no tokens for a while); try again.`,
      hint: 'A smaller task or a faster provider usually avoids this.',
    };
  }
  if (isServer) {
    return {
      ...base, code: 'provider_unavailable', severity: 'error', retryable: true,
      message: `Model ${modelLabel(modelName, model)} returned an error from the provider (${status}).`,
      hint: 'This is usually a provider outage — retrying shortly often works.',
    };
  }
  if (!msg) {
    return {
      ...base, code: 'provider_empty_error', severity: 'error', retryable: true,
      message: 'The model returned an empty error from the provider.',
      hint: 'Retry the request.',
    };
  }
  return {
    ...base, code: 'provider_error', severity: 'error', retryable: true,
    message: `Model ${modelLabel(modelName, model)} returned an error from the provider${status ? ` (${status})` : ''}: ${msg.slice(0, 120)}`,
  };
}

/* ------------------------------------------------------------------ *
 * Tool-layer errors
 * ------------------------------------------------------------------ */

export function toolNotFoundError(toolName: string, phase?: string): AgentErrorInfo {
  return {
    code: 'tool_not_found',
    layer: 'tool',
    severity: 'error',
    message: phase
      ? `\`${toolName}\` is not allowed in the ${phase} phase.`
      : `Tool \`${toolName}\` was not found.`,
    retryable: false,
    hint: 'The model needs a tool that is available in this phase.',
  };
}

export function toolBlockedError(toolName: string, reason: string): AgentErrorInfo {
  return {
    code: 'tool_blocked',
    layer: 'tool',
    severity: 'warning',
    message: `\`${toolName}\` was blocked: ${reason}`,
    retryable: false,
    hint: 'A safety or policy check stopped this call. The model was told and can try another approach.',
  };
}

export function toolCancelledError(toolName: string): AgentErrorInfo {
  return {
    code: 'tool_cancelled',
    layer: 'tool',
    severity: 'info',
    message: `\`${toolName}\` was cancelled before it finished.`,
    retryable: true,
  };
}

export function toolFailedError(toolName: string, reason: string): AgentErrorInfo {
  return {
    code: 'tool_failed',
    layer: 'tool',
    severity: 'error',
    message: `\`${toolName}\` failed: ${reason}`,
    retryable: true,
  };
}

export function toolError(code: string, message: string, opts: Partial<AgentErrorInfo> = {}): AgentErrorInfo {
  return toAgentErrorInfo({ code, layer: 'tool', message, ...opts });
}

export function permissionDeniedError(reason: string, toolName?: string): AgentErrorInfo {
  return {
    code: 'permission_denied',
    layer: 'permission',
    severity: 'warning',
    message: toolName ? `Permission denied for \`${toolName}\` — ${reason}` : `Permission denied — ${reason}`,
    retryable: true,
    hint: 'Grant access, or ask for a different path.',
  };
}

/* ------------------------------------------------------------------ *
 * Run-layer errors
 * ------------------------------------------------------------------ */

export function runHardStopError(reason: string, hint?: string): AgentErrorInfo {
  return {
    code: 'run_hard_stop',
    layer: 'run',
    severity: 'fatal',
    message: reason,
    retryable: false,
    ...(hint ? { hint } : {}),
  };
}

export function repeatedErrorError(message: string): AgentErrorInfo {
  return {
    code: 'run_repeated_error',
    layer: 'run',
    severity: 'fatal',
    message,
    retryable: false,
    hint: 'The same failure kept repeating, so the run stopped to avoid burning tokens.',
  };
}

export function emptyResponseError(modelName?: string): AgentErrorInfo {
  return {
    code: 'run_empty_responses',
    layer: 'run',
    severity: 'fatal',
    message: `Model ${modelLabel(modelName)} returned empty responses repeatedly`,
    retryable: true,
    hint: 'Most often a rate limit or exhausted quota (HTTP 429). Wait a moment and retry.',
    details: { likelyStatus: 429 },
  };
}

/* ------------------------------------------------------------------ *
 * Hook-layer errors
 * ------------------------------------------------------------------ */

export function hookBlockedError(hook: string, reason: string, layer: AgentErrorLayer = 'hook'): AgentErrorInfo {
  return {
    code: 'hook_blocked',
    layer,
    severity: layer === 'tool' ? 'warning' : 'fatal',
    message: reason,
    retryable: false,
    hint: `Blocked by the \`${hook}\` hook.`,
    details: { hook },
  };
}

export function hookFailedError(hook: string, err: unknown): AgentErrorInfo {
  return {
    code: 'hook_failed',
    layer: 'hook',
    severity: 'fatal',
    message: `The \`${hook}\` hook threw an error.`,
    retryable: false,
    hint: 'Before-hooks fail closed, so the run was stopped. Check the hook implementation.',
    details: { hook, cause: errorMessageOf(err) },
  };
}

/* ------------------------------------------------------------------ *
 * Transport-layer errors
 * ------------------------------------------------------------------ */

export function transportError(code: string, message: string, opts: Partial<AgentErrorInfo> = {}): AgentErrorInfo {
  return toAgentErrorInfo({ code, layer: 'transport', message, severity: 'warning', retryable: true, ...opts });
}

export function connectionLostError(reason?: string): AgentErrorInfo {
  return {
    code: 'transport_disconnected',
    layer: 'transport',
    severity: 'warning',
    message: reason ? `Lost the event connection — ${reason}` : 'Lost the event connection.',
    retryable: true,
    hint: 'Messages already received are safe. Reconnect to continue the run.',
  };
}
