/**
 * A question the run is blocked on, waiting for the user.
 *
 * The harness *pauses* the run for both of these: `ask_user.required` and
 * `permission.required` do not resolve until the host answers. A UI that does
 * not render them therefore deadlocks — the run stops, nothing explains why,
 * and the only way out is a server-side `respond()` the browser cannot call.
 */
export type ChatPromptKind = 'ask' | 'permission';

export type ChatPromptStatus = 'pending' | 'answered' | 'cancelled';

export interface ChatPromptOption {
  /** Value sent back to the agent. */
  value: string;
  /** What the user sees. Defaults to `value`. */
  label?: string;
  description?: string;
}

export interface ChatPrompt {
  /** The tool call that is blocked; the answer is addressed to it. */
  toolCallId: string;
  kind: ChatPromptKind;
  status: ChatPromptStatus;
  /** The question, or a description of what needs approving. */
  question: string;
  /** Offered choices. Empty means free text. */
  options?: ChatPromptOption[];
  /** Whether more than one option may be selected. */
  multiple?: boolean;
  /** Which tool wants permission. Only set for `kind: 'permission'`. */
  toolName?: string;
  /** The tool's arguments, so the user can see what they are approving. */
  input?: unknown;
  /** What the user chose or typed, once answered. */
  answer?: string;
  /** Permission decision, once answered. */
  decision?: 'allow' | 'deny';
}

/** The payload of a `prompt:ask` / `prompt:permission` stream event. */
export interface ChatPromptEvent {
  kind: ChatPromptKind;
  toolCallId: string;
  question: string;
  options?: ChatPromptOption[];
  multiple?: boolean;
  toolName?: string;
  input?: unknown;
}
