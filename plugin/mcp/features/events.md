# Feature guide — events & UI wiring

Every agent is a state machine; the **event stream** is how your product renders
it. Subscribe with `agent.on(type, fn)` or `agent.onAny(fn)`; every payload is
`e.data`.

## The catalog (type → what you render)

Run lifecycle
- `run.started` → clear the UI, show the task
- `run.completed` / `run.failed` / `run.interrupted` → end states (result.status + messages)

Step / phase
- `step.started` / `step.ended` → one LLM turn lifecycle
- `phase.changed` → `explore→plan→edit→verify→recover→complete` progress bar

Text
- `text.delta` → token-level streaming (chat surface)
- `text.thought` → reasoning blocks (collapsible)
- `text.end` → a completed text message

Tools
- `tool.started` → name + args (tool card spinner)
- `tool.output` / `tool.progress` → live output from the running tool
- `tool.completed` / `tool.failed` → card result / error (`toolCallId` links them)

Pauses (interactive — resolve via surface methods, see permissions feature)
- `permission.required` → approval dialog → `agent.resolvePermission`
- `ask_user.required` → question dialog → `agent.respond`
- `request_mcp_approval` / `mcp.approval_required` → `agent.resolveMcpDecision`
- `ask_user.response` / `mcp.resolved` → pause resolution outcomes

Context & state
- `context.updated` → sub-context panel (active set)
- `state.changed` / `agent.state` → live agent/session state snapshots
- `todo.updated` → todo list panel

Other
- `llm.thinking` → provider reasoning hook
- `compaction.started` / `compaction.completed` → "context summarised" banner

## Reference wiring (the scaffold does this)

```ts
const agent = createAgent({ workspacePath, autoApprove: true, /* … */ })

agent.on('ask_user.required', (e) => {
  const { toolCallId, payload } = e.data as { toolCallId: string; payload: { question: string } }
  myUi.prompt(payload.question).then((answer) => agent.respond(toolCallId, answer))
})
agent.on('tool.started',  (e) => toolCards.add(e.data.toolCallId, e.data.name))
agent.on('tool.completed',(e) => toolCards.ok(e.data.toolCallId))
agent.on('tool.failed',   (e) => toolCards.fail(e.data.toolCallId, e.data.error))
agent.on('text.delta',    (e) => chatStream.push(e.data.delta))
agent.on('phase.changed', (e) => phaseBar.set(e.data.phase))
agent.on('compaction.started', () => compactBanner.show())

const result = await agent.run(task, { onStream: (delta) => {} })
```

(A typed `events` helper — `AgentEventEmitter` — supports filters and
`onAny`; `result.messages` is the authoritative history for re-renders.)

## Product patterns

- **IDE/chat panels** — one tool card per `toolCallId`; drive file diffs from
  `tool.completed` summaries.
- **Headless executions** — don't render; persist the stream for audit + replay.
- **Streaming-first chat** — `text.delta` + `tool.output` gives a live, modern
  agent experience without web sockets gymnastics.