# Feature guide — tools (custom tools & built-ins)

Everything the agent can *do* is a **tool**. The library ships the common ones;
products add their own as `ToolDefinition[]` (SDKs, private APIs, product
command surfaces — anything).

## ToolDefinition shape

```ts
export interface ToolDefinition {
  name: string;                      // snake_case, unique
  description: string;               // what it does + WHEN to call it (the model reads this)
  inputSchema: {                     // JSON Schema (OpenAPI subset)
    type: 'object',
    properties: { … },
    required?: string[],
  };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }; // guides permission layer
  execute(args, ctx): Promise<ToolResult> | ToolResult;
}
// ToolResult = { content: [{ type: 'text', text }] }  — or { content, isError?: true } to mark failure.
```

`ctx` (ToolContext) carries the run context: `workspacePath`, `projectDir`,
`sessionId`, `runtimeInstructions` (skill/guidance injections), and
MCP-managed helpers. Custom tools can also `ctx.emitProgress?.(...)` to stream
`tool.progress` events to the UI.

## Built-in tool factories

Filesystem — `getReadFileTool` `getWriteFileTool` `getEditFileTool`
`getLineEditTool` `getReplaceLinesTool` `getApplyPatchTool` `getDeleteFileTool`
`getListDirectoryTool` `getInspectTool`
Terminal — `getRunCommandTool` `getRunTestTool`
Search — `getGlobTool` `getGrepTool`
Git — `getGitStatusTool` `getGitDiffTool` `getGitLogTool`
Agent — `getAskUserTool` `getContextManageTool` `getFinishTaskTool`
`getTodoWriteTool`
MCP — `getInspectMcpStockTool` `getRequestMcpApprovalTool`
Skills — `getListSkillsTool` `getUseSkillTool`

Each is `(ctx: ToolContext) => ToolDefinition` — import and reuse in `tools:`.

## Groups & the default toolset

```ts
import { TOOL_GROUPS, READ_ONLY_TOOLS, FILE_MUTATING_TOOLS } from '@smoke-monkey/harness'
```

`TOOL_GROUPS` — `core`, `filesystem`, `terminal`, `search`, `git`, `agent`,
`mcp`, `skills`. `agent.run()` auto-registers all groups present in the config
plus active MCP/skill tools. `options.tools` accepts group names or a flat list:

```ts
createAgent({
  workspacePath,
  tools: ['filesystem', 'terminal', 'git', mySdkTool, myDbTool],
})
```

## Permission integration

- `annotations.readOnlyHint` → the tool is considered read-only; by default it
  runs without a `permission.required` pause.
- Mutation / `destructiveHint` / terminal tools → pause unless `autoApprove`.
- The run guards flag `inspect_before_mutation` and enforce a mutation budget
  (`mutatingTargetPath`, `mutationBudgetAllows`) so a loop can't hammer a file.
  Custom mutating tools automatically benefit from the same bookkeeping when
  they run under `ctx`.

## Product patterns

- **SDK surfaces** — one `ToolDefinition` per call family (e.g. `shop_list_orders`,
  `shop_ship_order`) with crisp descriptions beats one giant tool.
- **Feedback loops** — tools return machine-readable text; tell the model in the
  description what to do on each output shape.
- **Verification tools** — a `run_test`-style tool per product (linter, compiler
  command, e2e suite) drives the agent's `verify` phase.