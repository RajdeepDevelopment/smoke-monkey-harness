// ══════════════════════════════════════════════════════════════
// AGENT LIFECYCLE HOOKS
//
// Extension points around the two things an agent spends its time
// on: talking to the model, and running tools. They are the seam an
// embedding application needs for logging, metrics, tracing, cost
// accounting, authorization, approval, and custom policy — without
// forking the loop.
//
// Semantics, in one place:
//
//   • Each point takes a single hook; compose several concerns (authz +
//     logging + metrics) yourself if you need more than one, and await them
//     in the order you want them to run.
//   • `before*` hooks are fail-CLOSED: if one throws, the call is
//     blocked with the error as the reason. An authz hook that
//     crashes must not fail open.
//   • `after*` hooks are fail-OPEN: the work is already done, so a
//     throwing hook is logged and ignored.
//   • A `before*` hook can REPLACE its payload (`messages`, `tools`,
//     `input`) or BLOCK the call with a reason.
//   • Blocking a tool call feeds the reason back to the model as a
//     failed tool result, so the agent can adapt. Blocking a model
//     call aborts the run.
// ══════════════════════════════════════════════════════════════
import { Logger } from '../logger.js';
import type { LLMResponse } from './llm-client.js';
import type { LLMMessage } from './run-context.js';
import type { LLMToolDef } from './tool-library.js';
import type { ToolResult } from '../tools/tool-registry.js';

export type { ToolResult };

type MaybePromise<T> = T | Promise<T>;

/** Identifies the run a hook invocation belongs to. */
export interface HookRunInfo {
  sessionId: string;
  runId: string;
  userId?: string;
  workspacePath?: string;
}

/** What a `beforeModelCall` hook sees. `messages` is the exact payload sent. */
export interface BeforeModelCallContext extends HookRunInfo {
  /** 0-based step within the run. */
  step: number;
  provider?: string;
  model?: string;
  messages: LLMMessage[];
  tools: LLMToolDef[];
}

/**
 * Return value of a `beforeModelCall` hook.
 * - omit everything to allow the call unchanged
 * - `messages` / `tools` replace the outgoing payload
 * - `block: true` aborts the run
 */
export interface BeforeModelCallResult {
  messages?: LLMMessage[];
  tools?: LLMToolDef[];
  block?: boolean;
  /** Why the call was blocked. Surfaced to the user; defaults to a generic message. */
  reason?: string;
}

/** What an `afterModelCall` hook sees. Fires once per attempt, including failures. */
export interface AfterModelCallContext extends HookRunInfo {
  step: number;
  provider?: string;
  model?: string;
  /** The response, absent when `error` is set. */
  response?: LLMResponse;
  /** The provider error, when the attempt failed. */
  error?: Error;
  durationMs: number;
  /** Token usage as reported by the provider, when available. */
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** What a `beforeToolCall` hook sees. `input` is the parsed tool arguments. */
export interface BeforeToolCallContext extends HookRunInfo {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

/**
 * Return value of a `beforeToolCall` hook.
 * - omit everything to allow the call unchanged
 * - `input` replaces the tool arguments
 * - `block: true` denies the call; the reason reaches the model
 */
export interface BeforeToolCallResult {
  input?: Record<string, unknown>;
  block?: boolean;
  /** Why the call was denied. Fed back to the model as the tool result. */
  reason?: string;
}

/**
 * What an `afterToolCall` hook sees. Fires for every tool call that
 * started, including blocked, errored, and cancelled ones.
 */
export interface AfterToolCallContext extends HookRunInfo {
  toolCallId: string;
  toolName: string;
  /** The arguments the tool actually ran with, after any hook rewrite. */
  input: Record<string, unknown>;
  /** The final tool result, absent when the call never produced one. */
  result?: ToolResult;
  /** Set when execution threw or the call was blocked/denied upstream. */
  error?: Error;
  durationMs: number;
  /** True when a `beforeToolCall` hook or the permission layer denied the call. */
  blocked: boolean;
}

export interface AgentHooks {
  /** Runs before every model request. Can rewrite the payload or abort the run. */
  beforeModelCall?(ctx: BeforeModelCallContext): MaybePromise<BeforeModelCallResult | void>;
  /** Runs after every model attempt, including failed ones. Observability only. */
  afterModelCall?(ctx: AfterModelCallContext): MaybePromise<void>;
  /**
   * Runs before a tool executes — ahead of the permission prompt, so an
   * authorization hook can reject a call without bothering the user. Can
   * rewrite the arguments or deny the call.
   */
  beforeToolCall?(ctx: BeforeToolCallContext): MaybePromise<BeforeToolCallResult | void>;
  /** Runs after a tool call settles. Observability only. */
  afterToolCall?(ctx: AfterToolCallContext): MaybePromise<void>;
}

/** Normalized outcome of a `before*` hook chain. */
export type BeforeHookOutcome<T> =
  | { action: 'allow'; value: T }
  | { action: 'block'; reason: string };

const BLOCKED_DEFAULT = 'Blocked by an agent hook.';

/**
 * Runs the configured hooks and applies the failure policy documented at the
 * top of this file.
 *
 * A runner with no hooks is a no-op, so the loop can call it
 * unconditionally.
 */
export class AgentHookRunner {
  private readonly logger = new Logger(AgentHookRunner.name);

  constructor(private readonly hooks: AgentHooks = {}) {}

  get hasHooks(): boolean {
    return Boolean(
      this.hooks.beforeModelCall ||
      this.hooks.afterModelCall ||
      this.hooks.beforeToolCall ||
      this.hooks.afterToolCall,
    );
  }

  async beforeModelCall(ctx: BeforeModelCallContext): Promise<BeforeHookOutcome<{ messages: LLMMessage[]; tools: LLMToolDef[] }>> {
    let messages = ctx.messages;
    let tools = ctx.tools;

    if (!this.hooks.beforeModelCall) return { action: 'allow', value: { messages, tools } };

    try {
      const res = await this.hooks.beforeModelCall(ctx);
      if (!res) return { action: 'allow', value: { messages, tools } };
      if (res.block) return { action: 'block', reason: res.reason?.trim() || 'Blocked by beforeModelCall.' };
      if (res.messages) messages = res.messages;
      if (res.tools) tools = res.tools;
    } catch (err) {
      // Fail closed: a crashing guard must not become an allow.
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`beforeModelCall hook threw — treating as a block: ${reason}`);
      return { action: 'block', reason };
    }

    return { action: 'allow', value: { messages, tools } };
  }

  async afterModelCall(ctx: AfterModelCallContext): Promise<void> {
    if (!this.hooks.afterModelCall) return;
    try {
      await this.hooks.afterModelCall(ctx);
    } catch (err) {
      this.logger.warn(`afterModelCall hook failed (ignored): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async beforeToolCall(ctx: BeforeToolCallContext): Promise<BeforeHookOutcome<Record<string, unknown>>> {
    if (!this.hooks.beforeToolCall) return { action: 'allow', value: ctx.input };

    try {
      const res = await this.hooks.beforeToolCall(ctx);
      if (!res) return { action: 'allow', value: ctx.input };
      if (res.block) return { action: 'block', reason: res.reason?.trim() || 'Blocked by beforeToolCall.' };
      if (res.input) return { action: 'allow', value: res.input };
    } catch (err) {
      // Fail closed: an authz hook that crashes must not let the call through.
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`beforeToolCall hook threw — treating as a denial: ${reason}`);
      return { action: 'block', reason };
    }

    return { action: 'allow', value: ctx.input };
  }

  async afterToolCall(ctx: AfterToolCallContext): Promise<void> {
    if (!this.hooks.afterToolCall) return;
    try {
      await this.hooks.afterToolCall(ctx);
    } catch (err) {
      this.logger.warn(`afterToolCall hook failed (ignored): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** Marker for a run aborted by a `beforeModelCall` hook. */
export class HookBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HookBlockedError';
  }
}

export { BLOCKED_DEFAULT };
