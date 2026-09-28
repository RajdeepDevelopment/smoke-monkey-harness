# Feature guide — errors, tool input & the three pauses

Prompts, tool input, and what to do when things fail.

Two things break a hosted agent more often than anything else in the library,
and neither throws where you expect:

1. **A prompt that never gets answered.** The run is suspended, not failed.
2. **A tool call the model got wrong.** Sometimes dropped, sometimes handed to
   your tool as `{}`, and the difference decides whether your tool sees a
   validation error or a confusing `undefined`.

Both are handled, and both have rules. This is them.

## The error model — stop matching on strings

Every failure is an `AgentErrorInfo`:

```ts
{
  code: string;      // stable, machine-readable: 'provider_rate_limited'
  layer: 'provider' | 'tool' | 'run' | 'hook' | 'permission' | 'transport';
  severity: 'info' | 'warning' | 'error' | 'fatal';
  message: string;   // user-facing, safe to render, never a stack trace
  retryable: boolean;
  hint?: string;     // an actionable next step for the user
  details?: unknown; // for a debug panel, never a headline
}
```

It answers three questions without parsing prose: **where** it failed
(`layer`), **how bad** (`severity`), and **whether the user can do anything**
(`retryable` + `hint`).

`severity` is the one that decides your UI's behaviour:

| severity | means | UI should |
|---|---|---|
| `info` | nothing is broken — a blocked tool the model worked around | note it, keep going |
| `warning` | degraded, the run continues | show a notice, keep going |
| `error` | an operation failed, the run may recover | show it, offer a retry |
| `fatal` | the run is over; retrying the same request will not help | end the run, do not offer a blind retry |

`message` is guaranteed renderable: it never contains a stack trace, and
provider responses are summarised rather than echoed. Anything you surface
should come from `message`, never `details`.

Older call sites still pass bare strings. `toAgentErrorInfo(input, fallback)`
normalises those, and infers missing fields conservatively — an unrecognised
error is an `error`-severity `run` failure and is treated as retryable, which
is the behaviour the UI had before this model existed.

```ts
import { toAgentErrorInfo } from '@smoke-monkey/harness';

const info = toAgentErrorInfo(err, { layer: 'tool', severity: 'error' });
if (!info.retryable) showHint(info.hint);
```

On the UI side the same normalisation exists as `toChatError`, and
`createAgentEventParsers` (or the bridge) applies it for you. The UI infers
`layer` / `severity` / `retryable` from the code and the text when the
producer did not send them, so a plain-string error still gets sensible
behaviour.

## Recoverable vs terminal — the mistake that breaks conversations

This is the highest-value distinction in the whole event stream, and getting
it backwards is why "the run just stops" bugs exist.

| what happened | event | terminal? |
|---|---|---|
| a provider rate limit, run is retrying | `run.warning` | **no** |
| someone hit stop | `run.interrupted` | **yes** — but not a failure |
| one tool call failed | `tool.failed` | **no** — one card goes red |
| the run itself failed | `run.failed` | yes |

Map `run.warning` to a terminal error and a transient 429 ends the
conversation even though the run was about to succeed. Map `tool.failed` to a
terminal error and one bad grep kills an otherwise healthy run. The bridge and
`createAgentEventParsers` both do this correctly; if you hand-roll it, this is
the table to check against.

**`run.interrupted` is the one people get wrong in the other direction.** It is
the *last* event an interrupted run emits — the loop has already persisted the
transcript, marked the run and session `interrupted`, and there is nothing after
it. So it has two requirements that pull against each other, and you need both:

- **End the stream.** A consumer that is still waiting for more events when this
  arrives waits forever. `for await (const e of bridge.events())` will not
  return on its own unless something treats the event as terminal.
- **Do not report it as a failure.** The work is saved and the session is still
  replyable, so a red error banner on a deliberately stopped run is a lie. The
  harness's own `reason` is the string `user_interrupt`, which matches nothing
  in `toChatError`'s patterns and would otherwise be classified as a retryable
  `run` error.

`createHarnessBridge` does both: it emits an `info`-severity `notice` with the
code `run_interrupted` and closes the iterator. If you hand-roll a consumer,
do the same — `severity: 'info'`, not `error`.

```ts
const TERMINAL = new Set(['run.completed', 'run.failed', 'run.interrupted']);
```

## Tool input: what the model can get wrong

A model produces tool calls as `{ id, function: { name, arguments } }` where
`arguments` is a **JSON string**. Two layers guard that, and they behave
differently on purpose.

**Layer 1 — `validateToolCalls` drops malformed calls.** A call with an empty
or missing `function.name`, or whose `arguments` is not parseable JSON, is
filtered out with a warning before the loop sees it.

The consequence matters: **a dropped call produces no event at all**. There is
no `tool.started`, no `tool.failed`, and no tool result — so nothing appears in
the UI, and the model never learns it was wrong. If every tool call in a turn
is dropped, the turn degrades to its text content and the loop continues.

That is deliberate: a call with no name or unparseable arguments cannot be
answered, because there is no `toolCallId` to attach a result to. But it means
**"the tool never ran" and "the tool ran and did nothing" look identical from
the outside.** If a user reports that a tool "did nothing", check your logs
for `Rejecting malformed tool call` / `Rejecting tool call "…": invalid JSON
arguments` before you debug the tool.

**Layer 2 — `safeParseObject` never throws.** Anything that reaches the loop is
parsed defensively:

- `null` / `undefined` → `{}`
- already an object → passed through
- a JSON **array** or a JSON scalar → `{}`
- invalid JSON → `{}`

So your tool's `execute(input)` can receive `{}` for arguments the model
botched. It will not receive `null` and it will not receive a parse error.

**Layer 3 — your schema.** `inputSchema` is advertised to the model, and
required fields are enforced by the model obeying them, not by the runtime.
**Validate inside `execute`.** This is the one people skip, and it is the
difference between a clean error the model can recover from and a stack trace
it cannot:

```ts
const tool: ToolDefinition = {
  name: 'read_file',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  async execute(input) {
    const path = typeof input.path === 'string' ? input.path : '';
    if (!path) {
      // A recoverable result the model can act on — not a throw.
      return { content: [{ type: 'text', text: 'Error: `path` is required.' }], isError: true };
    }
    // …actually do the work
  },
};
```

Two rules for a tool that recovers:

- **Return `isError: true` with a message that says what to do.** The text
  becomes the tool result, so the model reads it and retries correctly. This is
  how bad input is corrected in-loop instead of ending the run. Be aware it is
  **not** a quiet path: `isError: true` also marks the call failed, so it emits
  `tool.failed` and the tool card renders as an error even though the run
  carries on. The run is what recovers, not the card.
- **Throw only for genuine faults** — a bug, an unreachable service, a
  filesystem that is actually gone. A throw is classified into
  `tool_failed` with the message extracted, which is the same place `isError`
  lands; the difference is that an exception is a bug in your tool rather than
  a bad argument from the model.

An `isError` result also feeds the phase machine: a failed `run_command` or
`run_test` demotes the `verify` phase to `recover` and injects a note telling
the model to find the root cause before retrying. That is deliberate, so a
failing test steers the loop instead of just being logged.

### `readOnlyHint` does not skip the permission prompt

This trips people up. Under the default `ask-default` policy the auto-allow
decision is made from the **`READ_ONLY_TOOLS` name set**, not from your
`annotations.readOnlyHint`:

```ts
decision = READ_ONLY_TOOLS.has(toolName) ? 'allow' : 'ask';   // src/harness.ts
```

`readOnlyHint: true` is honest metadata that the provider sees, and it
documents intent — but a custom tool that is genuinely read-only will still
pause for permission, because its name is not in the set. That is usually
desirable. When it is not, pass a policy function:

```ts
createAgent({
  permission: async (req) => (req.toolName === 'search_docs' ? 'allow' : 'ask'),
});
```

`PermissionPolicy` is `'allow-all' | 'deny-all' | 'ask-default' | (req) =>
PermissionDecision`, where `req` is:

```ts
{ toolName: string; args: Record<string, unknown>; sessionId: string;
  runId: string; workspacePath: string; userId: string }
```

**`args` is currently always `{}`** — the decision is made before the arguments
are threaded through. So a policy can decide on the tool's identity, the
workspace, or the user, but **not** on the arguments themselves: you cannot
write "allow `write_file` only under `src/`" as a policy function. Enforce
that inside the tool (or in a `beforeToolCall` hook, which *does* see `input`).
Prefer the hook for anything argument-dependent.

## The three pauses, precisely

All three **suspend the run**, and none of them resolves on its own. This is
the single most common way a hosted agent is wired wrong, and the symptom is a
request that hangs with nothing in the logs. There are three, not two —
forgetting `mcp.approval_required` is the newest way to hit it, because it only
fires when the agent happens to recommend an MCP server.

| pause | raised when | run status | answered by | fed to the model as |
|---|---|---|---|---|
| `ask_user.required` | the model calls `ask_user` | `waiting_user` | `agent.respond(toolCallId, text)` | the answer, as the tool's result |
| `permission.required` | policy returns `ask` | `waiting_permission` | `agent.resolvePermission(id, 'allow' \| 'deny')` | the decision, as the tool's result |
| `mcp.approval_required` | the agent recommends an MCP server | `waiting_mcp_approval` | `agent.resolveMcpDecision(id, { action, names })` | a note of what was enabled, added or skipped |

In `@smoke-monkey/ui` the three are `prompt:ask`, `prompt:permission` and
`prompt:mcp_approval` (`ChatPromptKind`), over the wire
`resolve_ask_user` / `resolve_permission` / `resolve_mcp_approval`. The MCP one
is the odd one out: its answer is a *decision about configuration* —
`{ action: 'enable' | 'add' | 'skip', names: string[] }` — not text to read, so
`ChatPromptResponse` carries it as `mcpDecision` rather than only in `answer`.

### `ask_user` carries options

```ts
{
  question: 'Which environment?',        // required — the schema enforces nothing, the tool does
  options: [{ label: 'staging', description: 'safe, slower' }],  // omit for free text
  multiple: false,                        // allow several
}
```

`ask_user` with no `question` returns `isError: true` rather than pausing — a
useless question is not worth a round trip. With options, the tool result
renders them as a numbered list; without, the answer is free text.

Note the tool returns a placeholder ("the run pauses here until they respond")
and the real answer arrives later as the tool's result, so the model sees one
result, not two.

### Answers may arrive *before* the run is waiting

The obvious race: a fast client answers before the loop has reached the wait.
It is handled for all three pauses. An answer for a `toolCallId` with no waiter
yet is **buffered**, and consumed the moment the wait registers:

```ts
agent.respond('call_1', 'staging');   // before or after the pause — both work
```

So you never have to coordinate "is it paused yet". You do still need the
`toolCallId`, which arrives on the `ask_user.required` / `permission.required` /
`mcp.approval_required` event.

While a wait is outstanding the harness holds the Node event loop alive, so a
plain `tsx src/index.ts` script does not exit out from under you mid-prompt.

### Aborting a paused run

Abort resolves the waiters rather than leaving them hanging, and every one of
them resolves to "no":

- a pending `ask_user` resolves with `''` (empty answer)
- a pending permission resolves with `'deny'`
- a pending MCP approval resolves with `{ action: 'skip', names: [] }`

The run then ends as interrupted, so `run.interrupted` is the event that ends
your stream (see the terminal table above). Your host does not need to answer
anything on the way out — but the UI should still close the prompt, which is
why `createHarnessBridge.answer()` emits `prompt:resolved` itself instead of
waiting to hear about it.

The harness echoes some decisions and not others, which is the reason for that
local emit. `respond()` emits `ask_user.response`, and the loop emits
`mcp.resolved` after a decision is applied — but a resolved **permission emits
nothing at all**. A host that only listened for a confirmation would leave a
denied-permission card on screen for a run that already finished. The bridge
closes the prompt itself and drops the echo that follows, so one decision is
one `prompt:resolved` on the wire.

### Denials are not failures

A denied permission and a blocked hook are policy decisions, not crashes:

- `afterToolCall` receives `blocked: true` plus an `error` carrying the reason,
  so an audit can tell a refusal from a fault;
- the model receives the reason as the tool's result, and can work around it;
- the UI shows a tool error — there is no separate "denied" visual.

## Checklist

- [ ] `isError: true` + an actionable message for recoverable bad input; throws
      reserved for genuine faults
- [ ] `execute` validates its own input — `safeParseObject` will hand you `{}`
- [ ] **all three** pauses are answered, and the answer path is reachable from
      the client — a missed one deadlocks the run silently
- [ ] aborting a paused run is handled (it resolves as `''` / `'deny'` /
      `{ action: 'skip' }`)
- [ ] `run.warning` is **not** rendered as terminal
- [ ] `run.interrupted` **is** treated as terminal by the stream consumer, and
      is **not** rendered as a failure
- [ ] `isError: true` marking the card as failed is expected, not a surprise
- [ ] argument-dependent policy lives in a `beforeToolCall` hook, not in
      `permission` (whose `args` is always `{}`)
- [ ] `retryable` drives whether a retry button is offered
- [ ] surfaced text comes from `message`, never `details`
- [ ] a "tool did nothing" report has been checked against the
      `Rejecting malformed tool call` logs
