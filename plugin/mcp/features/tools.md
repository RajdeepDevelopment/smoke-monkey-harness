# Feature guide — tools (custom tool implementation)

Everything the agent can *do* is a **tool**. The library ships the common ones;
products add their own as `ToolDefinition[]` (SDKs, private APIs, product
command surfaces — anything).

This guide is the reference for **using** the built-in tools, **writing** your
own, and **rendering** them in a UI. Read it end to end before you add a tool:
three of the facts below (the two different group enums, `output` vs `data`, and
the `destructiveHint` default) are the ones people get wrong.

## The two shapes

There are two types with similar names, and the difference matters.

| | `ToolDefinition` | `AgentTool` |
|---|---|---|
| who writes it | **you** | the library |
| execute returns | `content: [{type:'text',text}]` **or** `output: string` | `output: string` (normalized) |
| schema field | `inputSchema` | `parameterSchema` |
| permission | `annotations` you set | `permissionAction` derived from them |

`ToolRegistry.register()` accepts either and calls `definitionToAgentTool()`,
which is where the two shapes meet. That adapter is the single most important
thing to understand:

```ts
export function definitionToAgentTool(def: ToolDefinition): AgentTool {
  return {
    permissionAction: def.annotations?.destructiveHint ? 'ask' : 'allow',
    execute: async (input, ctx) => {
      const result = await def.execute(input, ctx);
      // joins every text part into `output`; defaults to '(no output)'
      const textParts = (result.content ?? []).filter(c => c.type === 'text' && c.text).map(c => c.text);
      return { success: !result.isError, output: textParts.join('\n') || '(no output)', /* … */ };
    },
  };
}
```

Three consequences, all of which are quiet failures if you miss them:

1. **The model only ever reads `output`.** It is built from `content[].text`.
   A tool that returns a `data` payload and no text gives the model the literal
   string `(no output)`.
2. **`data` is for the UI, not the model.** It rides events and snapshots and is
   never sent to the LLM verbatim. If the model needs a value, put it in the
   text — or in both, if a UI should also read it.
3. **`destructiveHint` is the only thing that triggers a permission pause.** A
   custom tool that writes, deletes, charges money, or sends requests is
   `permissionAction: 'allow'` — no prompt — until you set
   `annotations.destructiveHint: true`. Fail open by default; opt in explicitly.

## ToolDefinition shape

```ts
export interface ToolDefinition {
  name: string;                      // snake_case, unique
  description: string;               // what it does + WHEN to call it (the model reads this)
  inputSchema: {                     // JSON Schema (OpenAPI subset) — SENT to the model, not enforced
    type: 'object',
    properties: { … },
    required?: string[],
  };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  presentation?: ToolPresentation;   // icon/label for the UI (see "Rendering tools")
  execute(args, ctx): Promise<ToolResult> | ToolResult;
}

export interface ToolResult {
  success?: boolean;
  output?: string;        // what the MODEL reads (preferred, no adapter needed)
  summary?: string;       // one line for events / snapshot notes
  data?: unknown;         // structured payload for the UI — never sent to the model
  artifact?: { path: string };  // pointer to on-disk output when `output` must stay small
  metadata?: { durationMs?: number; exitCode?: number | null; timedOut?: boolean; files?: string[]; [k: string]: unknown };
  isError?: boolean;      // MUST be set on failure — see below
  content?: Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }>;
}
```

`ctx: ToolContext` carries the live run: `sessionId`, `runId`, `userId`,
`workspacePath`, `workspaceDir`, `abortSignal`, `toolCallId`, plus the three
handles that let a tool affect the run beyond its own return value:

- `ctx.eventEmitter?` — stream `tool.progress`-style events to the UI.
- `ctx.contextManager?` — the **live** sub-context manager; `context_manage`
  mutates it in place and the next loop iteration re-renders the panel.
- `ctx.runtimeInstructions?` — the same array fed to `buildLLMMessages` every
  turn. Push guidance here and it is injected into the system prompt on the
  **next** LLM call. This is how `use_skill` works, and it is the clean way for
  a tool to teach the model something without spending a turn.

## Built-in tools

Every factory is `() => ToolDefinition` **except** the three that need a live
dependency: `getInspectMcpStockTool(mcp)`, `getRequestMcpApprovalTool(mcp)`,
`getListSkillsTool(registry)`, `getUseSkillTool(registry)`, and
`getRunCommandTool(connectors?)`.

| tool | factory | group (`options.tools`) | notes |
|---|---|---|---|
| `read_file` | `getReadFileTool` | `filesystem` | read-only; feeds the "read before edit" guard |
| `write_file` | `getWriteFileTool` | `filesystem` | mutating |
| `edit_file` | `getEditFileTool` | `filesystem` | mutating |
| `line_edit` | `getLineEditTool` | `filesystem` | mutating, line-scoped |
| `replace_lines` | `getReplaceLinesTool` | `filesystem` | mutating, range-scoped |
| `apply_patch` | `getApplyPatchTool` | `filesystem` | mutating, unified diff |
| `delete_file` | `getDeleteFileTool` | `filesystem` | mutating |
| `list_directory` | `getListDirectoryTool` | `filesystem` | read-only |
| `inspect` | `getInspectTool` | `filesystem` | read-only, fast project overview |
| `run_command` | `getRunCommandTool` | `terminal` | `background=true` for servers |
| `run_test` | `getRunTestTool` | `terminal` | drives the `verify` phase |
| `glob` | `getGlobTool` | `search` | read-only |
| `grep` | `getGrepTool` | `search` | read-only |
| `git_status` | `getGitStatusTool` | `git` | read-only |
| `git_diff` | `getGitDiffTool` | `git` | read-only |
| `git_log` | `getGitLogTool` | `git` | read-only |
| `ask_user` | `getAskUserTool` | `agent` | **pauses** the run |
| `context_manage` | `getContextManageTool` | `agent` | activate/deactivate sub-contexts + `mcp_<id>` |
| `finish_task` | `getFinishTaskTool` | `agent` | structural completion signal |
| `todo_write` | `getTodoWriteTool` | `agent` | on-screen task list |
| `find_symbol` | `getFindSymbolTool` | *(not in a group)* | read-only |
| `search_code` | `getSearchCodeTool` | *(not in a group)* | read-only |
| `docker_exec` | `getDockerExecTool` | *(not in a group)* | register it yourself |
| `docker_list` | `getDockerListTool` | *(not in a group)* | register it yourself |
| `inspect_mcp_stock` | `getInspectMcpStockTool(mcp)` | auto, opt-in | read-only, **never** pauses; needs `mcpStockSearch: true` |
| `request_mcp_approval` | `getRequestMcpApprovalTool(mcp)` | auto | **pauses** the run |
| `list_skills` | `getListSkillsTool(registry)` | auto, when skills exist | read-only |
| `use_skill` | `getUseSkillTool(registry)` | auto, when skills exist | pushes into `runtimeInstructions` |

### There are TWO group enums — they are not interchangeable

This is the single most common mistake, and it fails silently (the tool just
never appears).

```ts
// 1. options.tools — what the registry LOADS. From src/harness.ts.
type ToolGroupName = 'filesystem' | 'terminal' | 'search' | 'git' | 'agent';

// 2. TOOL_GROUPS — what the model is EXPOSED to, and what the guards read.
//    From src/services/run-context.ts.
type ToolGroupName = 'core' | 'exploration' | 'editing' | 'verification' | 'git' | 'docker';
```

`options.tools` takes group names **or** a flat list, and `'all'` / `[]` mean
"everything":

```ts
createAgent({
  workspacePath,
  tools: ['filesystem', 'terminal', 'git', mySdkTool, myDbTool],
})
```

Custom tools are always exposed on top of the groups, so a host tool in `tools:`
never needs a group. `classifyTaskGroups(task, agentId)` picks the *exposure*
groups per run — read-only asks get `exploration` only, code tasks get editing
too — which is why a coding agent sees more schemas than a question-answering
one, even with identical options.

## Writing a custom tool

```ts
import type { ToolDefinition } from '@smoke-monkey/harness'

const searchDocs: ToolDefinition = {
  name: 'search_docs',                       // snake_case; must not collide with a built-in
  description:
    'Search the internal product docs. Call this when the task needs product behaviour ' +
    'the code does not state (pricing rules, supported flags, known limits). ' +
    'Returns ranked passages; cite the doc id in your answer.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look up, 2-8 keywords.' },
      limit: { type: 'number', description: 'Max passages (default 5).' },
    },
    required: ['query'],
  },
  annotations: { readOnlyHint: true },       // no permission pause
  presentation: { icon: '📚', label: 'Search docs', family: 'inspect' },
  async execute(input, ctx) {
    // 1. VALIDATE — the schema is advertised, not enforced.
    const query = typeof input.query === 'string' ? input.query.trim() : ''
    if (!query) {
      // Recoverable, and it says how to fix itself. NOT a throw.
      return { output: 'Error: `query` is required, e.g. query="rate limits".', isError: true }
    }
    if (ctx.abortSignal.aborted) {
      return { output: 'Cancelled.', isError: true }
    }

    // 2. DO THE WORK
    const passages = await myApi.search(query, Number(input.limit ?? 5))

    // 3. RETURN — text for the model, data for the UI, both optional.
    return {
      success: true,
      output: passages.length
        ? passages.map(p => `- [${p.id}] ${p.title}\n  ${p.snippet}`).join('\n')
        : 'No doc matched. Try different keywords, or proceed with what the code shows.',
      summary: `${passages.length} passage(s) for "${query}"`,
      data: { query, ids: passages.map(p => p.id) },   // UI only — never sent to the model
    }
  },
}
```

Register it:

```ts
const agent = createAgent({
  workspacePath,
  tools: ['filesystem', 'terminal', searchDocs],   // group names + ToolDefinition mixed freely
})
```

### Failure is `isError: true`, not a throw

`ToolRegistry.execute()` catches a throw and converts it to
`{ success: false, output: 'Error: …', isError: true }` — so a crash and a
handled failure look identical downstream. That matters: `isError: true` is a
**recoverable** result (the loop demotes the phase, emits `tool.failed`, and the
model can retry), while a terminal problem should end the run deliberately.

Write error text the model can act on — say what was wrong *and* what a valid
call looks like. `"Error: query required"` wastes a turn; `"Error: `query` is
required, e.g. query=\"rate limits\""` usually fixes it in one.

### Validate inside `execute` — there is no runtime schema check

Three layers, and the third one is on you:

1. `validateToolCalls()` drops a call with an empty/missing name or
   non-JSON `arguments` **before** it becomes a tool event.
2. `safeParseObject()` coerces the arguments to a plain object. Your `execute`
   can receive `{}` for arguments the model botched — never `null`, never a
   parse error.
3. **Your `inputSchema` is not enforced.** It is sent to the model as
   `parameters` and that is all. `required` is a request, not a guarantee.

## Permissions & annotations

- `annotations.readOnlyHint: true` → the tool is treated as read-only: it runs
  without a `permission.required` pause, is safe to run concurrently, and is
  excluded from the mutation budget.
- `annotations.destructiveHint: true` → `permissionAction: 'ask'`, so the run
  pauses for `permission.required` unless the policy allows it.
- **Neither annotation is a security boundary.** They are declared by the tool
  author and trusted by the loop. If a custom tool can spend money, delete
  production data, or send external requests, mark it `destructiveHint` *and*
  enforce a real policy with `permission: (req) => …`.
- To opt a tool into the run's bookkeeping, add its name to `READ_ONLY_TOOLS`
  / `FILE_MUTATING_TOOLS` / `SEARCH_FAMILY_TOOLS`; otherwise the "read before
  edit", mutation-budget, and doom-loop guards do not know it exists.

## Rendering tools in the UI

`presentation` is a small serializable hint. It is declared once in Node but has
to render in a browser, and a React component cannot cross that boundary — so
it is plain data, not a component.

```ts
export interface ToolPresentation {
  icon?: string;                                  // emoji, wins over `family`
  label?: string;                                 // UI falls back to a title-cased name
  family?: 'inspect' | 'edit' | 'run' | 'verify' | 'git' | 'plan' | 'ask';
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
}
```

`registry.getPresentations()` returns every declared presentation keyed by tool
name. Send it **once on connect**, not per event: it lets a freshly loaded
client render custom tools correctly *before* the first `tool.started`, and it
keeps icons intact when a history is replayed from storage. The map is copied
per tool, so a host that merges it cannot mutate the objects later events are
built from.

In `@smoke-monkey/ui`, `tool.started` / `tool.completed` / `tool.failed` render
as tool cards. Give a custom tool a `presentation` (or a `family`) and it looks
native; without one the UI falls back to a title-cased name. Wire the answer
paths for pauses separately — see
`harness_guide_permissions_the_three_pauses`.

## Product patterns

- **SDK surfaces** — one `ToolDefinition` per call family (e.g. `shop_list_orders`,
  `shop_ship_order`) with crisp descriptions beats one giant tool. One tool with
  a `action` enum forces the model to memorise a branching schema.
- **Teach through `ctx.runtimeInstructions`** — when a tool discovers a
  convention worth keeping (a required sequence, a gotcha), push it there
  instead of hoping the model remembers the result.
- **Keep `output` small** — the loop compacts large output and can spill it to
  an `artifact` path the model then `read_file`s. Do not paste a 200 KB dump
  into `output`; summarise and point at the artifact.
- **Feedback loops** — tools return machine-readable text; tell the model in
  the description what to do on each output shape, including the empty case.
- **Verification tools** — a `run_test`-style tool per product (linter,
  compiler, e2e) drives the agent's `verify` phase, which is what closes the
  loop instead of the agent declaring victory.
- **Add a `todo_write`-style status tool** for long multi-step work; the UI
  renders it as a live task list, which is most of the value of showing a run.
