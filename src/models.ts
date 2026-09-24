/**
 * In-memory data models for the harness. Stand-ins for the NestJS/TypeORM
 * entities in the source app — plain interfaces, no framework.
 */

export type PermissionEffect = 'allow' | 'ask' | 'deny';

export type RunStatus =
  | 'queued'
  | 'running'
  | 'thinking'
  | 'executing_tool'
  | 'waiting_permission'
  | 'waiting_user_input'
  | 'waiting_mcp_approval'
  | 'completed'
  | 'failed'
  | 'interrupted';

export type SessionStatus = RunStatus;

export type ToolCallStatus = 'queued' | 'completed' | 'failed' | 'running';

export interface ToolCallJson {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  thought_signature?: string;
  output?: string;
  result?: unknown;
  error?: string;
}

export interface AgentMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCallJson[];
  tool_call_id?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
  reasoning?: string | null;
  tokensInput?: number;
  tokensOutput?: number;
  createdAt: number;
}

export interface TodoItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  dependencies: string[];
}

export interface VerError {
  message: string;
  count: number;
}

export interface AgentState {
  phase: string;
  task: string;
  plan: TodoItem[];
  currentStep: number;
  currentObjective: string;
  files: { read: string[]; modified: string[] };
  facts: string[];
  decisions: string[];
  errors: VerError[];
  pendingToolCalls: never[];
  verification: { testsRun: string[]; passed: boolean };
  tokenUsage: { input: number; output: number };
}

export interface HarnessSession {
  id: string;
  status: SessionStatus;
  agentId: string;
  workspacePath: string;
  inputTokens: number;
  outputTokens: number;
  snapshot: unknown | null;
  createdAt: number;
  updatedAt: number;
}

export interface HarnessRun {
  id: string;
  sessionId: string;
  status: RunStatus;
  step: number;
  inputTokens: number;
  outputTokens: number;
  agentState: AgentState | null;
  createdAt: number;
  updatedAt: number;
}