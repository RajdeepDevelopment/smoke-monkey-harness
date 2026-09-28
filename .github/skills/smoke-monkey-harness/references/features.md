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

Custom `options.tools` entries are exposed to the model from the **first run
step**; a tool registered later was silently invisible to the model.

**Presentation.** Add `presentation: {label, icon, tone, group}` to a
`ToolDefinition` to get a titled, iconed tool card. `tone` is one of
`success | error | warning | info` and drives the card accent. Read them all via
`agent.getToolPresentations()`; a `presentation` on the individual event wins.

**Blocking a call.** A `beforeToolCall` hook returns `{block: true, reason}` to
deny a call; the reason is fed back to the model as the tool's result and the
call reaches `afterToolCall` with `blocked: true` plus an `error`, so an audit
can tell a policy refusal from a crash. The same hook returns `{input}` to
rewrite arguments before the tool runs.

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
Tool cards: `tool.started/output/progress/completed/failed` (each with
`toolName` + `presentation`; a denied call arrives as `tool.failed` like any
other error). Pauses:
`permission.required` · `ask_user.required` · `mcp.approval_required` (+
resolutions). State/context: `context.updated` · `state.changed` ·
`todo.updated` · `compaction.started/completed` · `llm.thinking`.

## 10. The chat UI — `@smoke-monkey/ui`

A published browser package built for this harness: normalized stream events, a
headless runtime, transports, and the chat/tool/prompt components. It is a
**separate npm package** and the two share no interface, so something must
translate. Ship that translation with the UI instead of rewriting it:

```ts
import { createHarnessBridge } from '@smoke-monkey/ui';
const bridge = createHarnessBridge({ agent, messageId });
for await (const event of bridge.events()) socket.send(JSON.stringify(event));

// and back, for all three pauses:
socket.on('message', (raw) => {
  const { type, data } = JSON.parse(raw);
  if (type === 'resolve_ask_user') bridge.answer({ toolCallId: data.toolCallId, kind: 'ask', answer: data.response });
  if (type === 'resolve_permission') bridge.answer({ toolCallId: data.toolCallId, kind: 'permission', answer: data.decision });
  if (type === 'resolve_mcp_approval') bridge.answer({
    toolCallId: data.toolCallId, kind: 'mcp_approval', answer: data.action,
    mcpDecision: { action: data.action, names: data.names ?? [] },
  });
});
```

**The pause is the whole trap.** All three of `permission.required`,
`ask_user.required` and `mcp.approval_required` suspend the run; nothing
resolves them by themselves. Render them *and* route the answer back, or the run
deadlocks with no error logged anywhere — it looks like a hung request, not a
bug. The MCP one is the easiest to forget, because it only fires when the agent
happens to recommend a server.

Two things around the pauses that are easy to get wrong:

- **`run.interrupted` ends the stream.** It is the last event an interrupted run
  emits, so a consumer still waiting for events waits forever. End the iteration
  on it — but do not render it as a failure; the work is saved and the session
  is still replyable. The bridge emits an `info` notice and closes.
- **Validate tool input yourself.** A call with an empty name or unparseable
  JSON arguments is dropped before the loop sees it, so it produces *no* event
  at all; anything that gets through is parsed defensively, so your `execute`
  can receive `{}`. Return `isError: true` with an actionable message rather
  than throwing.

`harness_guide_errors` has the full model: `AgentErrorInfo` fields, the
recoverable-vs-terminal table, the three input-validation layers, and the
buffering/abort/denial rules for each pause.

Where it fits: `ChatPanel` for a help chat in an existing app,
`SmokeMonkeyChat` in an iframe for a widget on a site you do not own,
`useSmokeMonkeyChat` + `WebSocketTransport` for a new agent product,
`ChatRuntime` + `applyChatEvent` for a bespoke layout. The bridge is
transport-agnostic, so all four use the same code.

`mapHarnessEvent(event, { messageId })` is the one-shot mapping if you want the
events without the subscription. `message:start` comes from the transport, not
the bridge — emit it first or nothing attaches to a message.

## 11. Errors & tool input — the two silent failures

Every failure is an `AgentErrorInfo`: `code` (stable, match on this) · `layer`
(`provider|tool|run|hook|permission|transport`) · `severity`
(`info|warning|error|fatal`) · `message` (renderable, never a stack trace) ·
`retryable` · `hint` (actionable next step) · `details` (debug only). Surface
`message`, never `details`, and let `retryable` decide whether a retry button
appears. `toAgentErrorInfo(err, fallback)` normalises bare strings.

**Recoverable vs terminal** is the distinction that decides whether a
conversation survives:

| event | terminal? | render as |
|---|---|---|
| `run.warning` (rate limit, retrying) | no | notice, keep going |
| `run.interrupted` (someone hit stop) | **yes** | `info` notice — *not* an error |
| `tool.failed` (one call) | no | that card only |
| `run.failed` | yes | error, end the run |

**Tool input fails in three layers.** (1) `validateToolCalls` drops a call with
an empty name or unparseable JSON arguments *before the loop sees it*, so it
emits no event at all — "the tool never ran" and "the tool did nothing" look
identical. (2) `safeParseObject` never throws, so `execute` can receive `{}`.
(3) Your `inputSchema` is advertised, not enforced. Validate in `execute` and
return `isError: true` with a message the model can act on; reserve throws for
real faults. Note `isError: true` also emits `tool.failed`, so the card goes red
even though the run recovers.

**Pause lifecycle.** An answer that arrives before the waiter registers is
buffered, so you never coordinate "is it paused yet". Abort resolves each
pending pause to no: `''` for `ask_user`, `'deny'` for permission, and
`{ action: 'skip' }` for MCP. A denied permission is a policy decision, not a
crash: `afterToolCall` gets `blocked: true` and the model receives the reason as
the tool result, so it can work around it.

`readOnlyHint` does *not* auto-allow — the default policy checks the
`READ_ONLY_TOOLS` name set. And a `PermissionPolicy` function receives
`args: {}`, so anything argument-dependent belongs in a `beforeToolCall` hook,
which does see the real input.
