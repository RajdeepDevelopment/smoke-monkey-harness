import { createId } from '../lib/id';
import { applyChatEvent } from './EventReducer';
import type { ChatMessage } from '../types/message';
import type { ChatStreamEvent, ConnectionStatus, ChatErrorInfo, TokenUsage } from '../types/stream';
import type { AgentTodo, ContextState } from '../types/agent';
import { normalizeContexts, normalizeTodos } from '../types/agent';
import type {
  ChatRequest,
  ChatRevertResult,
  ChatRuntimeOptions,
  ChatRuntimeState,
  ChatTransport,
} from '../types/transport';

/** Provider-agnostic chat engine. Owns message state, drives a
 * `ChatTransport`, folds normalized `ChatStreamEvent`s through
 * `applyChatEvent` and surfaces state changes via `onStateChange`.
 *
 * The runtime is framework-free; React hooks (`useChat`) subscribe to it.
 */
export class ChatRuntime {
  private messages: ChatMessage[] = [];
  private isStreaming = false;
  private streamingId: string | null = null;
  private conversationId: string | undefined;
  private error: ChatErrorInfo | null = null;
  private usage: TokenUsage | null = null;
  private connectionStatus: ConnectionStatus = 'unknown';
  private todos: AgentTodo[] = [];
  private contexts: ContextState | null = null;
  private controller: AbortController | null = null;
  private notify: (state: ChatRuntimeState) => void;
  private generation = 0;

  constructor(private options: ChatRuntimeOptions) {
    this.notify = options.onStateChange ?? (() => {});
    if (options.initialTodos) this.todos = [...options.initialTodos];
    if (options.initialContexts !== undefined) this.contexts = options.initialContexts;
  }

  /**
   * Rebind mutable options (`model`, `system`, `request`, `onStateChange`)
   * without replacing the instance — used by hooks on every render.
   */
  refresh(next: Partial<ChatRuntimeOptions>, onStateChange?: (state: ChatRuntimeState) => void): void {
    if (next.model !== undefined) this.options.model = next.model;
    if (next.system !== undefined) this.options.system = next.system;
    if (next.request !== undefined) this.options.request = next.request;
    if (next.initialTodos !== undefined && !this.todos.length) this.todos = [...next.initialTodos];
    if (next.initialContexts !== undefined && this.contexts === null) this.contexts = next.initialContexts;
    if (onStateChange) this.notify = onStateChange;
  }

  getState(): ChatRuntimeState {
    return {
      messages: this.messages,
      isStreaming: this.isStreaming,
      streamingMessage: this.streamingId
        ? (this.messages.find((m) => m.id === this.streamingId) ?? null)
        : null,
      conversationId: this.conversationId,
      error: this.error,
      usage: this.usage,
      connectionStatus: this.connectionStatus,
      hasMoreMessages: false,
      todos: this.todos,
      contexts: this.contexts,
    };
  }

  get hasStream() {
    return this.isStreaming;
  }

  get transport() {
    return this.options.transport;
  }

  /** Restore a conversation from the store, if one is configured. */
  async initialize(): Promise<void> {
    const id = this.options.conversationId ?? this.conversationId;
    const stored = this.options.store;
    if (!stored || !id) return;
    const messages = await stored.getMessages(id);
    if (messages.length) {
      this.messages = messages;
      this.conversationId = id;
      this.emit();
    }
  }

  /** Send a user turn. Returns without awaiting the full stream (`abort()` cancels). */
  send(text: string, providerOptions?: Record<string, unknown>): Promise<void> {
    if (!text.trim() || this.isStreaming) return Promise.resolve();
    const controller = this.controller ?? new AbortController();
    this.controller = controller;

    const userId = createId('msg');
    const streamId = createId('msg');
    const userMessage: ChatMessage = {
      id: userId,
      conversationId: this.conversationId,
      role: 'user',
      status: 'complete',
      content: text,
      parts: [{ type: 'text', content: text }],
      createdAt: new Date().toISOString(),
    };

    this.messages = [...this.messages, userMessage];
    this.error = null;
    const request: ChatRequest = {
      conversationId: this.conversationId,
      model: this.options.model,
      system: this.options.system,
      text,
      messages: this.messages,
      options: { ...(this.options.request?.options ?? {}), ...providerOptions },
      signal: controller.signal,
    };

    this.saveToStore(userMessage);

    return this.run({
      request,
      streamId,
      onEvent: (event) => {
        if (event.type === 'connection:status') {
          this.connectionStatus = event.status;
          return false;
        }
        return true;
      },
    }).catch((error) => {
      this.handleFatal(error, streamId);
    });
  }

  /** Cancel the in-flight request, if any. */
  stop(): void {
    if (!this.controller) return;
    this.generation += 1;
    const controller = this.controller;
    this.controller = null;
    controller.abort();
  }

  /**
   * Record an answer the user just gave, immediately.
   *
   * Sent optimistically, before the transport confirms anything: the card has
   * to reflect the click at once, or the user clicks twice. A backend that
   * also echoes the resolution (`ask_user.response`) is then simply agreeing
   * with what is already on screen — which is why this must not depend on that
   * echo arriving.
   */
  resolvePrompt(toolCallId: string, answer: string): void {
    let changed = false;
    const next = this.messages.map((message) => {
      const prompts = message.prompts;
      if (!prompts?.some((p) => p.toolCallId === toolCallId && p.status === 'pending')) return message;
      changed = true;
      const updated = prompts.map((p) =>
        p.toolCallId === toolCallId && p.status === 'pending'
          ? { ...p, status: 'answered' as const, answer, decision: undefined }
          : p,
      );
      return {
        ...message,
        prompts: updated,
        parts: (message.parts ?? []).map((part) =>
          part.type === 'prompt' &&
          part.prompt.toolCallId === toolCallId &&
          part.prompt.status === 'pending'
            ? { type: 'prompt' as const, prompt: { ...part.prompt, status: 'answered' as const, answer } }
            : part,
        ),
      };
    });
    if (changed) {
      this.messages = next;
      this.emit();
    }
  }

  /**
   * The harness run a user message can be rewound to, or `undefined` when it
   * cannot (no checkpoint was taken, an assistant message, or a transport
   * without `revert`).
   */
  revertTarget(messageId: string): string | undefined {
    if (!this.options.transport.revert) return undefined;
    const message = this.messages.find((m) => m.id === messageId);
    if (message?.role !== 'user') return undefined;
    const runId = message.metadata?.checkpointRunId;
    return typeof runId === 'string' && runId ? runId : undefined;
  }

  /** True when `revertTo(messageId)` is available (and nothing is streaming). */
  canRevert(messageId: string): boolean {
    return !this.isStreaming && this.revertTarget(messageId) !== undefined;
  }

  /** What reverting to this message would change on disk. Modifies nothing. */
  async previewRevert(messageId: string): Promise<ChatRevertResult> {
    return this.callRevert(messageId, true);
  }

  /**
   * Rewind to just before this user message: the backend restores the workspace
   * and drops the run, then the transcript is cut here too. Resolves with the
   * backend result (`task` is the removed prompt, for the composer). On
   * failure the transcript is left untouched.
   */
  async revertTo(messageId: string): Promise<ChatRevertResult> {
    const result = await this.callRevert(messageId, false);
    if (!result.ok) return result;
    const index = this.messages.findIndex((m) => m.id === messageId);
    if (index !== -1) {
      const removed = this.messages.slice(index);
      this.messages = this.messages.slice(0, index);
      this.error = null;
      // Rewind the rail too: the task list / sub-contexts belong to the state
      // the session is going back to, not to the run that was just undone.
      if (result.state) {
        this.todos = normalizeTodos(result.state.todos);
        const c = result.state.contexts;
        const next = c ? normalizeContexts(c.active, c.count, c.maxActive) : null;
        this.contexts = next && next.active.length ? next : null;
      }
      this.emit();
      this.dropFromStore(removed);
    }
    return result;
  }

  private async callRevert(messageId: string, dryRun: boolean): Promise<ChatRevertResult> {
    const empty = { added: [], modified: [], deleted: [] };
    const runId = this.revertTarget(messageId);
    const fail = (error: string): ChatRevertResult => ({
      ok: false, runId: runId ?? '', error, dryRun, changes: empty, filesReverted: false, messagesReverted: false,
    });
    if (!runId) return fail('This message has no restore point.');
    if (this.isStreaming) return fail('Stop the running agent before reverting.');
    try {
      return await this.options.transport.revert!({ conversationId: this.conversationId, runId, dryRun });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  }

  private persistCheckpointLink(runId: string): void {
    const linked = this.messages.find((m) => m.role === 'user' && m.metadata?.checkpointRunId === runId);
    if (linked) this.saveToStore(linked);
  }

  /** Best-effort: rewrite the persisted thread without the removed messages. */
  private dropFromStore(removed: ChatMessage[]): void {
    const stored = this.options.store;
    const conversation = this.conversationId;
    if (!stored || !conversation || !removed.length) return;
    void stored.updateConversation(conversation, { messages: this.messages }).catch(() => {});
  }

  /** Reset transcript (and drop the persisted thread when a store is set). */
  async clearConversation(): Promise<void> {
    this.stop();
    if (this.conversationId && this.options.store) {
      await this.options.store.deleteConversation(this.conversationId);
    }
    this.messages = [];
    this.conversationId = undefined;
    this.error = null;
    this.usage = null;
    this.todos = [];
    this.contexts = null;
    this.emit();
  }

  dispose(): void {
    this.stop();
  }

  private async run(input: {
    request: ChatRequest;
    streamId: string;
    onEvent?: (event: ChatStreamEvent) => boolean;
  }): Promise<void> {
    const { request, streamId, onEvent } = input;
    const token = ++this.generation;
    const controller = this.requestController();
    if (controller) {
      this.streamingId = streamId;
      this.isStreaming = true;
    }
    this.emit();

    try {
      for await (const raw of this.options.transport.send(request)) {
        if (this.generation !== token) return;
        if (onEvent && !onEvent(raw)) continue;
        const event = this.remap(raw, streamId);
        if (event.type === 'todos:updated') {
          this.todos = event.todos;
        } else if (event.type === 'context:updated') {
          this.contexts = { active: event.active, count: event.count, maxActive: event.maxActive };
        }
        if (event.type === 'message:complete' || event.type === 'error') {
          this.streamingId = null;
        }
        this.messages = applyChatEvent(this.messages, event, streamId);
        // The user message was saved at send time, before this event linked it
        // to its run. Save it again, or after a reload the revert control is
        // gone for every turn the store restores.
        if (event.type === 'checkpoint:created') this.persistCheckpointLink(event.runId);
        if (event.type === 'usage') this.usage = event.usage;
        if (event.type === 'error') this.error = toChatError(event.error);
        this.emit();
      }

      if (this.generation !== token) return;
      this.finalize(streamId);
    } finally {
      if (this.generation === token) {
        this.controller = null;
        this.streamingId = null;
        this.isStreaming = false;
        this.emit();
      }
    }
  }

  private finalize(streamId: string): void {
    const idx = this.messages.findIndex((m) => m.id === streamId);
    if (idx === -1) return;
    const message = this.messages[idx]!;
    if (message.status === 'streaming') {
      this.messages = [...this.messages];
      this.messages[idx] = { ...message, status: 'complete' };
    }
    this.saveToStore(this.messages[idx]!);
  }

  /** Remap server-assigned message ids onto the local streaming placeholder. */
  /**
   * Point an event at the message this turn is actually being written to.
   *
   * `message:start` is adopted into the placeholder we created optimistically,
   * which means the store now knows the turn by *our* id. Every later event
   * still carries the transport's id, so it has to be rewritten too — doing
   * this for `message:start` alone leaves the reducer unable to find the
   * message and it drops the event, silently, with no error anywhere: the turn
   * renders as an empty bubble.
   *
   * A server that has already stored the message keeps its own id; only a fresh
   * one is adopted.
   */
  private remap(event: ChatStreamEvent, streamId: string): ChatStreamEvent {
    const messageId = (event as { messageId?: string }).messageId;
    if (!messageId || messageId === streamId) return event;
    if (this.messages.some((m) => m.id === messageId)) return event;
    return { ...event, messageId: streamId } as ChatStreamEvent;
  }

  private requestController(): AbortController | undefined {
    return this.controller ?? undefined;
  }

  private handleFatal(error: unknown, streamId: string): void {
    this.generation += 1;
    const info =
      error instanceof Error && error.name === 'AbortError'
        ? { code: 'cancelled', message: 'Stream cancelled', retryable: false }
        : toChatErrorFromUnknown(error);
    const targetId = this.streamingId ?? streamId;
    const hasTarget = this.messages.some((m) => m.id === targetId);
    if (hasTarget) {
      const event: ChatStreamEvent = {
        type: 'error',
        messageId: targetId,
        error: info,
      };
      this.messages = applyChatEvent(this.messages, event, streamId);
      if (info.code === 'cancelled') {
        const idx = this.messages.findIndex((m) => m.id === targetId);
        if (idx !== -1) {
          this.messages = [...this.messages];
          this.messages[idx] = { ...this.messages[idx]!, status: 'cancelled' };
        }
      }
    }
    this.error = info;
    this.isStreaming = false;
    this.streamingId = null;
    this.controller = null;
    this.emit();
  }

  private saveToStore(message: ChatMessage): void {
    const stored = this.options.store;
    if (!stored) return;
    const conversation = message.conversationId ?? this.conversationId;
    if (!conversation) return;
    void stored.saveMessage({ ...message, conversationId: conversation }).catch(() => {});
  }

  private emit(): void {
    this.notify(this.getState());
  }
}

function toChatError(input: ChatErrorInfo | string): ChatErrorInfo {
  return typeof input === 'string' ? { code: 'stream_error', message: input, retryable: true } : input;
}

function toChatErrorFromUnknown(input: unknown): ChatErrorInfo {
  if (typeof input === 'string') return { code: 'stream_error', message: input, retryable: true };
  if (input instanceof Error) {
    return { code: 'stream_error', message: input.message, retryable: true, details: input.stack };
  }
  return { code: 'stream_error', message: 'Unknown stream error', retryable: true };
}

export type { ChatRuntimeOptions, ChatRuntimeState, ChatTransport };