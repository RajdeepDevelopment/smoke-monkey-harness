import type { ChatArtifact } from './artifact';
import type { ChatSource } from './source';
import type { ChatErrorInfo, TokenUsage } from './stream';
import type { AgentStep, ToolCall } from './tool';
import type { ChatPrompt } from './prompt';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'error' | 'cancelled';

/**
 * A rich message part. Instead of forcing everything through a single string,
 * an assistant response is a sequence of parts:
 *
 *   Markdown → Code → ToolCall → Tool result → Markdown → Chart → Sources
 */
export type MessagePart =
  | { type: 'thinking'; content: string }
  | { type: 'markdown'; content: string }
  | { type: 'text'; content: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'tool'; toolCall: ToolCall }
  | { type: 'artifact'; artifact: ChatArtifact }
  | { type: 'citation'; source: ChatSource }
  /**
   * A non-terminal failure rendered inline in the transcript: a provider rate
   * limit the loop is retrying through, a dropped connection, a tool the
   * model was not allowed to call. Kept as a part (not `message.error`) so
   * the message can carry several of these and still finish streaming.
   */
  | { type: 'notice'; error: ChatErrorInfo }
  /**
   * A question the run is blocked on, rendered inline where the agent asked
   * it. A part rather than a modal because the agent can chain several, and
   * each belongs next to the message that raised it.
   */
  | { type: 'prompt'; prompt: ChatPrompt }
  | { type: 'image'; url?: string; dataUri?: string; alt?: string }
  | { type: 'file'; file: ChatArtifact & { type: 'file' } };

export interface ChatMessage {
  id: string;
  conversationId?: string;
  role: MessageRole;
  status: MessageStatus;
  /** Plain-text fallback used for copy / export / request serialization. */
  content: string;
  parts: MessagePart[];
  createdAt: string;
  model?: string;
  usage?: TokenUsage;
  sources?: ChatSource[];
  toolCalls?: ToolCall[];
  artifacts?: ChatArtifact[];
  agentSteps?: AgentStep[];
  error?: ChatErrorInfo;
  /**
   * Prompts this message is currently blocked on. Mirrors `parts` so a host can
   * check "is this run waiting on me?" without walking the parts.
   */
  prompts?: ChatPrompt[];
  metadata?: Record<string, unknown>;
}