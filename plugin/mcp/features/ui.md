# Wiring the Smoke Monkey chat UI to a harness run

`@smoke-monkey/ui` is a browser package: normalized stream events, a headless
runtime, transports, and the chat/tool/prompt components. The harness is a
server package: an `AgentHarness` that emits its own events and pauses for
answers. **They share no interface.** Something has to translate, and if you
skip it the failure is silent — an empty bubble, a spinner that never stops.

Ship the translation with the UI rather than rewriting it per app:

```ts
import { createHarnessBridge } from '@smoke-monkey/ui';
```

## Where this fits

| you are building | start from | why |
| --- | --- | --- |
| a help chat inside an app you already have | `ChatPanel` | it is a drop-in panel, not a whole app |
| a support widget on a site whose shell you do not control | `SmokeMonkeyChat` in an iframe or shadow root | one component, self-contained |
| a new agent product | `useSmokeMonkeyChat` + `WebSocketTransport` | you own the layout, the package owns the chat |
| something with a bespoke layout | `ChatRuntime` + `applyChatEvent` + the pieces you want | headless; no opinion about your UI |
| a headless/CLI product | none of this | `agent.run()` needs no browser |

The same bridge serves all of them, because it has no opinion about your
transport. Only the answer path differs, and only in how it arrives.

## The whole loop

```ts
// ── server ────────────────────────────────────────────────────────────────
import { createAgent } from '@smoke-monkey/harness';
import { createHarnessBridge } from '@smoke-monkey/ui';

const agent = createAgent({ provider: 'nvidia', model: '…', workspacePath: process.cwd() });
const bridge = createHarnessBridge({ agent, messageId });

const send = (e: unknown) => socket.send(JSON.stringify(e));
const pump = (async () => { for await (const e of bridge.events()) send(e); })();

// The UI's transport owns `message:start`; the bridge translates the run.
send({ type: 'message:start', messageId, conversationId });
await agent.run(task);
// …or, for an SSE host, `for await` straight into your response body.

// ── the answers, coming back ──────────────────────────────────────────────
socket.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.type === 'resolve_ask_user') {
    bridge.answer({ toolCallId: msg.data.toolCallId, kind: 'ask', answer: msg.data.response });
  } else if (msg.type === 'resolve_permission') {
    bridge.answer({ toolCallId: msg.data.toolCallId, kind: 'permission', answer: msg.data.decision });
  }
});
```

```ts
// ── browser ───────────────────────────────────────────────────────────────
import { WebSocketTransport, useSmokeMonkeyChat } from '@smoke-monkey/ui';
import '@smoke-monkey/ui/ui.css';

const { messages, send, isStreaming } = useSmokeMonkeyChat({
  transport: new WebSocketTransport({ url: 'wss://…' }),
});
```

`WebSocketTransport` already speaks the two command names above. The stylesheet
is a separate entry: import it once, anywhere.

## Why the answers are not optional

`ask_user.required` and `permission.required` **suspend the run**. Nothing
resolves them on their own. A host that renders those events but never routes
the answer back does not get a degraded UI — it gets a **deadlocked run**: the
model is mid-turn, no error is logged, and the only way out is a
`respond()` the browser cannot reach.

That is the single most common way this integration is wired wrong, and it
looks like a hung request. If a run stops and nothing explains why, check that
`bridge.answer()` is actually called.

`bridge.answer()` throws when no prompt is pending, and names the missing
capability when the agent cannot answer that kind of pause. Do not swallow
either — both mean the run is stuck.
`bridge.answer()` also emits `prompt:resolved` and clears the pending entry, so
the dialog closes immediately. Do not wait for the harness to echo it back: it
echoes `ask_user.response` for a question and **nothing at all** for a resolved
permission, so a host that only listened would leave a permission dialog on
screen long after the run moved on. Answering the same prompt twice throws.


## Event mapping

The bridge translates the harness' events into the UI's:

| harness | UI | notes |
| --- | --- | --- |
| `run.started` | `agent:start` | |
| `run.completed` | `agent:complete` + `message:complete` | ends the iterator |
| `run.warning` | `notice` | **not** terminal — the run is retrying |
| `run.interrupted` | `notice` | not terminal |
| `run.failed` | `error` | terminal |
| `step.started` / `step.ended` | `agent:step` | `running` / `complete` |
| `text.delta` | `text:delta` | |
| `text.thought` | `reasoning:start` then `reasoning:delta` | one open, not one per token |
| `tool.started` | `tool:start` | carries `toolName` + `presentation` |
| `tool.output` / `tool.progress` | `tool:delta` | live progress, no spinner-only state |
| `tool.completed` | `tool:result` | |
| `tool.failed` | `tool:error` | scoped to the call; the run continues |
| `ask_user.required` | `prompt:ask` | **pauses the run** |
| `permission.required` | `prompt:permission` | **pauses the run** |
| `ask_user.response` | `prompt:resolved` | closes the prompt |
| `todo.updated` | `agent:step` | |

Anything with no UI surface (`context.updated`, `state.changed`, `mcp.resolved`)
is dropped, so you never have to enumerate what to ignore.

The distinction that matters most: **`tool:error` is scoped to one call,
`error` ends the run.** A failing tool inside a healthy run is a normal,
recoverable event. A `run.warning` is also not terminal — mapping it to `error`
kills a run that was about to succeed, which is how a rate limit turns into a
dead conversation.

## Tool cards need presentation

A tool card with no presentation falls back to a title-cased tool name and a
generic glyph. Declare it in Node, once, and it travels over the wire:

```ts
const deployTool = {
  name: 'deploy',
  description: 'Ship the current build',
  inputSchema: { type: 'object', properties: { env: { type: 'string' } } },
  presentation: { icon: '🚀', label: 'Deploy', family: 'run', tone: 'warning' },
  async execute({ env }) { /* … */ },
};
```

`family` is one of `inspect · edit · run · verify · git · plan · ask`, and
`tone` is `default · primary · success · warning · destructive`. `icon` wins
over `family` when both are set. `getToolPresentations()` returns the whole
registry, which is what you want for a history replayed from storage or a tool
list fetched on connect — a live event's own presentation still wins.

In a custom `toolCall` slot, read the **resolved** presentation, not
`call.presentation` directly, or you silently drop a custom tool's icon:

```tsx
const label = toolLabel(call.name, call.presentation);
```

## Composing the pieces yourself

The bridge is deliberately not a framework. If you are not using
`SmokeMonkeyChat`, the parts are all exported:

| need | use |
| --- | --- |
| reduce events into messages | `applyChatEvent(messages, event, fallbackId)` — pure |
| state, prompts, optimistic messages | `ChatRuntime` |
| React binding | `useChat` / `useSmokeMonkeyChat` |
| one-shot event mapping | `mapHarnessEvent(event, { messageId })` |
| a tool card | `ToolCallCard`, `ToolRunGroup` / `ToolRunRow` |
| a pause | `ChatPromptCard` — render it or the run stalls |
| streaming markdown | `Markdown`, `StreamingVisual` |

`message:start` comes from the **transport**, not the bridge. Emit it first, or
the reducer has no message to attach the run to and every later event silently
does nothing.

## Transport notes

- **WebSocket** — `WebSocketTransport` already sends `resolve_ask_user` and
  `resolve_permission`. You only write the server side.
- **SSE / fetch** — there is no socket to answer on. Hold the run, stream the
  events into the response, and expose a second endpoint that calls
  `bridge.answer()`. `FetchTransport` covers the read side.
- **Tests** — `SyntheticTransport` replays fixtures with no server. Good for
  building the UI, useless for finding wiring bugs, because a fake stream never
  pauses.

## Checklist

- [ ] `createHarnessBridge` subscribed **before** the run starts, or a prompt
      raised on step 1 is dropped
- [ ] `bridge.answer()` wired for **both** pauses
- [ ] `message:start` emitted before the run's events
- [ ] custom tools carry `presentation`
- [ ] custom `toolCall` slots read the resolved presentation
- [ ] a run that stalls has been traced to an unanswered prompt
