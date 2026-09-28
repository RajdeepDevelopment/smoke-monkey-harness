/**
 * The user's answer to an MCP-approval pause.
 *
 * `enable` and `add` name the servers to turn on for this and future runs;
 * `skip` leaves them off. The decision is structured rather than a free string
 * because the harness acts on it — it is a list of servers to configure, not an
 * answer to read.
 */
export interface ChatMcpApprovalDecision {
  action: 'enable' | 'add' | 'skip';
  /** MCP server ids. Empty for `skip`. */
  names: string[];
}

/**
 * A question the run is blocked on, waiting for the user.
 *
 * The harness *pauses* the run for all three of these: `ask_user.required`,
 * `permission.required` and `mcp.approval_required` do not resolve until the
 * host answers. A UI that does not render them therefore deadlocks — the run
 * stops, nothing explains why, and the only way out is a server-side
 * `respond()` / `resolvePermission()` / `resolveMcpDecision()` the browser
 * cannot call.
 */
export type ChatPromptKind = 'ask' | 'permission' | 'mcp_approval';

export type ChatPromptStatus = 'pending' | 'answered' | 'cancelled';

export interface ChatPromptOption {
  /** Value sent back to the agent. */
  value: string;
  /** What the user sees. Defaults to `value`. */
  label?: string;
  description?: string;
}

/**
 * The servers behind an `mcp_approval` pause: what the agent wants to use and
 * which of them it expects the user to turn on. Only set for
 * `kind: 'mcp_approval'`; the shape is passed through from the harness payload
 * and is not interpreted here.
 */
export interface ChatMcpApproval {
  /** What the agent is trying to do with the servers, for context. */
  task?: string | null;
  /** Server configs as the harness reported them. */
  servers?: unknown[];
  recommendedToEnableIds?: string[];
  recommendedToAddIds?: string[];
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
  /** The recommended MCP servers. Only set for `kind: 'mcp_approval'`. */
  mcp?: ChatMcpApproval;
  /** What the user chose or typed, once answered. */
  answer?: string;
  /** Permission decision, once answered. */
  decision?: 'allow' | 'deny';
  /** MCP decision, once answered. */
  mcpDecision?: ChatMcpApprovalDecision;
}

/** The payload of a `prompt:ask` / `prompt:permission` / `prompt:mcp_approval` stream event. */
export interface ChatPromptEvent {
  kind: ChatPromptKind;
  toolCallId: string;
  question: string;
  options?: ChatPromptOption[];
  multiple?: boolean;
  toolName?: string;
  input?: unknown;
  mcp?: ChatMcpApproval;
}
