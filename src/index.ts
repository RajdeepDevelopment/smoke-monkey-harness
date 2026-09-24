/**
 * @smoke-monkey/harness — build agentic tools, AI code editors, and agent
 * harnesses in a few lines. A framework-agnostic rewrite of the core agent
 * loop behind the Smoke Monkey code editor.
 */
export {
  createAgent,
  AgentHarness,
  type AgentOptions,
  type AgentId,
  type RunOptions,
  type RunResult,
  type PermissionPolicy,
  type PermissionRequest,
  type PermissionDecision,
  type ToolGroupName,
} from './harness.js';

export { buildToolRegistry } from './harness.js';

// Core loop + runtime
export {
  AgentLoop,
  MAX_STEPS,
  type AgentLoopDeps,
  type CreateRunContextArgs,
  type AgentLoopParams,
  type McpApprovalDecision,
} from './services/agent-loop.js';
export {
  classifyTaskGroups,
  createEmptySnapshot,
  estimateTokens,
  initialPhase,
  nextPhaseOnCall,
  nextPhaseOnResult,
  phaseDirective,
  resolveTokenBudget,
  buildAgentState,
  resolveExposedTools,
  resolveProjectDir,
  snapshotToSystemMessage,
  toProviderMessages,
  validateSystemPromptCompliance,
  stripSystemMarkers,
  safeParseObject,
  COMPACTION_THRESHOLD,
  KEEP_RECENT_MESSAGES,
  CONTEXT_TOKEN_BUDGET,
  TOOL_GROUPS,
  READ_ONLY_TOOLS,
  SEARCH_FAMILY_TOOLS,
  FILE_MUTATING_TOOLS,
  SYS_MARKERS,
  PHASE_TOOLS,
  getModelCaps,
  type RunContext,
  type LLMMessage,
  type ContextSnapshot,
  type AgentPhase,
  type ModelCaps,
  type McpRuntime,
  type ToolGroupName as RunToolGroupName,
} from './services/run-context.js';

// LLM client + providers
export {
  LLMClient,
  STREAMING_PROVIDERS,
  isOmniRouteFreeTierModel,
  type LLMResponse,
  type LlmClientDeps,
  type LlmStreamHooks,
} from './services/llm-client.js';

// Compaction / memory
export {
  ContextCompactionService,
  findSafeCutIndex,
  mergeSnapshot,
  CHARS_PER_TOKEN,
  type CompactionDeps,
  type CompactRunContextResult,
} from './services/compaction.service.js';

// Tool plumbing
export {
  ToolRegistry,
  definitionToAgentTool,
  type ToolDefinition,
  type ToolContext,
  type ToolResult,
  type AgentTool,
} from './tools/tool-registry.js';

// Tool factories (register these yourself to customise the toolset)
export {
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
export { getRunCommandTool, getRunTestTool } from './tools/terminal.tools.js';
export { getGlobTool, getGrepTool } from './tools/search.tools.js';
export { getGitStatusTool, getGitDiffTool, getGitLogTool } from './tools/git.tools.js';
export { getAskUserTool, getContextManageTool, getFinishTaskTool, getTodoWriteTool } from './tools/agent.tools.js';

// Events
export {
  AgentEventEmitter,
  type AgentEvent,
  type AgentEventListener,
  type AgentEventFilter,
} from './services/agent-event.emitter.js';

// Loop guards
export {
  createRunGuards,
  wouldTripLoopGuards,
  checkDoomLoop,
  checkSearchFamilyLoop,
  checkSameOutput,
  checkEmptyResponse,
  emptyResponseDelay,
  isMutatingTool,
  mutatingTargetPath,
  mutationBudgetAllows,
  applyMutationBookkeeping,
  verificationReadBlocked,
  trackFailedVerification,
  type RunGuards,
  type DoomLoopCheckResult,
  type SearchLoopCheckResult,
  type SameOutputCheckResult,
  type EmptyResponseCheckResult,
} from './services/agent-guards.js';

// Tool-call parsing/validation
export {
  validateToolCalls,
  normalizeToolCalls,
  extractInlineToolCalls,
  getToolDefinition,
  listAllToolNames,
  summarizeTools,
  type LLMToolDef,
  type LLMToolCall,
  type InlineToolCall,
  type ValidatedToolCall,
} from './services/tool-library.js';

// System prompt + context
export { buildSystemPrompt, renderModeBlock, renderPromptTop, type BuildSystemPromptOptions, type BuildSystemPromptDeps } from './lib/system-prompt.js';
export {
  SubContextManager,
  renderContextPanel,
  renderSystemPromptCatalog,
  getSubContext,
  recommendSubContextsForTask,
  SUBCONTEXTS,
  ALL_SUBCONTEXTS,
  DEFAULT_SUBCONTEXTS,
  MAX_ACTIVE_CONTEXTS,
  type SubContext,
} from './context/sub-context.js';

// Legacy facade
export { SmAgent, type SmAgentConfig, type SmAgentRunOptions, type SmAgentRunDeps } from './lib/agent.js';

// Storage
export { MemoryStore, createMemoryStore, type Storage } from './store.js';

// Models + keys
export {
  type AgentMessage,
  type ToolCallJson,
  type TodoItem,
  type AgentState,
  type HarnessRun,
  type HarnessSession,
  type PermissionEffect,
} from './models.js';
export { envKey, type KeyResolver } from './keys.js';
export { IGNORE_DIRS, SEARCH_EXCLUDE_DIRS, isSmokePath } from './ignores.js';

// Misc helpers
export { shapeSpilledOutput, ARTIFACTS_ROOT, ARTIFACT_DIRS } from './services/artifact-store.js';
export { normalizeText, applyLineEdits, parseEdits, type LineEditResult, type NormalizeResult } from './tools/line-edit.js';
export { formatResolutionError, type ResolveResult } from './tools/path-resolver.js';
export { Logger, setLogLevel, Injectable, type LoggerOptions } from './logger.js';