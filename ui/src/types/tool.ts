import type { ChatErrorInfo } from './stream';
import type { ToolPresentation } from './tools';

export type ToolStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

export interface ToolCall {
  id: string;
  name: string;
  status: ToolStatus;
  input?: unknown;
  output?: unknown;
  /**
   * Structured failure for this call, when the producer sent one. Lets the
   * tool card distinguish a denied permission (warning, offer access) from a
   * crash (error, offer retry) instead of rendering one red block for both.
   */
  error?: ChatErrorInfo;
  /**
   * Icon/label as declared by whoever registered the tool.
   *
   * Present on custom tools (and on anything that ships a `presentation`); when
   * absent the UI falls back to inferring a family from the tool name, which is
   * a guess — a custom tool's own glyph is not guessable from `charge_card`.
   */
  presentation?: ToolPresentation;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

/**
 * MCP is a first-class citizen: when a tool comes from an MCP server the
 * transport keeps the server identity so the UI can render
 * "🔌 <server> → <tool-name>" and group calls per server.
 */
export interface MCPToolCall extends ToolCall {
  serverId?: string;
  serverName?: string;
  toolName?: string;
}

export interface AgentStep {
  stepId: string;
  title: string;
  status: 'running' | 'complete' | 'error';
  startedAt?: string;
  completedAt?: string;
}

export const TOOL_STATUS_RANK: Record<ToolStatus, number> = {
  running: 3,
  pending: 2,
  success: 1,
  error: 1,
  cancelled: 0,
};