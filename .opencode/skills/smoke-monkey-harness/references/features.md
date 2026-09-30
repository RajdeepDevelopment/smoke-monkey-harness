# Feature digests — the 11 building blocks

Standalone learning when the MCP server is not available. Each digest
condenses the full feature guide (which the MCP server also serves via
`harness_guide_<feature>_<detail>`).

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
`resolveMcpDecision(toolCallId, { action: 'enable'|'add'|'skip', names })` — the
`mcp.approval_required` event carries `{ toolCallId, payload }` inside
`event.data`. The model can only turn **configured-but-disabled** servers on;
adding a new server is a host call (`addMcpServer`).
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
| `huggingface` | `HUGGINGFACE_API_KEY` | Hugging Face Inference Providers router, `https://router.huggingface.co/v1` |
| `deepseek` | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` |
| `qwen` | `QWEN_API_KEY` (or `DASHSCOPE_API_KEY`) | DashScope compatible-mode |
| `zai` | `ZAI_API_KEY` | Z.ai GLM |
| `moonshot` | `MOONSHOT_API_KEY` | Moonshot Kimi |
| `mistral` | `MISTRAL_API_KEY` | `https://api.mistral.ai/v1` |
| `cohere` | `COHERE_API_KEY` | `https://api.cohere.com/v1` |
| `groq` | `GROQ_API_KEY` | `https://api.groq.com/openai/v1` (free tier) |
| `together` | `TOGETHER_API_KEY` | `https://api.together.xyz/v1` (free tier) |
| `fireworks` | `FIREWORKS_API_KEY` | `https://api.fireworks.ai/inference/v1` (free tier) |
| `cerebras` | `CEREBRAS_API_KEY` | `https://api.cerebras.ai/v1` (fast, free tier) |
| `ollama` | none | default, `http://localhost:11434` |

Keys via `apiKey` string or resolver `(provider, userId?) => key`. The loop
retries transient 5xx with backoff; `tool_calls` without prose
(`content: null`) is normal and handled.

## 5. Tools — everything the agent can do

`ToolDefinition = { name, description, inputSchema, annotations?, presentation?,
execute }`. Built-in factories (per group): filesystem (read_file/write_file/
edit_file/line_edit/replace_lines/apply_patch/delete_file/list_directory/
inspect), terminal (run_command/run_test), search (glob/grep), git
(git_status/git_diff/git_log), agent (ask_user/context_manage/todo_write/
finish_task), plus the mcp and skill tools (auto-registered).

**Two different group enums.** `options.tools` (what the registry *loads*) takes
`'filesystem'|'terminal'|'search'|'git'|'agent'`, `'all'`, or `[]`. The
*exposure* groups the guards read are
`TOOL_GROUPS.{core,exploration,editing,verification,git,docker}`. Passing the
wrong one fails silently — the tool just never appears. `options.tools` also
accepts `ToolDefinition[]` inline, and those are always exposed regardless of
group.

**Permissions.** `annotations.readOnlyHint: true` runs the tool without a
`permission.required` pause. `annotations.destructiveHint: true` maps to
`permissionAction: 'ask'` — and because that is derived from the annotation, a
custom tool is **`allow` by default**: a tool that deletes, charges, or calls an
external API gets no prompt until you set it. Neither annotation is a security
boundary; enforce real policy with `permission: (req) => …` too.

Custom `options.tools` entries are exposed to the model from the **first run
step**; a tool registered later was silently invisible to the model.

**Presentation.** Add `presentation: {icon, label, family, tone}` to a
`ToolDefinition` to get a titled, iconed tool card. `family` is one of
`TOOL_FAMILIES = inspect | edit | run | verify | git | plan | ask` and picks a
glyph when `icon` is absent; `icon` (emoji) wins over `family`. `tone` is one of
`default | primary | success | warning | destructive`. Read them all via
`agent.getToolPresentations()` and send it to the browser once on connect;
`tool.started` / `tool.completed` / `tool.failed` each carry the same
`presentation` looked up from the registry, so icons survive a history replay.

**What the model actually reads.** `ToolRegistry` normalises your result:
every `content[].text` part is joined into `output`, and the loop sends
`output` — nothing else — back to the model. `data` is for the UI and is never
sent to the LLM verbatim. Return a `data`-only payload and the model receives
the literal string `(no output)`.

**Validate inside `execute`.** `inputSchema` is advertised to the model as
`parameters`; the runtime does **not** enforce it. `required` is a request, not
a guarantee, and `safeParseObject` will hand your `execute` a plain `{}` for
arguments the model botched. Return `{ isError: true, output: '…' }` with text
that says what a valid call looks like — a throw becomes an opaque crash.

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

`harness_guide_errors_validation_and_pauses` has the full model: `AgentErrorInfo` fields, the
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
