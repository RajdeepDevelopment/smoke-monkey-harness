/**
 * MemoryStore — zero-dependency, in-memory persistence for the harness.
 *
 * Simple keyed collections the AgentLoop can read/write without any database.
 * Implement the same small surface (or rely on subclasses) to back the harness
 * with your own storage: sessions, runs, and messages per session.
 */
import { AgentMessage, AgentState, HarnessRun, HarnessSession, RunStatus } from './models.js';

export interface Storage {
  ensureSession(sessionId: string, meta: Partial<HarnessSession>): void;
  getSession(sessionId: string): HarnessSession | undefined;
  setSessionStatus(sessionId: string, status: string): void;
  setSessionSnapshot(sessionId: string, snapshot: HarnessSession['snapshot']): void;
  addSessionTokens(sessionId: string, prompt: number, completion: number): void;

  ensureRun(runId: string, sessionId: string): void;
  getRun(runId: string): HarnessRun | undefined;
  bumpRunStep(runId: string): void;
  setRunStatus(runId: string, status: string): void;
  setRunAgentState(runId: string, agentState: AgentState): void;
  addRunTokens(runId: string, prompt: number, completion: number): void;

  addMessage(sessionId: string, message: Partial<AgentMessage>): Promise<AgentMessage>;
  updateMessage(sessionId: string, message: AgentMessage): Promise<void>;
  listMessages(sessionId: string): AgentMessage[];
}

export class MemoryStore implements Storage {
  private sessions = new Map<string, HarnessSession>();
  private runs = new Map<string, HarnessRun>();
  private messages = new Map<string, AgentMessage[]>();

  private nextMessageId(): string {
    let id: string;
    do {
      id = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    } while (Array.from(this.messages.values()).some((msgs) => msgs.some((m) => m.id === id)));
    return id;
  }

  ensureSession(sessionId: string, meta: Partial<HarnessSession> = {}): void {
    if (!this.sessions.has(sessionId)) {
      const now = Date.now();
      this.sessions.set(sessionId, {
        id: sessionId,
        agentId: meta.agentId ?? 'build',
        workspacePath: meta.workspacePath ?? '',
        status: meta.status ?? 'queued',
        inputTokens: meta.inputTokens ?? 0,
        outputTokens: meta.outputTokens ?? 0,
        snapshot: meta.snapshot,
        createdAt: now,
        updatedAt: now,
      });
    }
    this.messages.set(sessionId, this.messages.get(sessionId) ?? []);
  }

  getSession(sessionId: string): HarnessSession | undefined {
    return this.sessions.get(sessionId);
  }

  setSessionStatus(sessionId: string, status: string): void {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.status = status as RunStatus;
      s.updatedAt = Date.now();
    }
  }

  setSessionSnapshot(sessionId: string, snapshot: HarnessSession['snapshot']): void {
    const s = this.sessions.get(sessionId);
    if (s) s.snapshot = snapshot;
  }

  addSessionTokens(sessionId: string, prompt: number, completion: number): void {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.inputTokens += prompt;
      s.outputTokens += completion;
    }
  }

  ensureRun(runId: string, sessionId: string): void {
    if (!this.runs.has(runId)) {
      const now = Date.now();
      this.runs.set(runId, {
        id: runId,
        sessionId,
        status: 'running',
        step: 0,
        inputTokens: 0,
        outputTokens: 0,
        agentState: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  getRun(runId: string): HarnessRun | undefined {
    return this.runs.get(runId);
  }

  bumpRunStep(runId: string): void {
    const r = this.runs.get(runId);
    if (r) {
      r.step += 1;
      r.updatedAt = Date.now();
    }
  }

  setRunStatus(runId: string, status: string): void {
    const r = this.runs.get(runId);
    if (r) {
      r.status = status as RunStatus;
      r.updatedAt = Date.now();
    }
  }

  setRunAgentState(runId: string, agentState: AgentState): void {
    const r = this.runs.get(runId);
    if (r) r.agentState = agentState;
  }

  addRunTokens(runId: string, prompt: number, completion: number): void {
    const r = this.runs.get(runId);
    if (r) {
      r.inputTokens += prompt;
      r.outputTokens += completion;
    }
  }

  async addMessage(sessionId: string, message: Partial<AgentMessage>): Promise<AgentMessage> {
    const list = this.messages.get(sessionId) ?? [];
    const row: AgentMessage = {
      id: message.id ?? this.nextMessageId(),
      sessionId,
      role: message.role ?? 'assistant',
      content: message.content ?? '',
      toolCalls: message.toolCalls,
      tool_call_id: message.tool_call_id,
      usage: message.usage,
      reasoning: message.reasoning,
      tokensInput: message.tokensInput,
      tokensOutput: message.tokensOutput,
      createdAt: message.createdAt ?? Date.now(),
    };
    list.push(row);
    this.messages.set(sessionId, list);
    return row;
  }

  async updateMessage(sessionId: string, message: AgentMessage): Promise<void> {
    const list = this.messages.get(sessionId) ?? [];
    const i = list.findIndex((m) => m.id === message.id);
    if (i >= 0) list[i] = message;
  }

  listMessages(sessionId: string): AgentMessage[] {
    return this.messages.get(sessionId) ?? [];
  }
}

export const createMemoryStore = (): MemoryStore => new MemoryStore();