# API reference

The package's public surface is exported from `src/index.ts`. Sliced by area:
**options** · **surface** · **events** · **tools** · **providers** ·
**subcontexts** · **skills** · **mcp** · **loop** · **permissions** · **hooks**.

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
  hooks,               // lifecycle hooks: before/afterModelCall, before/afterToolCall
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
registerTool(tool)                                    // add a tool after construction
getToolPresentations()                                // { name: { icon, label, family, tone } }
addMcpServer(cfg) / removeMcpServer(id) / listMcpServers()
abort()                                  // interrupt the current run
on(type, fn) / onAny(fn) / events        // subscribe (see events below)
.skills.all() / .get(id) / count         // registered skills
.agentId                                 // 'build' | 'plan' | 'explore' | 'general'
```

`RunResult`: `{ runId, sessionId, status: 'completed'|'failed'|'interrupted'|'cancelled',
startedAt, endedAt, messages, steps: Snapshot, tokens, phases, … }`

## events — subscribe with `agent.on(...)` / `agent.onAny(...)`, payload via `e.data`

- Run lifecycle — `run.started` · `run.completed` · `run.warning` · `run.failed` · `run.interrupted`
- Step — `step.started` · `step.ended` · `phase.changed` (`explore→plan→edit→verify→recover→complete`)
- Turn text — `text.delta` (streaming tokens) · `text.thought` · `text.end`
- Tools — `tool.started` · `tool.output` · `tool.progress` · `tool.completed` ·
  `tool.failed` (all carry `toolCallId` and `toolName`; the two bookends
  — `tool.started` and `tool.completed` — also carry the tool's `presentation`
  when declared; `tool.failed` does not require a presentation)
- Prompts — `prompt:ask` / `prompt:permission` (inline prompts rendered by the UI),
  `prompt:resolved` (answered via `respond()`), and the backend pause events
  `ask_user.required` / `permission.required` (resolve via `agent.respond()` /
  `agent.resolvePermission()` respectively)
- Pauses (resolve via surface methods) — `permission.required` → `resolvePermission`;
  `ask_user.required` / `ask_user.response`; `request_mcp_approval` /
  `mcp.approval_required` → `resolveMcpDecision`; `mcp.resolved`
- Context — `context.updated` · `state.changed` · `agent.state` · `todo.updated`
- Other — `llm.thinking` · `compaction.started` · `compaction.completed`

Wire every pause to your UI — or set `autoApprove: true` and just resolve
`ask_user.required` (see `examples/plugin-demo.ts`).

## errors — every failure carries a layer, a severity and a hint

Failures used to leave the loop as bare strings, so a provider rate limit, a
denied permission and a loop guard all looked identical to the UI. Every
failure event now carries a structured `errorInfo` next to the legacy `error`
string:

```ts
interface AgentErrorInfo {
  code: string;            // stable machine code, e.g. 'provider_rate_limited'
  layer: AgentErrorLayer;  // provider | tool | run | hook | permission | transport
  severity: AgentErrorSeverity; // info | warning | error | fatal
  message: string;         // user-facing, never a stack trace or raw provider dump
  retryable: boolean;      // could retrying the same operation possibly work?
  hint?: string;           // the actionable next step
  details?: unknown;       // machine-readable extras; never rendered unopened
}
```

`retryable` and `severity` are what let a client offer the right action: a rate
limit gets *Retry*, bad credentials do not, a dropped socket reconnects, and a
tool the policy blocked is shown as a note rather than a failure.

| Layer | Typical codes | Severity |
| --- | --- | --- |
| `provider` | `provider_rate_limited` · `provider_auth` · `provider_timeout` · `provider_unavailable` | `error`, or `fatal` for auth |
| `tool` | `tool_failed` · `tool_blocked` · `tool_not_found` · `tool_cancelled` · `tool_mutation_limit` | `warning`–`error` |
| `run` | `run_repeated_error` · `run_empty_responses` · `run_hard_stop` · `run_internal_error` | `fatal` |
| `hook` | `hook_blocked` · `hook_failed` | `fatal` at run level, `warning` per tool |
| `permission` | `permission_denied` | `warning` |
| `transport` | `transport_disconnected` | `warning` |

**Non-terminal vs terminal.** `run.warning` is new and is *not* a failure: the
loop hit a provider error and is still retrying, so the event lets the UI show a
429 immediately instead of only once the run finally gives up. `run.failed` and
`tool.failed` are the real failures.

`errorInfo` is optional in the payload, so existing consumers that only read
`error` keep working:

```ts
agent.on('run.failed', (e) => {
  const info = e.data.errorInfo;            // structured
  const text = e.data.error;                // legacy string, still emitted
  if (info?.retryable) offerRetry();
});
```

The classifiers are exported for building your own errors:
`classifyProviderError`, `toAgentErrorInfo`, `errorMessageOf`, and per-layer
constructors (`toolFailedError`, `permissionDeniedError`, `hookBlockedError`,
`connectionLostError`, …). `toAgentErrorInfo` accepts a bare string, so a
third-party transport that only relays text still produces a complete error.

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

Each pause suspends the run until you resolve it, and a model that needs
several answers asks them one at a time — so every pause must be wired to
something. A UI that never resolves one leaves the run blocked forever, which
is why `@smoke-monkey/ui` renders these inline and answers over the transport.

## custom tools — declaring a tool the model can actually call

A tool is only usable if the model is told it exists. Built-in groups seed the
exposed set; anything you register that they do not cover is exposed too, from
the first step.

```ts
agent.registerTool({
  name: 'charge_card',
  description: 'Charge a saved card. Confirm the amount with the user first.',
  inputSchema: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] },
  // Presentational only — the model never sees this.
  presentation: { icon: '💳', label: 'Charge card', family: 'run', tone: 'primary' },
  execute: async (input) => ({ content: [{ type: 'text', text: `charged ${input.amount}` }] }),
});
```

`presentation` is a plain serialisable object (`icon` emoji, `label`, `family`
glyph key, `tone` accent), so it survives the trip to a browser untouched. Send
`getToolPresentations()` once on connect to render custom tools correctly
*before* the first `tool.started`, and to keep their icons in a history
replayed from storage. In the UI, per-event presentation wins over the host
map, field by field.
## hooks — lifecycle extension points

`hooks` lets an embedding application observe and guard the two things an
agent spends its time on: model calls and tool calls. Each point takes a
single function; compose several concerns yourself if you need more than one.

```ts
const agent = createAgent({
  workspacePath: '/repo',
  hooks: {
    async beforeToolCall({ toolName, input, userId }) {
      if (toolName === 'write_file' && !(await isAllowed(userId ?? 'anonymous', input.path))) {
        return { block: true, reason: 'path is outside the writable allowlist' };
      }
      // Rewrite arguments: strip secrets before they reach the tool.
      return { input: { ...input, content: redact(input.content) } };
    },
    async afterToolCall({ toolName, result, durationMs }) {
      metrics.timing('tool.call', { tool: toolName, durationMs, ok: result?.success !== false });
    },
    async beforeModelCall({ messages, tools, step }) {
      tracer.span('llm.call', { step, messages: messages.length, tools: tools.length });
    },
    async afterModelCall({ usage, durationMs, error }) {
      cost.record({ usage, durationMs, failed: Boolean(error) });
    },
  },
});
```

### Return values

| Hook | May return | Effect |
| ---- | ---------- | ------ |
| `beforeModelCall` | `{ messages?, tools? }` | replaces the outgoing payload |
| `beforeModelCall` | `{ block: true, reason }` | aborts the run (`emitRunFailed('hook_blocked')`) |
| `beforeToolCall` | `{ input }` | replaces the tool arguments |
| `beforeToolCall` | `{ block: true, reason }` | call never runs; reason is fed back to the model as a failed tool result |
| `afterModelCall` | — | observability only |
| `afterToolCall` | — | observability only |

Omit the return value to allow the call unchanged.

### Semantics

- **Ordering.** `before*` runs before the work, `after*` after it settles.
- **Fail-closed `before*`.** If a `before*` hook throws, the call is blocked
  with the error as the reason — an authorization hook that crashes must not
  fail open.
- **Fail-open `after*`.** If an `after*` hook throws it is logged and ignored;
  the work it observes has already happened.
- **Placement.** `beforeToolCall` runs *before* the permission prompt, so a
  policy hook can reject a call without bothering the user. It complements
  `permission` / `autoApprove`, which still apply afterwards.
- **Coverage.** `afterModelCall` fires once per attempt, including failed and
  retried ones. `afterToolCall` fires exactly once per tool call on every exit
  path — success, provider error, permission denial, hook block, or
  cancellation — with `blocked: true` and `error` set for the non-success ones.
