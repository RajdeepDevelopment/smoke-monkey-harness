import { Logger } from '../logger.js';

export type PermissionEffect = 'allow' | 'deny' | 'ask';

export interface ToolContext {
  sessionId: string;
  runId: string;
  workspaceDir: string;
  workspacePath: string;
  userId: string;
  abortSignal: AbortSignal;
  /** The ID of the specific tool call being executed (for event routing). */
  toolCallId?: string;
  /** Workspace index (optional) for fast symbol lookups. */
  workspaceIndex?: unknown;
  /** Event emitter for real-time UI updates (tool.output, context.updated, etc.). */
  eventEmitter?: import('../services/agent-event.emitter.js').AgentEventEmitter;
  /** When set, commands should execute on the remote host (SSH profile). */
  remoteSsh?: { destinationId: string; userId: string };
  /**
   * The run's live sub-context manager. context_manage mutates it in place;
   * the next loop iteration re-renders the panel and feeds new guidance.
   */
  contextManager?: import('../context/sub-context.js').SubContextManager;
  /**
   * The run's live runtime-instruction buffer (same array fed to
   * buildLLMMessages every turn). Tools like use_skill push guidance here so
   * it is injected into the system prompt on the next LLM call.
   */
  runtimeInstructions?: string[];
}

export interface ToolContent {
  type: 'text' | 'image';
  text?: string;
  data?: string;
  mimeType?: string;
}

/** Pointer to on-disk output the LLM can read_file when it needs details. */
export interface ToolArtifact {
  path: string;
}

export interface ToolMetadata {
  durationMs?: number;
  exitCode?: number | null;
  timedOut?: boolean;
  files?: string[];
  [key: string]: unknown;
}

export interface ToolResult {
  success?: boolean;
  /** Full tool payload for the LLM — kept compact; oversized output spills to `artifact`. */
  output?: string;
  /** One-line human/LLM-facing summary (UI, events, snapshot notes). */
  summary?: string;
  /** Structured payload for UI/future consumers — never sent to the LLM verbatim. */
  data?: unknown;
  artifact?: ToolArtifact;
  metadata?: ToolMetadata;
  content?: ToolContent[];
  isError?: boolean;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
}

/**
 * The families a UI can fall back to when a tool ships no icon of its own.
 * Mirrors the FE's `ToolFamily` so one value works on both sides.
 */
export const TOOL_FAMILIES = ['inspect', 'edit', 'run', 'verify', 'git', 'plan', 'ask'] as const;
export type ToolFamily = (typeof TOOL_FAMILIES)[number];

export type ToolTone = 'default' | 'primary' | 'success' | 'warning' | 'destructive';

/**
 * How a tool presents itself in a UI.
 *
 * Serializable on purpose. A custom tool is declared once in Node but has to
 * render in a browser, and a React component cannot cross that boundary — so
 * the icon is an emoji and everything else is plain data. The result travels
 * out on `tool.started`, which means the glyph a user sees is the glyph the
 * tool declared, with no second registry on the frontend to keep in sync.
 */
export interface ToolPresentation {
  /** Emoji glyph, e.g. `"💳"`. Wins over `family` when both are given. */
  icon?: string;
  /** Human label. The UI falls back to a title-cased tool name. */
  label?: string;
  /** Family key, so a UI can pick a sensible glyph when `icon` is absent. */
  family?: ToolFamily;
  /** Accent for the glyph, mapped to the active theme's tokens. */
  tone?: ToolTone;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: ToolAnnotations;
  /** Icon/label for the UI. Purely presentational; the model never sees it. */
  presentation?: ToolPresentation;
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult | {
    content: ToolContent[];
    isError?: boolean;
  }>;
}

export interface AgentTool {
  name: string;
  description: string;
  parameterSchema: Record<string, unknown>;
  permissionAction: string;
  presentation?: ToolPresentation;
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export function definitionToAgentTool(def: ToolDefinition): AgentTool {
  return {
    name: def.name,
    description: def.description,
    parameterSchema: def.inputSchema,
    permissionAction: def.annotations?.destructiveHint ? 'ask' : 'allow',
    ...(def.presentation ? { presentation: def.presentation } : {}),
    execute: async (input, ctx) => {
      // Both union members are ToolResult-compatible; unify for field access.
      const result = (await def.execute(input, ctx)) as ToolResult;
      const textParts = (result.content ?? [])
        .filter(c => c.type === 'text' && c.text)
        .map(c => c.text);
      const output = textParts.join('\n') || '(no output)';
      return {
        success: !result.isError,
        output,
        summary: result.summary,
        data: result.data,
        artifact: result.artifact,
        metadata: result.metadata ?? {},
        content: result.content,
        isError: result.isError,
      };
    },
  };
}

export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly tools = new Map<string, AgentTool>();

  register(toolOrDef: AgentTool | ToolDefinition): void {
    const tool = 'inputSchema' in toolOrDef ? definitionToAgentTool(toolOrDef as ToolDefinition) : toolOrDef as AgentTool;
    this.tools.set(tool.name, tool);
    this.logger.debug(`Registered tool: ${tool.name}`);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  getAll(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  /** Presentation for one tool, if it declared any. */
  getPresentation(name: string): ToolPresentation | undefined {
    return this.tools.get(name)?.presentation;
  }

  /**
   * Every tool's presentation, keyed by tool name.
   *
   * A server sends this once on connect so a freshly loaded client can render
   * custom tools correctly *before* the first `tool.started` arrives, and so a
   * history replayed from storage keeps its icons.
   */
  getPresentations(): Record<string, ToolPresentation> {
    const out: Record<string, ToolPresentation> = {};
    for (const [name, tool] of this.tools) {
      // Copied, not aliased. This is the one place a bulk map escapes the
      // registry, and a host that merges it (or a test that pokes at it) would
      // otherwise be editing the very objects later `tool.started` payloads
      // are built from — one bad write, and every future event ships the
      // mutated icon.
      if (tool.presentation) out[name] = { ...tool.presentation };
    }
    return out;
  }

  getDefinitions(only?: Set<string>): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    return Array.from(this.tools.values())
      .filter((t: AgentTool) => !only || only.has(t.name))
      .map((t: AgentTool) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameterSchema,
      }));
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: `Unknown tool: ${name}` };
    }

    if (ctx.abortSignal.aborted) {
      return { success: false, output: 'Tool execution cancelled' };
    }

    try {
      const result = await tool.execute(input, ctx);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Tool ${name} failed: ${message}`);
      // isError MUST be set: downstream treats thrown failures as real
      // failures (ToolFailed event, 'failed' status, phase demotion to
      // RECOVER, completion detection). Without it a crashed tool would be
      // disguised as a success.
      return { success: false, output: `Error: ${message}`, isError: true };
    }
  }
}
