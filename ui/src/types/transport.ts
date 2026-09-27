import type { ChatMessage } from './message';
import type { ChatStreamEvent, ConnectionStatus, ChatErrorInfo, TokenUsage } from './stream';

export interface ChatRequest {
  conversationId?: string;
  model?: string;
  system?: string;
  /** The new user message, if this is a user-initiated turn. */
  text?: string;
  /** Serialized history (the runtime fills this from its own state by default). */
  messages?: ChatMessage[];
  /** Provider-specific extras (temperature, top_p, rag scope, …). */
  options?: Record<string, unknown>;
  /** Abort signal the transport must respect. Never serialized. */
  signal?: AbortSignal;
}

/**
 * The provider abstraction. Implementers adapt any backend to the normalized
 * `ChatStreamEvent` protocol. Templates: `FetchTransport`, `SSETransport`,
 * `WebSocketTransport`, `TauriTransport`, `CustomTransport`.
 */
/**
 * An answer to a run that is blocked on the user.
 *
 * This is the other half of `prompt:ask` / `prompt:permission`. The harness
 * *pauses* the run until it arrives, so a transport that cannot send one leaves
 * the conversation permanently stuck — which is what a receive-only transport
 * did to every browser host.
 */
export interface ChatPromptResponse {
  conversationId?: string;
  /** The blocked tool call. */
  toolCallId: string;
  kind: 'ask' | 'permission';
  /**
   * For `ask`: the option value(s) chosen, or the free text typed.
   * For `permission`: the decision.
   */
  answer: string;
}

export interface ChatTransport {
  send(request: ChatRequest): AsyncIterable<ChatStreamEvent>;
  /** Optional: give the transport a chance to cancel an in-flight request. */
  abort?(request?: ChatRequest): void | Promise<void>;
  /**
   * Optional: answer a pending prompt so a paused run can continue.
   *
   * Absent on transports that cannot write to the backend. The chat UI then
   * renders prompts read-only instead of showing controls that go nowhere.
   */
  respond?(response: ChatPromptResponse): void | Promise<void>;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateConversationInput {
  id?: string;
  title?: string;
  messages?: ChatMessage[];
}

export interface UpdateConversationInput {
  title?: string;
  messages?: ChatMessage[];
}

/**
 * Persistence boundary — the runtime uses it to save/load history. Provide
 * SQLite / Postgres / IndexedDB / localStorage / your own API behind this.
 */
export interface ChatStore {
  listConversations(): Promise<ConversationSummary[]>;
  getConversation(id: string): Promise<ConversationSummary | null>;
  createConversation(input: CreateConversationInput): Promise<ConversationSummary>;
  updateConversation(id: string, input: UpdateConversationInput): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  getMessages(conversationId: string): Promise<ChatMessage[]>;
  saveMessage(message: ChatMessage): Promise<void>;
  /** Optional: paginate old messages when virtualizing long threads. */
  getMessagesBefore?(
    conversationId: string,
    beforeId: string,
    limit?: number
  ): Promise<ChatMessage[]>;
}

export interface ChatRuntimeState {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingMessage: ChatMessage | null;
  conversationId?: string;
  error: ChatErrorInfo | null;
  usage: TokenUsage | null;
  connectionStatus: ConnectionStatus;
  hasMoreMessages: boolean;
}

export interface ChatRuntimeOptions {
  transport: ChatTransport;
  store?: ChatStore | null;
  conversationId?: string;
  model?: string;
  system?: string;
  /** Static extras merged into every request. */
  request?: Omit<ChatRequest, 'text' | 'messages' | 'signal'>;
  onStateChange?: (state: ChatRuntimeState) => void;
}