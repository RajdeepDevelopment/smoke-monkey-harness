# Feature digests — the 9 building blocks

Standalone learning when the MCP server is not available. Each digest
condenses the full feature guide (which the MCP server also serves via
`harness_guide_<feature>`).

## 1. Sub-contexts — on-demand guidance blocks

Model opens/closes them with `context_manage` (`set|activate|deactivate|swap|list`,
max 10 active; `pinned` can’t be deactivated). Active blocks render into the
system prompt under `## <Title>`. Built-ins: workflow (`efficient_editing`,
`todo_management`, `git_hygiene`, …), quality (`verification_rigor`,
`debugging`, `code_quality`, …), architecture (`backend_scale`, `api_contract`,
`data_modeling`, `production_readiness`, …), ui (`frontend_ui`), gen-ai
(`pdf_generation`, …), core/pinned (`agent_operating_principles`), plus
`mcp_<id>` per server and any you register.

```ts
subContexts: [{ id: 'team_rules', title: 'Team Rules', summary: '…when to open',
  content: '…guidance body…', cost: 'low', closeWhen: 'after the edit', pinned: false }],
defaultSubContexts: ['team_rules'],   // active from run start
```

## 2. Skills — SKILL.md, just-in-time

Same format as Claude Code / Codex / opencode. Frontmatter `name` +
`description`, then a body injected only when used (nothing wasted until the
moment it matters). Discover: `skills` (objects), `skillsDir` (paths), or
default dirs (`.opencode/.claude/.codex/skills` under workspace + home). The
model browses with `list_skills` and pulls with `use_skill(id)`.

## 3. MCP servers — attach the ecosystem

```ts
mcp: [{ id, name, description, command, args, enabled }]        // stdio
     [{ id, name, description, url, headers, enabled }]         // streamable-HTTP
```

Lazy-connect on first `mcp_<id>` activation; tools surface as `<id>__<tool>`;
unknown/disabled servers pause `request_mcp_approval` →
`resolveMcpDecision(toolCallId, { action: 'enable'|'leave'|'deny', names })`.
Curated stock: `listStockCategories()`, `findStockEntry(name)`,
`stockToMcpConfig(entry)`. Manage at runtime: `addMcpServer/removeMcpServer/listMcpServers`.

## 4. Providers & models

| provider | key env | notes |
| --- | --- | --- |
| `nvidia` | `NVIDIA_API_KEY` | `nvidia/nemotron-3-super-120b-a12b` (tool-calls + streaming) |
| `openai` | `OPENAI_API_KEY` | gpt-5 |
| `openrouter` | `OPENROUTER_API_KEY` | many models, one key |
| `xai` | `XAI_API_KEY` | Grok |
| `gemini` | `GEMINI_API_KEY` | Gemini |
| `opencode` | `OPENCODE_API_KEY` | opencode gateway |
| `omniroute` | `OMNIROUTE_API_KEY` | `https://api.getomni.app/openai/v1` |
| `ollama` | none | default, `http://localhost:11434` |

Keys via `apiKey` string or resolver `(provider, userId?) => key`. The loop
retries transient 5xx with backoff; `tool_calls` without prose
(`content: null`) is normal and handled.

## 5. Tools — everything the agent can do

`ToolDefinition = { name, description, inputSchema, annotations?, execute }`.
Built-in factories (per group): filesystem (read/write/edit/line_edit/
replace_lines/apply_patch/delete/list_directory/inspect), terminal
(run_command/run_test), search (glob/grep), git (status/diff/log), agent
(ask_user/context_manage/todo_write/finish_task), mcp, skills. Groups:
`TOOL_GROUPS.{core,filesystem,terminal,search,git,agent,mcp,skills}`.
`annotations.readOnlyHint` auto-allows; mutating via `ctx` gets guard
bookkeeping. `options.tools` = group names[] or your `ToolDefinition[]`.

## 6. Loop — phases, guards, compaction

`explore → plan → edit → verify → recover → complete`. Automatic guards:
no-progress, repeated-failure, same-output, empty-response(+backoff),
search-family/doom-loop, runaway `MAX_STEPS` (default 1000). Verification
failures demote `verify → recover`. Auto-compaction past 0.9 ×
`CONTEXT_TOKEN_BUDGET` (default 164k) keeps `KEEP_RECENT_MESSAGES`; active
sub-contexts survive. `agent.abort()` interrupts.

## 7. Permissions — the three pauses

1. `permission.required` → `resolvePermission(toolCallId, 'allow'|'deny')`
   (read-only auto-passes by default policy `ask-default`; also `allow-all`,
   `deny-all`, or a custom `PermissionPolicy`).
2. `ask_user.required` → `respond(toolCallId, answer)` (payload has `question`).
3. `request_mcp_approval` / `mcp.approval_required` →
   `resolveMcpDecision(toolCallId, { action, names })`.

`autoApprove: true` collapses #1 + #3’s recommended path; #3 still pauses.

## 8. Storage & sessions

Implement the small `Storage` surface (sessions `ensure/get/setStatus/
setSnapshot/addTokens`; runs `ensure/get/bumpStep/setStatus/setAgentState/
addTokens`; messages `add/update/list`). `MemoryStore` ships as reference.
Stable `sessionId` + a persistent `store` ⇒ later `agent.run()` resumes the
conversation. `HarnessRun`/`HarnessSession` carry step + token/cost counters.

## 9. Events — what your UI renders

Subscribe `agent.on(type, fn)` / `agent.onAny(fn)`; payload in `e.data`.
Lifecycle: `run.started/completed/failed/interrupted` · `step.started/ended` ·
`phase.changed`. Streaming chat: `text.delta` · `text.thought` · `text.end`.
Tool cards: `tool.started/output/progress/completed/failed`. Pauses:
`permission.required` · `ask_user.required` · `mcp.approval_required` (+
resolutions). State/context: `context.updated` · `state.changed` ·
`todo.updated` · `compaction.started/completed` · `llm.thinking`.