/**
 * AgentHarness — the easy-to-use public engine.
 *
 * Wires the ported core (AgentLoop, LLMClient, compaction, guards, tools,
 * system prompt, sub-contexts) into one object with an in-memory store, a
 * permission policy, and first-class events. Framework-agnostic, no NestJS,
 * no database — plug your own storage/permissions via options if you need.
 *
 *   const agent = createAgent({
 *     provider: 'openrouter',
 *     model: 'anthropic/claude-3.7-sonnet',
 *     apiKey: process.env.OPENROUTER_API_KEY,
 *     workspacePath: '/path/to/project',
 *   });
 *
 *   agent.on('tool.completed', (e) => console.log(e.data));
 *   const result = await agent.run('Fix the failing test in src/');
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Logger, setLogLevel, type LoggerOptions } from './logger.js';
import { KeyResolver, envKey } from './keys.js';
import {
  AgentMessage,
  AgentState,
  PermissionEffect,
  ToolCallJson,
} from './models.js';
import { MemoryStore } from './store.js';
import { AgentLoop, type AgentLoopDeps, type CreateRunContextArgs, type McpApprovalDecision } from './services/agent-loop.js';
import {
  AgentEventEmitter,
  type AgentEventListener,
} from './services/agent-event.emitter.js';
import { LLMClient } from './services/llm-client.js';
import { ContextCompactionService, mergeSnapshot } from './services/compaction.service.js';
import {
  LLMMessage,
  RunContext,
  ContextSnapshot,
  classifyTaskGroups,
  createEmptySnapshot,
  estimateTokens,
  initialPhase,
  resolveExposedTools,
  resolveProjectDir,
  resolveTokenBudget,
  READ_ONLY_TOOLS,
  COMPACTION_THRESHOLD,
  KEEP_RECENT_MESSAGES,
} from './services/run-context.js';
import { renderContextPanel, SubContextManager, getSubContext, registerSubContext } from './context/sub-context.js';
import type { SubContext } from './context/sub-context.js';
import { ToolRegistry, type ToolDefinition } from './tools/tool-registry.js';
import { shapeSpilledOutput } from './services/artifact-store.js';
import { McpManager, type McpServerConfig } from './services/mcp-manager.js';
import {
  getReadFileTool,
  getWriteFileTool,
  getEditFileTool,
  getLineEditTool,
  getReplaceLinesTool,
  getApplyPatchTool,
  getDeleteFileTool,
  getListDirectoryTool,
  getInspectTool,
} from './tools/filesystem.tools.js';
import {
  getRunCommandTool,
  getRunTestTool,
} from './tools/terminal.tools.js';
import { getGlobTool, getGrepTool } from './tools/search.tools.js';
import { getGitStatusTool, getGitDiffTool, getGitLogTool } from './tools/git.tools.js';
import { getAskUserTool, getContextManageTool, getFinishTaskTool, getTodoWriteTool } from './tools/agent.tools.js';
import { getInspectMcpStockTool, getRequestMcpApprovalTool } from './tools/mcp.tools.js';
import { getListSkillsTool, getUseSkillTool } from './tools/skill.tools.js';
import { buildSystemPrompt, renderRunOperatingRules } from './lib/system-prompt.js';
import { SkillRegistry, loadSkillsFromDirs, defaultSkillDirs } from './skills.js';
import type { Skill } from './skills.js';

// ── Public types ─────────────────────────────────────────────────────────────

export type ToolGroupName = 'filesystem' | 'terminal' | 'search' | 'git' | 'agent';

export type AgentId = 'build' | 'plan' | 'explore' | 'general';

export type PermissionDecision = 'allow' | 'deny' | 'ask';

export interface PermissionRequest {
  toolName: string;
  args: Record<string, unknown>;
  sessionId: string;
  runId: string;
  workspacePath: string;
  userId: string;
}

export type PermissionPolicy =
  | 'allow-all'
  | 'deny-all'
  | 'ask-default'
  | ((req: PermissionRequest) => PermissionDecision | Promise<PermissionDecision>);

export interface AgentOptions {
  /** Model provider: openai | openrouter | nvidia | xai | gemini | opencode | omniroute | ollama (default). */
  provider?: string;
  /** Model identifier (e.g. anthropic/claude-3.7-sonnet, gpt-5, qwen3:8b). */
  model?: string;
  /** API key for the provider, or a resolver callback `(provider, userId?) => key`. */
  apiKey?: string | KeyResolver;
  /** Override the LLM base URL (OpenAI-compatible). Defaults to Ollama at http://localhost:11434. */
  baseUrl?: string;
  /** Working directory the agent operates in (required). */
  workspacePath: string;
  /** Project sub-directory tool calls default to. Falls back to workspacePath. */
  projectDir?: string;
  /** Agent behaviour: 'build' (default) | 'plan' | 'explore' | 'general'. */
  agentId?: AgentId;
  /** Tool groups to load (default: all five) or a custom list of ToolDefinition. */
  tools?: (ToolGroupName | 'all')[] | ToolDefinition[];
  /** Replace the built-in system prompt. */
  systemPrompt?: string;
  /** Extra guidance appended to the system prompt (or string[]). */
  subSystemPrompt?: string | string[];
  /** Permission policy. Default: allow read-only, ask for mutations/commands. */
  permission?: PermissionPolicy;
  /** Allow every mutation/command automatically (no `permission.required` wait). */
  autoApprove?: boolean;
  /** A stable session id so multiple runs share memory (default: per-run session). */
  sessionId?: string;
  /** Storage backend. Default: in-memory. */
  store?: MemoryStore;
  /** Stable user id for key resolution / permission requests. */
  userId?: string;
  /** Optional per-project instruction loader for the system prompt. */
  loadProjectConfig?: (workspacePath?: string) => Promise<string | null | undefined> | string | null | undefined;
  /** Register custom sub-contexts (activatable via context_manage like the built-ins). */
  subContexts?: SubContext[];
  /** Sub-context ids to leave ACTIVE at run start (besides persisted session state). */
  defaultSubContexts?: string[];
  /**
   * MCP servers to manage for every run. Each is a stdio (`command`/`args`) or
   * streamable-HTTP (`url`) server; tools appear as `<name>__<tool>` while the
   * matching `mcp_<id>` sub-context is active. Read-only wishes: no approvals.
   */
  mcp?: McpServerConfig[];
  /**
   * Register skills as `Skill` objects (use `loadSkillsFromDirs` to build them
   * from SKILL.md files). Combined with `skillsDir`. Loaded JUST-IN-TIME via
   * the list_skills / use_skill tools.
   */
  skills?: Skill[];
  /**
   * Directories scanned for skills (SKILL.md per folder / `.md` per file). A
   * single path or an array of paths. When unset, the ecosystem discovery
   * defaults are scanned: `.opencode/skills`, `.claude/skills`, `.codex/skills`
   * under the workspace plus the home equivalents (opencode / Claude Code /
   * Codex / AniGravity-style folders all use the same format).
   */
  skillsDir?: string | string[];
  /** Logger configuration. */
  logger?: LoggerOptions;
}

export interface RunOptions {
  sessionId?: string;
  runId?: string;
  provider?: string;
  model?: string;
}

export interface RunResult {
  sessionId: string;
  runId: string;
  status: 'completed' | 'failed' | 'interrupted' | string;
  task: string;
  model?: string;
  provider?: string;
  messages: AgentMessage[];
  agentState: AgentState | null;
}

export function buildToolRegistry(tools?: AgentOptions['tools']): ToolRegistry {
  const registry = new ToolRegistry();
  const want = (group: ToolGroupName): boolean => {
    if (!tools) return true;
    if (Array.isArray(tools) && tools.length === 0) return true;
    const normalized = tools as Array<ToolGroupName | 'all' | ToolDefinition>;
    const named = normalized.filter((t): t is ToolGroupName => typeof t === 'string');
    if ((named as string[]).includes('all')) return true;
    return named.includes(group);
  };

  if (want('filesystem')) {
    for (const getter of [
      getReadFileTool, getWriteFileTool, getEditFileTool, getLineEditTool,
      getReplaceLinesTool, getApplyPatchTool, getDeleteFileTool,
      getListDirectoryTool, getInspectTool,
    ]) registry.register(getter());
  }
  if (want('terminal')) {
    registry.register(getRunCommandTool());
    registry.register(getRunTestTool());
  }
  if (want('search')) {
    registry.register(getGlobTool());
    registry.register(getGrepTool());
  }
  if (want('git')) {
    registry.register(getGitStatusTool());
    registry.register(getGitDiffTool());
    registry.register(getGitLogTool());
  }
  if (want('agent')) {
    registry.register(getAskUserTool());
    registry.register(getContextManageTool());
    registry.register(getFinishTaskTool());
    registry.register(getTodoWriteTool());
  }

  if (Array.isArray(tools)) {
    for (const t of tools) {
      if (typeof t !== 'string') registry.register(t);
    }
  }
  return registry;
}

// ── AgentHarness ─────────────────────────────────────────────────────────────

export class AgentHarness {
  readonly events: AgentEventEmitter;
  readonly store: MemoryStore;
  private readonly logger: Logger;
  private readonly opts: Required<Pick<AgentOptions, 'workspacePath'>> & AgentOptions;
  private readonly llm: LLMClient;
  private readonly compaction: ContextCompactionService;
  private readonly loopDeps: AgentLoopDeps;
  private readonly permissionPolicy: PermissionPolicy;
  private readonly autoApprove: boolean;
  private readonly activeSignals = new Map<string, AbortController>();
  private readonly pendingResponses = new Map<string, (value: string) => void>();
  private readonly pendingResponseAnswers = new Map<string, string>();
  private readonly pendingPermissions = new Map<string, (value: PermissionEffect) => void>();
  private readonly pendingPermissionAnswers = new Map<string, PermissionEffect>();
  private readonly pendingMcpDecisions = new Map<string, (decision: McpApprovalDecision) => void>();
  private readonly pendingMcpDecisionAnswers = new Map<string, McpApprovalDecision>();
  private activeSignal: AbortController | null = null;
  private activeWaits = 0;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  /** Live MCP manager (undefined when no servers configured). Populated by options.mcp or addMcpServer(). */
  mcp?: McpManager;
  /** Live skill registry (from options.skills / options.skillsDir). Populated at construction. */
  readonly skills: SkillRegistry;

  constructor(options: AgentOptions) {
    if (!options.workspacePath) throw new Error('AgentHarness requires workspacePath');
    this.opts = { ...options, workspacePath: options.workspacePath };
    if (options.logger?.level) setLogLevel(options.logger.level);
    this.logger = new Logger('AgentHarness');
    this.events = new AgentEventEmitter();
    this.store = options.store ?? new MemoryStore();
    this.permissionPolicy = options.permission ?? 'ask-default';
    this.autoApprove = options.autoApprove ?? false;

    for (const sub of options.subContexts ?? []) {
      const res = registerSubContext(sub);
      if (!res.ok) this.logger.warn(`subContext "${sub.id}" skipped: ${res.error}`);
    }

    this.mcp = options.mcp?.length ? new McpManager(options.mcp, { logger: this.logger }) : undefined;
    if (this.mcp && this.mcp.configs.length > 0) {
      this.logger.log(`MCP configured: ${this.mcp.configs.map((c) => `${c.id}${c.enabled ? '' : ' (disabled)'}`).join(', ')}`);
    }

    // Skills: explicit objects via options.skills, plus directories via
    // options.skillsDir. Defaults to the ecosystem discovery locations
    // (opencode/claude/codex under the workspace + home). Never throws —
    // unreadable dirs are skipped silently.
    this.skills = new SkillRegistry();
    for (const s of options.skills ?? []) {
      const res = this.skills.add(s);
      if (!res.ok) this.logger.warn(`skill "${s.id}" skipped: ${res.error}`);
    }
    const dirs =
      options.skillsDir === undefined
        ? defaultSkillDirs(options.workspacePath)
        : Array.isArray(options.skillsDir)
          ? options.skillsDir
          : [options.skillsDir];
    for (const s of loadSkillsFromDirs(dirs, { tolerateErrors: true, warn: (m) => this.logger.warn(m) })) {
      const res = this.skills.add(s);
      if (!res.ok) this.logger.warn(`skill "${s.id}" skipped: ${res.error}`);
    }
    if (this.skills.count > 0) {
      this.logger.log(`Skills registered: ${this.skills.all().map((s) => s.id).join(', ')}`);
    }

    const getApiKey: KeyResolver =
      typeof options.apiKey === 'string'
        ? async () => options.apiKey as string
        : options.apiKey ?? envKey;

    if (options.baseUrl) process.env.LLM_BASE_URL = options.baseUrl;

    this.llm = new LLMClient({
      getApiKey,
      eventEmitter: this.events,
      getActiveRunSignal: () => this.activeSignals.get(this.activeSessionId ?? '')?.signal,
    });

    this.compaction = new ContextCompactionService({
      getApiKey,
      appendCheckpoint: async (sessionId, summary) => {
        await this.appendSystemNoteRaw(sessionId, summary);
      },
    });

    const toolRegistry = buildToolRegistry(options.tools);
    if (this.mcp) {
      toolRegistry.register(getInspectMcpStockTool(this.mcp));
      toolRegistry.register(getRequestMcpApprovalTool(this.mcp));
    }
    if (this.skills.count > 0) {
      toolRegistry.register(getListSkillsTool(this.skills));
      toolRegistry.register(getUseSkillTool(this.skills));
    }

    this.loopDeps = {
      toolRegistry,
      workspaceIndex: null,
      eventEmitter: this.events,
      permissionService: {
        evaluate: async (toolName, _args, agentId, userId, workspacePath) =>
          this.decidePermission(toolName, { sessionId: this.activeSessionId ?? '', runId: this.activeRunId ?? '' }, userId, workspacePath),
      },
      runService: {
        incrementStep: async (runId) => {
          this.store.bumpRunStep(runId);
          return this.store.getRun(runId)?.step ?? 0;
        },
        updateStatus: async (runId, status) => this.store.setRunStatus(runId, status),
        updateTokens: async (runId, prompt, completion) => this.store.addRunTokens(runId, prompt, completion),
        saveAgentState: async (runId, agentState, _workspacePath) => this.store.setRunAgentState(runId, agentState),
      },
      sessionService: {
        updateStatus: async (sessionId, status) => this.store.setSessionStatus(sessionId, status),
        updateTokens: async (sessionId, prompt, completion) => this.store.addSessionTokens(sessionId, prompt, completion),
      },
      messageService: {
        create: async (sessionId, role, content, opts) =>
          this.store.addMessage(sessionId, {
            role,
            content,
            toolCalls: opts?.toolCalls,
            reasoning: opts?.reasoning,
            tokensInput: opts?.tokensInput,
            tokensOutput: opts?.tokensOutput,
          }),
      },
      compactionService: this.compaction,
      createRunContext: (args) => this.createRunContext(args),
      buildLLMMessages: (ctx, extra = []) => this.buildLLMMessages(ctx, extra),
      appendAssistantMessage: (ctx, content, toolCalls, usage, reasoning) =>
        this.appendAssistantMessage(ctx, content, toolCalls, usage, reasoning),
      appendToolResult: (ctx, parentMessageId, toolCallId, content) =>
        this.appendToolResult(ctx, parentMessageId, toolCallId, content),
      appendSystemNote: async (ctx, content) => {
        await this.appendSystemNoteRaw(ctx.sessionId, content);
        ctx.runtimeInstructions.push(content);
      },
      persistContext: (ctx) => this.persistContext(ctx),
      compactToolOutput: (workspacePath, runId, toolCallId, output) =>
        this.compactToolOutput(workspacePath, runId, toolCallId, output),
      callLLMWithRetry: (messages, tools, provider, model, sessionId, runId, userId) =>
        this.llm.callWithRetry(messages, tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })), provider, model, sessionId, runId, userId),
      maybeCompact: (ctx) => this.maybeCompact(ctx),
      waitForUserResponse: (ctx, toolCallId) => this.waitForUserResponse(ctx, toolCallId),
      waitForPermission: (ctx, toolCallId, meta) => this.waitForPermission(ctx, toolCallId, meta),
      waitForMcpDecision: (ctx, toolCallId) => this.waitForMcpDecision(ctx, toolCallId),
      persistToolStatus: (assistantMsg, toolCallId, status, output, result) =>
        this.persistToolStatus(assistantMsg, toolCallId, status, output, result),
    };
  }

  get agentId(): AgentId {
    return this.opts.agentId ?? 'build';
  }

  get provider(): string | undefined {
    return this.opts.provider;
  }

  private activeSessionId: string | undefined;
  private activeRunId: string | undefined;

  // ── Events ───────────────────────────────────────────────────────────────

  /** Subscribe to a harness event type ('tool.completed', 'permission.required', …). */
  on(type: string, listener: AgentEventListener): () => void {
    return this.events.on(type, listener);
  }

  /** Receive every harness event. */
  onAny(listener: AgentEventListener): () => void {
    return this.events.onAny(listener);
  }

  // ── User interactions (ask_user / permissions) ───────────────────────────

  /** Hold the Node process alive while a wait is outstanding (pure-script hosts). */
  private holdWait(): () => void {
    let released = false;
    if (this.activeWaits++ === 0) {
      this.keepAliveTimer = setInterval(() => {}, 2_147_483_647);
    }
    return () => {
      if (released) return;
      released = true;
      this.activeWaits = Math.max(0, this.activeWaits - 1);
      if (this.activeWaits === 0 && this.keepAliveTimer) {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
      }
    };
  }

  /** Answer a pending `ask_user` prompt. */
  respond(toolCallId: string, response: string): void {
    const resolve = this.pendingResponses.get(toolCallId);
    if (resolve) {
      this.pendingResponses.delete(toolCallId);
      resolve(response);
    } else {
      this.pendingResponseAnswers.set(toolCallId, response);
    }
    this.events.emitAskUserResponse(this.activeSessionId ?? '', this.activeRunId ?? '', toolCallId, response);
  }

  /** Resolve a pending `permission.required` pause. */
  resolvePermission(toolCallId: string, decision: 'allow' | 'deny'): void {
    const resolve = this.pendingPermissions.get(toolCallId);
    if (resolve) {
      this.pendingPermissions.delete(toolCallId);
      resolve(decision);
    } else {
      this.pendingPermissionAnswers.set(toolCallId, decision);
    }
  }

  /**
   * Resolve a pending MCP-approval pause (emitted as `mcp.approval_required`).
   * `enable` turns the named servers on for this and future runs (the loop
   * appends the decision note to the conversation); `skip` leaves them off.
   */
  resolveMcpDecision(toolCallId: string, decision: McpApprovalDecision): void {
    const resolve = this.pendingMcpDecisions.get(toolCallId);
    if (resolve) {
      this.pendingMcpDecisions.delete(toolCallId);
      resolve(decision);
    } else {
      this.pendingMcpDecisionAnswers.set(toolCallId, decision);
    }
  }

  /** Add an MCP server config at runtime. Takes effect on the next run (and for new tool calls in an active run). */
  addMcpServer(config: McpServerConfig): { ok: boolean; error?: string } {
    if (!this.mcp) this.mcp = new McpManager(undefined, { logger: this.logger });
    return this.mcp.addServer(config);
  }

  /** Remove a configured MCP server (closing its live handle). */
  removeMcpServer(id: string): void {
    this.mcp?.removeServer(id);
  }

  /** Live status of every configured MCP server. */
  listMcpServers(): Array<{ id: string; name: string; description: string; enabled: boolean; active: boolean; activeInRun: boolean; toolCount: number }> {
    return this.mcp?.describe() ?? [];
  }

  /** Abort the currently running agent run. */
  abort(): void {
    this.activeSignal?.abort();
  }

  // ── The run ──────────────────────────────────────────────────────────────

  /**
   * Run the agent on a task. Resolves when the run reaches a terminal state
   * (completed / failed / interrupted). Pauses for `ask_user` / permission
   * prompts resolve via `respond()` / `resolvePermission()` from event
   * handlers (or are auto-approved via options.autoApprove).
   */
  async run(task: string, opts: RunOptions = {}): Promise<RunResult> {
    const sessionId = opts.sessionId ?? this.opts.sessionId ?? `session_${Date.now().toString(36)}`;
    const runId = opts.runId ?? `run_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const provider = opts.provider ?? this.opts.provider;
    const model = opts.model ?? this.opts.model;

    const controller = new AbortController();
    this.activeSignal = controller;
    this.activeSessionId = sessionId;
    this.activeRunId = runId;
    this.activeSignals.set(sessionId, controller);

    this.store.ensureSession(sessionId, { agentId: this.agentId, workspacePath: this.opts.workspacePath });
    this.store.ensureRun(runId, sessionId);

    this.store.addMessage(sessionId, { role: 'user', content: task });
    this.events.emitRunStarted(sessionId, runId, this.agentId);

    try {
      await new AgentLoop(this.loopDeps).execute({
        sessionId,
        runId,
        userId: this.opts.userId ?? 'user',
        message: task,
        workspacePath: this.opts.workspacePath,
        agentId: this.agentId,
        model,
        provider,
        remoteProfileId: undefined,
        abortController: controller,
      });
    } catch (err) {
      this.logger.error(`Agent run failed: ${err}`);
      this.store.setRunStatus(runId, 'failed');
      this.events.emitRunFailed(sessionId, runId, err instanceof Error ? err.message : String(err));
    } finally {
      try { this.mcp?.closeAll(); } catch {}
      this.activeSignals.delete(sessionId);
      this.activeSignal = null;
      this.activeRunId = undefined;
    }

    const run = this.store.getRun(runId);
    return {
      sessionId,
      runId,
      status: run?.status ?? 'unknown',
      task,
      model,
      provider,
      messages: this.store.listMessages(sessionId),
      agentState: run?.agentState ?? null,
    };
  }

  // ── AgentLoopDeps implementations ─────────────────────────────────────────

  private async decidePermission(
    toolName: string,
    ids: { sessionId: string; runId: string },
    userId: string,
    workspacePath: string,
  ): Promise<PermissionEffect> {
    const req: PermissionRequest = {
      toolName,
      args: {},
      sessionId: ids.sessionId,
      runId: ids.runId,
      workspacePath,
      userId,
    };

    if (this.autoApprove) return 'allow';
    if (this.permissionPolicy === 'allow-all') return 'allow';
    if (this.permissionPolicy === 'deny-all') return 'deny';

    let decision: PermissionDecision | 'allow' | 'deny';
    if (typeof this.permissionPolicy === 'function') {
      decision = await this.permissionPolicy(req);
    } else {
      decision = READ_ONLY_TOOLS.has(toolName) ? 'allow' : 'ask';
    }
    return decision === 'deny' ? 'deny' : decision === 'allow' ? 'allow' : 'ask';
  }

  private async createRunContext(args: CreateRunContextArgs): Promise<RunContext> {
    const { sessionId, runId, userId, workspacePath, agentId, model, provider, task, abortController } = args;
    const toolGroups = classifyTaskGroups(task, agentId);
    const readOnlyQuery = !toolGroups.has('editing') && !toolGroups.has('verification') && !toolGroups.has('git') && !toolGroups.has('docker');
    const projectDir = resolveProjectDir(task, workspacePath);
    const basePrompt = this.opts.systemPrompt
      ? this.opts.systemPrompt
      : await buildSystemPrompt(agentId, workspacePath, projectDir, {}, {
          loadProjectConfig: this.opts.loadProjectConfig ?? (async () => null),
        });
    const subPrompt = this.opts.subSystemPrompt
      ? `## Sub-context\n\n${Array.isArray(this.opts.subSystemPrompt) ? this.opts.subSystemPrompt.join('\n\n') : this.opts.subSystemPrompt}`
      : null;
    const runRules = renderRunOperatingRules({
      subContextCount: this.opts.subContexts?.length ?? 0,
      mcpEnabled: !!this.mcp && this.mcp.configs.length > 0,
      provider: provider ?? this.opts.provider,
      skills: {
        count: this.skills.count,
        ids: this.skills.all().map((s) => s.id),
      },
    });
    const systemPrompt = [basePrompt, subPrompt, runRules].filter(Boolean).join('\n\n');

    const session = this.store.getSession(sessionId);
    const snapshot: ContextSnapshot = (session?.snapshot as ContextSnapshot) ?? createEmptySnapshot(task);

    const manager = new SubContextManager();
    if (this.mcp) {
      for (const cfg of this.mcp.configs) {
        manager.registerMcpServer(`mcp_${cfg.id}`, cfg.name, cfg.description);
      }
    }
    const initialActive = [...(snapshot.activeSubContexts ?? []), ...(this.opts.defaultSubContexts ?? [])];
    if (initialActive.length) {
      manager.setActive(initialActive);
    }

    const messages = this.replayHistory(sessionId, snapshot);

    const ctx: RunContext = {
      sessionId,
      runId,
      userId,
      workspacePath,
      projectDir,
      agentId,
      provider,
      model,
      task,
      readOnlyQuery,
      systemPrompt,
      runtimeInstructions: [],
      policyViolation: null,
      hardStopReason: null,
      finishSignal: null,
      mcpAskedServerIds: new Set(),
      snapshot,
      messages,
      filesRead: new Set(),
      filesModified: new Set(),
      observations: [],
      plan: [],
      currentStep: 0,
      tokenBudget: resolveTokenBudget(provider, model),
      inputTokens: 0,
      outputTokens: 0,
      abortController,
      exposedTools: resolveExposedTools(toolGroups),
      phase: initialPhase(),
      lastToolCalls: [],
      lastCompactTokens: 0,
      contextManager: manager,
      mcpRuntime: this.mcp,
      mcpConfigured: new Map(this.mcp?.configs.map((c) => [c.name.toLowerCase(), c.enabled]) ?? []),
    };
    return ctx;
  }

  private replayHistory(sessionId: string, snapshot: ContextSnapshot): LLMMessage[] {
    return this.store
      .listMessages(sessionId)
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'tool' ? 'tool' : m.role,
        content: m.content,
        tool_calls: m.toolCalls?.length
          ? m.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.toolName, arguments: JSON.stringify(tc.arguments ?? {}) },
            }))
          : undefined,
        tool_call_id: m.role === 'tool' ? m.tool_call_id : undefined,
      }));
  }

  private buildLLMMessages(ctx: RunContext, extra: LLMMessage[] = []): LLMMessage[] {
    const parts: string[] = [ctx.systemPrompt];
    if (ctx.snapshot.summary) {
      parts.push(`## Conversation Summary (auto-compacted earlier)\n${ctx.snapshot.summary}`);
    }
    if (ctx.runtimeInstructions.length) {
      parts.push(`## Run Guidance\n${ctx.runtimeInstructions.join('\n')}`);
    }
    if (ctx.policyViolation) {
      parts.push(`## Policy Notice\n${ctx.policyViolation}`);
    }
    parts.push(renderContextPanel(ctx.contextManager, ctx.task, ctx.mcpConfigured));
    const system: LLMMessage = { role: 'system', content: parts.filter(Boolean).join('\n\n') };
    return [system, ...ctx.messages, ...extra];
  }

  private async appendAssistantMessage(
    ctx: RunContext,
    content: string,
    toolCalls?: ToolCallJson[],
    usage?: { prompt_tokens: number; completion_tokens: number },
    reasoning?: string | null,
  ): Promise<AgentMessage> {
    const row = await this.store.addMessage(ctx.sessionId, { role: 'assistant', content, toolCalls, usage, reasoning });
    ctx.messages.push({
      role: 'assistant',
      content,
      tool_calls: toolCalls?.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.toolName, arguments: JSON.stringify(tc.arguments ?? {}) },
        ...(tc.thought_signature ? { thought_signature: tc.thought_signature } : {}),
      })),
    });
    return row;
  }

  private async appendToolResult(ctx: RunContext, _parentMessageId: string, toolCallId: string, content: string): Promise<void> {
    await this.store.addMessage(ctx.sessionId, { role: 'tool', content, tool_call_id: toolCallId });
    ctx.messages.push({ role: 'tool', content, tool_call_id: toolCallId });
  }

  private async appendSystemNoteRaw(sessionId: string, content: string): Promise<void> {
    await this.store.addMessage(sessionId, { role: 'system', content });
  }

  private async persistContext(ctx: RunContext): Promise<void> {
    const current = ctx.snapshot;
    const dedupe = (arr: string[]) => Array.from(new Set(arr));
    const next: ContextSnapshot = {
      task: ctx.task,
      summary: current.summary,
      coveredMessages: current.coveredMessages,
      filesRead: dedupe([...current.filesRead, ...ctx.filesRead]),
      filesModified: dedupe([...current.filesModified, ...ctx.filesModified]),
      decisions: dedupe([
        ...current.decisions,
        ...ctx.observations.filter((o) => /decision|chose| decided|approach/i.test(o)),
      ]),
      errors: dedupe([
        ...current.errors,
        ...ctx.observations.filter((o) => /error|fail/i.test(o)),
      ]),
      plan: ctx.plan.length ? ctx.plan : current.plan,
      activeSubContexts: [...ctx.contextManager.activeIds],
      activeContexts: [...ctx.contextManager.activeIds].map((id) => {
        const c = getSubContext(id);
        return { id, title: c?.title ?? id };
      }),
    };
    ctx.snapshot = next;
    this.store.setSessionSnapshot(ctx.sessionId, next);
  }

  private async compactToolOutput(workspacePath: string, runId: string, toolCallId: string, output: string): Promise<string> {
    if (output.length <= 4000) return output;
    try {
      const dir = path.join(workspacePath, '.smoke', 'runs', runId, 'tool-output');
      await fs.promises.mkdir(dir, { recursive: true });
      const file = path.join(dir, `${toolCallId.replace(/[^\w.-]/g, '_')}.txt`);
      await fs.promises.writeFile(file, output, 'utf8');
      return shapeSpilledOutput(output, file);
    } catch (err) {
      this.logger.warn(`compactToolOutput failed: ${err}`);
      return output;
    }
  }

  private async maybeCompact(ctx: RunContext): Promise<void> {
    const estimated = estimateTokens(ctx.messages);
    const budget = resolveTokenBudget(ctx.provider, ctx.model);
    if (estimated <= budget * COMPACTION_THRESHOLD) return;
    if (ctx.messages.length < KEEP_RECENT_MESSAGES + 4) return;
    if (ctx.lastCompactTokens > 0 && estimated <= ctx.lastCompactTokens * 1.15) return;

    const ctxSnapshotRef = ctx.snapshot;
    const result = await this.compaction.compactRunContext({
      sessionId: ctx.sessionId,
      messages: ctx.messages,
      provider: ctx.provider,
      model: ctx.model,
      userId: ctx.userId,
    });
    if (!result) return;

    this.events.emitCompactionStarted(ctx.sessionId, ctx.runId, estimated);
    ctx.messages = result.kept;
    ctx.snapshot = mergeSnapshot(ctxSnapshotRef, result.summary, result.cutIndex);
    ctx.lastCompactTokens = estimated;
    this.events.emitCompactionCompleted(ctx.sessionId, ctx.runId, {
      tokensBefore: estimated,
      tokensAfter: estimateTokens(result.kept),
      tokensSaved: result.tokensSaved,
      messagesCompacted: result.cutIndex,
      summary: result.summary,
    });
  }

  private waitForUserResponse(ctx: RunContext, toolCallId: string): Promise<string> {
    const pre = this.pendingResponseAnswers.get(toolCallId);
    if (pre !== undefined) {
      this.pendingResponseAnswers.delete(toolCallId);
      return Promise.resolve(pre);
    }
    return new Promise((resolve) => {
      const release = this.holdWait();
      this.pendingResponses.set(toolCallId, (value) => {
        this.pendingResponses.delete(toolCallId);
        release();
        resolve(value);
      });
      const onAbort = () => {
        const pending = this.pendingResponses.get(toolCallId);
        if (pending) {
          this.pendingResponses.delete(toolCallId);
          pending('');
        }
        release();
        resolve('');
      };
      ctx.abortController.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async waitForPermission(
    ctx: RunContext,
    toolCallId: string,
    meta: { userId: string; workspacePath: string; toolName: string },
  ): Promise<PermissionEffect> {
    const pre = this.pendingPermissionAnswers.get(toolCallId);
    if (pre !== undefined) {
      this.pendingPermissionAnswers.delete(toolCallId);
      return pre;
    }
    const decision = await this.decidePermission(meta.toolName, { sessionId: ctx.sessionId, runId: ctx.runId }, meta.userId, meta.workspacePath);
    if (decision !== 'ask') return decision;

    return new Promise<PermissionEffect>((resolve) => {
      const release = this.holdWait();
      this.pendingPermissions.set(toolCallId, (value) => {
        this.pendingPermissions.delete(toolCallId);
        release();
        resolve(value);
      });
      const onAbort = () => {
        this.pendingPermissions.delete(toolCallId);
        release();
        resolve('deny');
      };
      ctx.abortController.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async waitForMcpDecision(ctx: RunContext, toolCallId: string): Promise<McpApprovalDecision> {
    const pre = this.pendingMcpDecisionAnswers.get(toolCallId);
    if (pre) {
      this.pendingMcpDecisionAnswers.delete(toolCallId);
      this.applyMcpDecision(ctx, pre);
      return pre;
    }
    return new Promise<McpApprovalDecision>((resolve) => {
      const release = this.holdWait();
      this.pendingMcpDecisions.set(toolCallId, (decision) => {
        this.pendingMcpDecisions.delete(toolCallId);
        release();
        this.applyMcpDecision(ctx, decision);
        resolve(decision);
      });
      const onAbort = () => {
        const pending = this.pendingMcpDecisions.get(toolCallId);
        if (pending) {
          this.pendingMcpDecisions.delete(toolCallId);
          pending({ action: 'skip', names: [] });
        }
        release();
        resolve({ action: 'skip', names: [] });
      };
      ctx.abortController.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** Apply an MCP decision to the live manager and this run's configured map. */
  private applyMcpDecision(ctx: RunContext, decision: McpApprovalDecision): void {
    if (decision.action === 'enable' || decision.action === 'add') {
      for (const id of decision.names) {
        this.mcp?.enable(id);
        ctx.mcpConfigured.set(id.toLowerCase(), true);
      }
    }
  }

  private async persistToolStatus(
    assistantMsg: AgentMessage,
    toolCallId: string,
    status: ToolCallJson['status'],
    output: string,
    result?: unknown,
  ): Promise<void> {
    const toolCalls = (assistantMsg.toolCalls ?? []).map((tc) =>
      tc.id === toolCallId ? { ...tc, status, output, result } : tc,
    );
    await this.store.updateMessage(assistantMsg.sessionId, { ...assistantMsg, toolCalls });
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/** Create a Smoke Monkey agent harness in a few lines. */
export function createAgent(options: AgentOptions): AgentHarness {
  return new AgentHarness(options);
}