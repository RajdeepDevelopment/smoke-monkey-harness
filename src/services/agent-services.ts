/**
 * Service contracts the AgentLoop depends on. The source app implements these
 * with NestJS + TypeORM; the harness library satisfies them with its own
 * in-memory store (see harness.ts). Define your own implementations to swap in
 * real persistence, audit logs, or a remote permission service.
 */
import type { AgentMessage, AgentState, PermissionEffect, RunStatus, ToolCallJson } from '../models.js';

export interface AgentMessageService {
  create(
    sessionId: string,
    role: AgentMessage['role'],
    content: string,
    opts?: {
      toolCalls?: ToolCallJson[];
      parentMessageId?: string;
      tokensInput?: number;
      tokensOutput?: number;
      reasoning?: string | null;
    },
  ): Promise<AgentMessage>;
}

export interface AgentRunService {
  updateStatus(id: string, status: RunStatus | string): Promise<void>;
  incrementStep(id: string): Promise<number>;
  updateTokens(id: string, input: number, output: number): Promise<void>;
  saveAgentState(id: string, state: AgentState, workspacePath?: string): Promise<void>;
}

export interface AgentSessionService {
  updateStatus(id: string, status: string): Promise<void>;
  updateTokens(id: string, input: number, output: number, cost?: number): Promise<void>;
}

export interface AgentPermissionService {
  evaluate(
    toolName: string,
    resource: string,
    agentId: string,
    userId: string,
    workspacePath: string,
  ): Promise<PermissionEffect>;
}