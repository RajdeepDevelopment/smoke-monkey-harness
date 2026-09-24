# Tools

Every tool is a `ToolDefinition`:

```ts
type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JSONSchema;          // zod-like or JSON Schema
  annotations?: { title?: string; readOnlyHint?: boolean };
  execute(args: unknown, ctx: ToolContext) => Promise<ToolResult>;
};
```

`ToolResult` is `{ content: [{ type: 'text', text }] }`, or
`{ content, isError: true }` for failures.

## Built-in factories

Take `(ctx: ToolContext)` and return a `ToolDefinition`.

| Area | Factories |
| --- | --- |
| Filesystem | `getReadFileTool` `getWriteFileTool` `getEditFileTool` `getLineEditTool` `getReplaceLinesTool` `getApplyPatchTool` `getDeleteFileTool` `getListDirectoryTool` `getInspectTool` |
| Terminal | `getRunCommandTool` `getRunTestTool` |
| Search | `getGlobTool` `getGrepTool` |
| Git | `getGitStatusTool` `getGitDiffTool` `getGitLogTool` |
| Agent | `getAskUserTool` `getContextManageTool` `getFinishTaskTool` `getTodoWriteTool` |
| MCP | `getInspectMcpStockTool` `getRequestMcpApprovalTool` |
| Skills | `getListSkillsTool` `getUseSkillTool` |

## Groups

Exported consts — `TOOL_GROUPS.core`, `.filesystem`, `.terminal`, `.search`,
`.git`, `.agent`, `.mcp`, `.skills`; plus `READ_ONLY_TOOLS`,
`FILE_MUTATING_TOOLS`, `SEARCH_FAMILY_TOOLS`, `PHASE_TOOLS`.

`agent.run()` registers the core 5 groups + active MCP/skill tools
automatically. Restrict with `options.tools: ['core', 'search']`.

## Custom tools

Pass `ToolDefinition[]` in `options.tools`:

```ts
import { createAgent, buildToolRegistry } from 'smoke-monkey-harness';

const timeTool = {
  name: 'current_time',
  description: 'Return the current UTC time',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    return { content: [{ type: 'text', text: new Date().toISOString() }] };
  },
};

const agent = createAgent({ provider: 'nvidia', model: '...',
  workspacePath: process.cwd(), tools: [timeTool] });
```

## Skills (SKILL.md)

Skills bundle instructions into `<dir>/<skill>/SKILL.md` or `<dir>/<skill>.md`
with `name` / `description` YAML frontmatter — the format used by Claude Code,
Codex, and opencode.

- Discovery: `.opencode/`, `.claude/`, `.codex/` `skills/` folders under the
  workspace **and** home; or set `options.skillsDir`.
- The loop only exposes a one-line catalog (`list_skills`). The model pulls the
  full body with `use_skill(id)`, which injects the `## Skill:` block into the
  next turn — just-in-time.

```ts
import { loadSkillsFromDirs } from 'smoke-monkey-harness';

const skills = loadSkillsFromDirs([`${process.cwd()}/.mine/skills`]);
const agent = createAgent({ /* … */, skills });
```

## Permissions

Read-only tools auto-allow. Mutating tools (file writes, terminal commands) and
MCP servers pause for approval unless `autoApprove: true`.