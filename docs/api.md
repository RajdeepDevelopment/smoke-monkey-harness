# API reference

The package's public surface is exported from `src/index.ts`. Sliced by area:
**options** · **surface** · **events** · **tools** · **providers** ·
**subcontexts** · **skills** · **mcp** · **loop** · **permissions**.

## options — `createAgent({…})` AgentOptions

```ts
createAgent({
  provider,            // 'openai' | 'openrouter' | 'nvidia' | 'xai' | 'gemini' | 'opencode' | 'omniroute' | 'ollama'
  model,               // e.g. 'nvidia/nemotron-3-super-120b-a12b', 'gpt-5', 'anthropic/claude-3.7-sonnet'
  apiKey,              // string | (provider, userId?) => string   (omit for local ollama)
  baseUrl,             // optional OpenAI-compatible override
  workspacePath,       // REQUIRED — the directory the agent operates in
  projectDir,          // optional sub-dir tool calls default to
  agentId,             // 'build' (default) | 'plan' | 'explore' | 'general'
  tools,               // ToolGroupName[] | 'all' | ToolDefinition[]
  systemPrompt,        // replace the built-in system prompt
  subSystemPrompt,     // extra guidance appended to the system prompt (string | string[])
  permission,          // Policy: allow read-only, ask for mutations/commands (customise via PermissionPolicy)
  autoApprove,         // if true: no waits for permission.required
  sessionId,           // stable id → runs share memory
  store,               // Storage backend (default in-memory)
  userId,              // for key resolution / permission requests
  loadProjectConfig,   // async per-project instruction loader for the system prompt
  subContexts,         // custom SubContext[] (activatable via context_manage)
  defaultSubContexts,  // ids active at run start
  mcp,                 // McpServerConfig[] — stdio (command/args) or streamable-HTTP (url/headers)
  skills,              // Skill[] (or build from SKILL.md dirs)
  skillsDir,           // string | string[] of SKILL.md folders
  logger,              // LoggerOptions
})
```

## surface — the returned agent object

```
run(taskOrMessages, runOpts?)   → Promise<RunResult>   // drives the whole loop
respond(toolCallId, answer)                       // resolve an ask_user.required pause
resolvePermission(toolCallId, allow | deny)       // resolve permission.required
resolveMcpDecision(toolCallId, { action, names }) // enable/leave/deny mcp servers
addMcpServer(cfg) / removeMcpServer(id) / listMcpServers()
abort()                                  // interrupt the current run
on(type, fn) / onAny(fn) / events        // subscribe (see events below)
.skills.all() / .get(id) / count         // registered skills
.agentId                                 // 'build' | 'plan' | 'explore' | 'general'
```

`RunResult`: `{ runId, sessionId, status: 'completed'|'failed'|'interrupted'|'cancelled',
startedAt, endedAt, messages, steps: Snapshot, tokens, phases, … }`

## events — subscribe with `agent.on(...)` / `agent.onAny(...)`, payload via `e.data`

- Run lifecycle — `run.started` · `run.completed` · `run.failed` · `run.interrupted`
- Step — `step.started` · `step.ended` · `phase.changed` (`explore→plan→edit→verify→recover→complete`)
- Turn text — `text.delta` (streaming tokens) · `text.thought` · `text.end`
- Tools — `tool.started` · `tool.output` · `tool.progress` · `tool.completed` ·
  `tool.failed` (all carry `toolCallId`)
- Pauses (resolve via surface methods) — `permission.required` → `resolvePermission`;
  `ask_user.required` / `ask_user.response`; `request_mcp_approval` /
  `mcp.approval_required` → `resolveMcpDecision`; `mcp.resolved`
- Context — `context.updated` · `state.changed` · `agent.state` · `todo.updated`
- Other — `llm.thinking` · `compaction.started` · `compaction.completed`

Wire every pause to your UI — or set `autoApprove: true` and just resolve
`ask_user.required` (see `examples/plugin-demo.ts`).

## subcontexts — on-demand guidance blocks

`registerSubContext({ id, title, summary, content, icon?, lockMode?, writeWatchers? })`.
The model opens/closes them with the `context_manage` tool
(`set / activate / deactivate / swap / list`), max 10 active. Built-ins:
`goal`, `task`, `research_mode`, `constants`, `skills`, `notes`, `mcp_*`.
`options.defaultSubContexts` pre-activates ids. Active sub-context blocks are
rendered into the system prompt under `## <Title>`.

## loop — phases, guards, compaction

Phases by task group — `explore → plan → edit → verify → recover → complete`
via `classifyTaskGroups` / `nextPhaseOnCall` / `nextPhaseOnResult`. Guards
(`createRunGuards`, auto-on): no-progress, repeated-failure, same-output,
empty-response (with backoff), search-family loop, runaway-step `MAX_STEPS`
(default `1000`, bump via RunOptions). Verification failures demote
`verify → recover`. Auto-compaction past `COMPACTION_THRESHOLD` (default 0.9)
summarises history, keeping `KEEP_RECENT_MESSAGES`. Budgets:
`CONTEXT_TOKEN_BUDGET` (default 164k) and `resolveTokenBudget()`.

## permissions — the three interactive pauses

1. `permission.required` — tool needs allow/deny (read-only auto-allowed).
2. `ask_user.required` — the model asked the human (answer via `respond`).
3. `request_mcp_approval` / `mcp.approval_required` — enable MCP servers.

`autoApprove: true` collapses #1 and auto-enables MCP.