import { createId } from '../lib/id';
import { applyChatEvent } from './EventReducer';
import type { ChatMessage } from '../types/message';
import type { ChatStreamEvent, ConnectionStatus, ChatErrorInfo, TokenUsage } from '../types/stream';
import type {
  ChatRequest,
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
  private controller: AbortController | null = null;
  private notify: (state: ChatRuntimeState) => void;
  private generation = 0;

  constructor(private options: ChatRuntimeOptions) {
    this.notify = options.onStateChange ?? (() => {});
  }

  /**
   * Rebind mutable options (`model`, `system`, `request`, `onStateChange`)
   * without replacing the instance — used by hooks on every render.
   */
  refresh(next: Partial<ChatRuntimeOptions>, onStateChange?: (state: ChatRuntimeState) => void): void {
    if (next.model !== undefined) this.options.model = next.model;
    if (next.system !== undefined) this.options.system = next.system;
    if (next.request !== undefined) this.options.request = next.request;
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
        if (event.type === 'message:complete' || event.type === 'error') {
          this.streamingId = null;
        }
        this.messages = applyChatEvent(this.messages, event, streamId);
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