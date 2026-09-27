# smoke-monkey-harness — condensed reference

> Companion files in this folder: `features.md` (9 building-block digests) and
> `mcp-tools.md` (the 18 tools of the bundled MCP server). Deeper, live docs
> also come from the MCP server: `harness_api({ area })` and
> `harness_guide_<feature>`.

## `createAgent(options)` → `AgentHarness`

| option | type / values | notes |
| --- | --- | --- |
| `provider` | `openai` `openrouter` `nvidia` `xai` `gemini` `opencode` `omniroute` `ollama` | default `ollama` |
| `model` | string | needs tool-call support |
| `apiKey` | string \| `(provider, userId?) => key` | default: env keys |
| `baseUrl` | string | OpenAI-compatible override |
| `workspacePath` | string **(required)** | agent operating dir |
| `projectDir` | string | tool default dir; falls back to workspacePath |
| `agentId` | `build` `plan` `explore` `general` | mode prompt block |
| `tools` | group names[] \| `ToolDefinition[]` | groups: `filesystem` `terminal` `search` `git` `agent` |
| `systemPrompt` / `subSystemPrompt` | string \| string[] | replace / append to built-in prompt |
| `permission` | `allow-all` `deny-all` `ask-default` \| `PermissionPolicy` fn | read-only tools auto-allow in `ask-default` |
| `autoApprove` | boolean | skip permission pauses |
| `sessionId` | string | share memory across runs |
| `store` | `Storage` | default in-memory |
| `subContexts` / `defaultSubContexts` | `SubContext[]` / ids | custom guidance blocks |
| `skills` / `skillsDir` | `Skill[]` / path(s) | SKILL.md just-in-time loading |
| `mcp` | `McpServerConfig[]` | stdio (`command`/`args`) or streamable-HTTP (`url`) |

## Agent harness surface
- `agent.run(task, opts?)` → `RunResult { sessionId, runId, status, messages, agentState }`
- `agent.respond(toolCallId, text)` — answer `ask_user.required`
- `agent.resolvePermission(toolCallId, 'allow'|'deny')` — answer `permission.required`
- `agent.resolveMcpDecision(toolCallId, { action, names })` — answer `mcp.approval_required`
- `agent.addMcpServer(cfg)` / `removeMcpServer(id)` / `listMcpServers()`
- `agent.skills.all()` / `.get(id)` / `.count` — live skill registry
- `agent.getToolPresentations()` → `Record<string, {label, icon, tone, group}>`
  — icon/label metadata for every registered tool, so a UI can render a tool card
  before the first event arrives. A `presentation` passed on the individual
  event overrides the registered one.
- `agent.abort()` — stop the run
- `agent.on(type, cb)` / `agent.onAny(cb)` / `agent.events` / `agent.store`

## Events (bind UI here)
`run.started/completed/failed/interrupted` · `step.started/ended` ·
`tool.started/output/progress/completed/failed` · `text.delta/thought/end` ·
`phase.changed` · `context.updated` · `permission.required` ·
`ask_user.required` · `mcp.approval_required` · `mcp.resolved` ·
`compaction.started/completed` · `llm.thinking` · `todo.updated`

Tool events (`tool.started/output/progress/completed/failed`) all carry
`toolName`, and tool cards carry `presentation` (`{label, icon, tone, group}`)
on start and on every completion, so a failed card never loses its icon. A call
denied by a `beforeToolCall` hook reaches `afterToolCall` with `blocked: true`
and an `error` carrying the reason — a policy refusal, distinguishable from a
crash by an audit, though the UI itself just renders it as a tool error.

## Built-in tools by group
- filesystem: read_file write_file edit_file line_edit replace_lines apply_patch delete_file list_directory inspect
- terminal: run_command run_test
- search: glob grep
- git: git_status git_diff git_log
- agent: ask_user context_manage todo_write finish_task (+ list_skills use_skill; + MCP tools)

## Sub-contexts
Open/close guidance with `context_manage`: `set | activate | deactivate | swap | list`,
max `MAX_ACTIVE_CONTEXTS` (10) active. MCP servers are contexts too (`mcp_<id>`);
their tools exist only while active, named `<server>__<tool>`.

## Skills
`SKILL.md` folders: YAML frontmatter `name`/`description` + markdown body.
Discover via `skillsDir` or defaults (`.opencode/skills`, `.claude/skills`,
`.codex/skills` under workspace + home). Model uses `list_skills` then `use_skill`.

## MCP servers
```ts
{ id, name, description, icon?, command?, args?, cwd?, env?, url?, headers?, enabled? }
```
- stdio: `command`/`args` (npx -y …); streamable-HTTP: `url` + `headers`.
- Lazy connect on first `mcp_<id>` activation; closed at run end (`closeAll`).
- Disabled servers require `resolveMcpDecision` before use.
- `stockToMcpConfig(findStockEntry('…'))` pulls curated stock configs.

## Loop guards / compaction
- Guards: no-progress, repeated failure, same-output, empty response, runaway
  (`MAX_STEPS`). Verification failures demote `verify → recover`.
- Compaction auto-summarises at the token budget; resume with `sessionId`.