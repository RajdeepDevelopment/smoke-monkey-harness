# @smoke-monkey/ui

**Drop-in React chat UI for AI agents and LLMs.** Streaming markdown, tool-call
cards, charts, mermaid diagrams, syntax highlighting, and inline "ask the user"
prompts — with a headless runtime and a normalized event contract, so the same
components work against OpenAI, Anthropic, Gemini, OpenRouter, LangGraph, MCP,
or your own agent.

[![Documentation & Live Demo](https://img.shields.io/badge/docs-smoke--monkey--harness.vercel.app-00f5d4?style=flat&logo=vercel)](https://smoke-monkey-harness.vercel.app/)
[![npm version](https://img.shields.io/npm/v/@smoke-monkey/ui.svg)](https://www.npmjs.com/package/@smoke-monkey/ui)
[![npm downloads](https://img.shields.io/npm/dm/@smoke-monkey/ui.svg)](https://www.npmjs.com/package/@smoke-monkey/ui)
[![license](https://img.shields.io/npm/l/@smoke-monkey/ui.svg)](./LICENSE)

> 🌐 **Interactive Documentation & Live Simulator:** [https://smoke-monkey-harness.vercel.app/](https://smoke-monkey-harness.vercel.app/) — test streaming chat, tool execution cards, inline prompts, mermaid diagrams, and custom theme presets live.

## Install

```bash
npm install @smoke-monkey/ui react react-dom
```

Then import the stylesheet once, anywhere in your app:

```tsx
import '@smoke-monkey/ui/ui.css';
```

> Using pnpm or yarn? `pnpm add @smoke-monkey/ui react react-dom` /
> `yarn add @smoke-monkey/ui react react-dom` — the import stays the same.
> `react` and `react-dom` (>=18) are peer dependencies, so you control the version.

## Quick start

The fastest way to see it working — a full streaming chat with a tool call and a
chart, **no backend required**:

```tsx
import { SmokeMonkeyChat, SyntheticTransport } from '@smoke-monkey/ui';
import '@smoke-monkey/ui/ui.css';

// A canned demo stream: agent steps, a tool call, a chart, then an answer.
const transport = new SyntheticTransport({ includeToolCall: true, includeChart: true });

export default function App() {
  return <SmokeMonkeyChat transport={transport} model="demo" className="h-[600px]" />;
}
```

Swap `SyntheticTransport` for a real endpoint when you're ready — same
components, same contract, different transport:

```tsx
import { FetchTransport, StreamParser } from '@smoke-monkey/ui';

const transport = new FetchTransport({
  url: 'https://api.example.com/chat',
  parser: StreamParser,               // or implement StreamParserFn
  buildRequest: ({ messages, model, request }) => ({
    headers: { Authorization: `Bearer ${request?.apiKey ?? ''}` },
    body: { model, messages: messages.map(m => ({ role: m.role, content: m.content })) },
  }),
});
```

### Connect the Smoke Monkey agent

If your backend is the [`smoke-monkey-harness`](https://github.com/RajdeepDevelopment/smoke-monkey-harness)
agent, it already emits this exact event contract — wire the two together. On
the server, [`createHarnessBridge`](#mapping-harness-events) does the mapping
and routes paused-run answers back into the run; below is the browser half:

```tsx
import { SmokeMonkeyChat, WebSocketTransport, StreamParser } from '@smoke-monkey/ui';

const transport = new WebSocketTransport({ url: 'wss://api.example.com/ws', parser: StreamParser });

// So custom tools show their icon/label before the first event arrives.
<SmokeMonkeyChat
  transport={transport}
  toolPresentations={agent.getToolPresentations()}
/>
```

```tsx
import { FetchTransport, StreamParser } from '@smoke-monkey/ui';

const transport = new FetchTransport({
  url: 'https://api.example.com/chat',
  parser: StreamParser,               // or implement StreamParserFn
  buildRequest: ({ messages, model, request }) => ({
    headers: { Authorization: `Bearer ${request?.apiKey ?? ''}` },
    body: { model, messages: messages.map(m => ({ role: m.role, content: m.content })) },
  }),
});
```

## Why

Building an agent chat that *looks* finished is the easy part. The hard parts are
the ones this package already solved:

- **Streaming that doesn't flicker** — a normalized event model instead of
  ad-hoc `onChunk` callbacks, so every transport renders identically.
- **Tool calls that read well** — arguments, progress, results, failures, and
  your own emoji/label per tool.
- **Runs that pause for a human** — `ask_user` and permission prompts render
  inline and resume the run over the transport.
- **A renderer that isn't a toy** — markdown, tables, charts, mermaid, and
  highlighted code, with streaming-safe partial output.
- **Headless when you need it** — use the runtime and hooks without any of the
  components.

## Headless usage

When you want to control rendering yourself:

```tsx
import { useChat, FetchTransport, MemoryStore } from '@smoke-monkey/ui';

const { messages, send, stop, clear, isStreaming, ready } = useChat({
  transport,
  store: new MemoryStore(),   // optional persistence
  model: 'my-model',
  system: 'You are helpful.',
});
```

`useChat` hydrates pending history, wires streaming, exposes `connectionStatus`,
`usage`, and events. Pair `useAutoScroll`, `useStreaming`, and
`useKeyboardShortcuts` for the last ten percent.

## Where to look next

New to the package? Read top to bottom. Coming from a problem?

| I want to… | Go to |
|---|---|
| See it working with no backend | [Quick start](#quick-start) |
| Build my own components on the runtime | [Headless usage](#headless-usage) |
| Understand the wire format | [The event contract](#the-event-contract) |
| Handle `ask_user` / permission pauses | [Paused runs](#paused-runs--ask_user-and-permissions) |
| Give my tools an icon and label | [Custom tool icons](#custom-tool-icons) |
| Show errors properly | [Errors](#errors) |
| Connect a backend that isn't SSE | [Building a custom transport](#building-a-custom-transport) |
| Render tool calls my own way | [Tool-call runs](#tool-call-runs) |
| Match my brand | [Theming](#theming) |

Runnable examples live in
[`examples/chat-demo`](https://github.com/RajdeepDevelopment/smoke-monkey-harness/tree/main/examples/chat-demo)
— a full agent chat with tool cards, custom tool icons, and a paused run you
can answer.

## The event contract

Transports emit normalized `ChatStreamEvent` lines. The runtime
(`StreamParser` + `ChatRuntime`) turns them into `ChatMessage[]` where each
message carries typed `MessagePart`s:

| Event | Purpose |
|---|---|
| `connection.status` | open / reconnecting / closed |
| `message:start` | begin an assistant message |
| `message:delta` | incremental text (preferred over atomics) |
| `message:complete` | finalize a message (usage, stop reason) |
| `message:error` | terminal per-message failure |
| `notice` | **non-terminal** failure (see below) |
| `tool:error` | one tool call failed; the run continues |
| `text` | atomic text chunk |
| `reasoning:delta` / `reasoning:complete` | thinking trace |
| `tool:start` / `tool:delta` / `tool:complete` / `tool:error` | tool calls |
| `prompt:ask` / `prompt:permission` | the run paused on the user (inline prompt card) |
| `prompt:resolved` | that prompt was answered via `transport.respond()` or `ChatRuntime.resolvePrompt()` |
| `artifact:*` | structured visuals (chart/table/file/image/text) |
| `sources` | citation list for a message |
| `agent.step` / `agent.steps` | multi-step agent progress |
| `message.cancelled` | user stopped generation |

`MessagePart` types: `thinking`, `markdown`, `text`, `code`, `tool`,
`prompt`, `artifact`, `citation`, `notice`, `image`, `file`. `MessageBubble`
renders every part; `ChatPanel` composes bubbles + composer + empty + error
states.

## Paused runs — `ask_user` and permissions

A tool that asks the user a question **suspends the run** until it is
answered. So the pause is not decoration: a transport that never answers leaves
the run blocked forever.

`ChatTransport.respond()` is how you answer one.

```ts
const transport = new WebSocketTransport({ url, parser });
// <SmokeMonkeyChat transport={transport} /> — the card is wired for you.
```

Implemented by both built-in transports: `WebSocketTransport` sends
`{ type: 'resolve_ask_user' | 'resolve_permission' | 'resolve_mcp_approval', data: { toolCallId, … } }`
on the socket it already holds open, and `SyntheticTransport` resumes its
generator. A custom transport can omit `respond()` — the prompt then renders
**read-only**, explaining that the host that started the run has to answer it,
rather than showing buttons that go nowhere.

Intercept answers to persist them, route them to a human, or answer on the
user's behalf:

```tsx
<SmokeMonkeyChat onPromptRespond={(prompt, answer) => audit(prompt.toolCallId, answer)} />
```

Each prompt is a separate inline card addressed to its own `toolCallId`, so a
model that chains questions gets one card per question rather than a queue.
Answering one collapses it in place to show what was chosen — the card updates
optimistically, without waiting for a round-trip it may never get. Multiple
prompts can be pending at once; `features.prompts={false}` hides the cards
entirely (it does not unblock the run).

## Custom tool icons

A tool can carry its own presentation from the harness, so a custom tool is
recognizable without a matching entry in this package:

```ts
// In Node
agent.registerTool({ …, presentation: { icon: '💳', label: 'Charge card', tone: 'primary' } });
<SmokeMonkeyChat toolPresentations={agent.getToolPresentations()} transport={…} />
```

The emoji is a plain string on the wire — nothing to register here. Resolution
is **per field**: what the `tool:start` event declared wins, then the host map,
then inference from the tool name. `ToolIcon` and `toolLabel` are exported if
you replace the tool card via `slots.toolCall`; a slot that ignores
`call.presentation` silently drops the icon.

## Errors

`ChatErrorInfo` is what every failure looks like once it reaches the UI:

```ts
interface ChatErrorInfo {
  code: string;
  message: string;      // user-facing
  retryable: boolean;
  layer?: 'provider' | 'tool' | 'run' | 'hook' | 'permission' | 'transport';
  severity?: 'info' | 'warning' | 'error' | 'fatal';
  hint?: string;        // the actionable next step
  details?: unknown;    // behind a "Details" toggle, never dumped inline
}
```

`layer` says *where* it broke, `severity` says *how bad*, and `retryable` says
whether offering a Retry button is honest. `ErrorCard` renders all three, and it
hides Retry for a `fatal` error that is not retryable.

**Three surfaces, deliberately:**

| Normalized event | Lands on | Stream |
|---|---|---|
| `tool:error` | that tool call's card (`toolCall.error`) | stays open |
| `notice` | a `notice` part inline in the message | stays open |
| `error` | `message.error`; message becomes `error` | closes |

A `notice` is for a failure the run recovered from or is still retrying — a
provider 429 mid-run, a dropped socket, a blocked tool. Because it is not
terminal, the message keeps streaming and several notices can accumulate; repeats
of the same `code` collapse into one so a retry loop cannot stack thirty
identical banners.

`toChatError(input, fallback?)` coerces anything error-shaped into a complete
`ChatErrorInfo`. Pass a bare string and it infers the layer, severity and
retryability from the text (a "connection failed" message becomes a retryable
`transport` warning; bad credentials become a non-retryable `fatal`), so older
servers and proxies that only relay text still render correctly.

### Mapping harness events

The harness and this package are separate and share no interface, so something
has to translate. Ship that translation with the UI rather than writing it per
app — `createHarnessBridge` is the whole loop, in both directions:

```ts
// ── server ────────────────────────────────────────────────────────────────
import { createHarnessBridge } from '@smoke-monkey/ui';

const bridge = createHarnessBridge({ agent, messageId });
for await (const event of bridge.events()) socket.send(JSON.stringify(event));

// ── the answers, coming back ──────────────────────────────────────────────
socket.on('message', (raw) => {
  const { type, data } = JSON.parse(raw);
  if (type === 'resolve_ask_user') {
    bridge.answer({ toolCallId: data.toolCallId, kind: 'ask', answer: data.response });
  } else if (type === 'resolve_permission') {
    bridge.answer({ toolCallId: data.toolCallId, kind: 'permission', answer: data.decision });
  } else if (type === 'resolve_mcp_approval') {
    bridge.answer({
      toolCallId: data.toolCallId,
      kind: 'mcp_approval',
      answer: data.action,
      mcpDecision: { action: data.action, names: data.names ?? [] },
    });
  }
});
```

| harness | UI | |
|---|---|---|
| `run.started` / `run.completed` | `agent:start` / `agent:complete` | `+ message:complete` |
| `run.warning` | `notice` | **not** terminal — the run is still retrying |
| `run.interrupted` | `notice` | **terminal** — and *not* a failure |
| `run.failed` | `error` | terminal |
| `step.started` / `step.ended` | `agent:step` | |
| `text.delta` | `text:delta` | |
| `text.thought` | `reasoning:start` then `reasoning:delta` | opened once, not per token |
| `tool.started` | `tool:start` | carries `toolName` + `presentation` |
| `tool.output` / `tool.progress` | `tool:delta` | live progress |
| `tool.completed` | `tool:result` | |
| `tool.failed` | `tool:error` | scoped to the call, run continues |
| `ask_user.required` | `prompt:ask` | **pauses the run** |
| `permission.required` | `prompt:permission` | **pauses the run** |
| `mcp.approval_required` | `prompt:mcp_approval` | **pauses the run** |
| `ask_user.response` / `mcp.resolved` | `prompt:resolved` | the harness' own echo |

`run.failed`, `run.warning` and `tool.failed` all carry a structured
`ChatErrorInfo` (`code` · `layer` · `severity` · `message` · `retryable` ·
`hint`) alongside the harness' flat `error` string, and the structured one wins
when it is usable. That is what lets the UI tell a retryable rate limit from a
fatal auth failure instead of showing one red banner for both — so gate your
retry affordance on `retryable` and branch on `code`, never on the message text.

Events with no UI surface (`context.updated`, `state.changed`, …) are dropped,
so you never have to enumerate what to ignore.

**All three pauses suspend the run**, and none resolves on its own. An answer
that never comes back is a hang with nothing in the logs, so a host that
renders the prompt but forgets the `respond()` route deadlocks the run. The MCP
one is the easiest to forget — it only fires when the agent happens to
recommend a server — and its answer is a *configuration* decision
(`{ action: 'enable' | 'add' | 'skip', names: string[] }`) rather than text, so
it travels in `ChatPromptResponse.mcpDecision` instead of only in `answer`. Omit
it and the bridge falls back to the server ids the prompt already showed.

**`run.interrupted` ends the stream, and is not a failure.** It is the last
event an interrupted run emits — the transcript is saved, the run and session
are marked interrupted, and nothing follows — so a consumer still waiting for
events would wait forever. The bridge ends the iteration on it and emits an
`info`-severity `notice` (`code: 'run_interrupted'`), because the session is
still replyable: a red error banner on a deliberately stopped run is a lie.
Map it to an `error` and you both hang and lie.

**`tool:error` is scoped to one call; `error` ends the run.** A failing tool in
an otherwise healthy run is normal and recoverable. Mapping `run.warning` to
`error` kills a run that was about to succeed — which is how a rate limit
turns into a dead conversation.

`bridge.answer()` throws when no prompt is pending, and names the missing
capability when the agent cannot answer that kind of pause. Don't swallow
either: both mean a run is stuck.
`bridge.answer()` also emits `prompt:resolved` and clears the pending entry, so
the dialog closes immediately. Do not wait for the harness to echo it back: it
echoes `ask_user.response` for a question and **nothing at all** for a resolved
permission, so a host that only listened would leave a permission dialog on
screen long after the run moved on. Answering the same prompt twice throws.


`mapHarnessEvent(event, { messageId })` is the same mapping one event at a
time, if you want the events without the subscription. Note that
`message:start` comes from the **transport**, not the bridge — emit it first,
or the reducer has no message to attach the run to.

#### Errors only

If you already map the rest of the run and just want the harness' severity and
terminal/non-terminal decisions for failures, register the built-in parsers:

```ts
import { StreamParser, createAgentEventParsers } from '@smoke-monkey/ui';

const parser = new StreamParser();
for (const [type, fn] of Object.entries(
  createAgentEventParsers({ messageId })
)) parser.register(type, fn);
```

| Harness event | Normalized |
|---|---|
| `run.warning` | `notice` (non-terminal) |
| `run.interrupted` | `notice` (info) |
| `tool.failed` | `tool:error` |
| `run.failed` | `error` (terminal) |

A `ToolCall.error` is rendered by the built-in `ToolCallCard`. If you supply
your own via the `toolCall` slot, render `call.error` with `<ErrorCard
error={call.error} dense />` — otherwise the row is just a silent "Failed".

## Building a custom transport

Implement `ChatTransport`:

```ts
class MyTransport implements ChatTransport {
  readonly id = 'mcp-langgraph';
  readonly name = 'LangGraph Agent';
  readonly protocol = 'custom';
  ready = true;
  connectionStatus: ConnectionStatus = 'connected';
  initialize(): Promise<void> { return Promise.resolve(); }
  dispose(): Promise<void> { return Promise.resolve(); }
  send(req: ChatRequest, opts: TransportSendOptions): Promise<ChatStreamEvent[]> {
    // emit events (use TransportEventSender helpers) and return them
    return opts.onEventPromises ?? [];
  }
  stop(_msgIds: string[]): Promise<void> { return Promise.resolve(); }
}
```

## Tool-call runs

When a model calls the same kind of tool two or more times in a row
(`read_file` → `grep` → `list_dir`), the cards are joined by a vertical rail
under a single phase header with a call count, instead of three loose cards
repeating the same status icon:

```
│ ● Inspecting · 4
│ ├ FileSearch  read_file   34ms  ✓
│ ├ FileSearch  grep        61ms  ✓
│ ├ FileSearch  list_dir    12ms  ✓
│ └ FileSearch  read_file   28ms  ✓
```

Calls are grouped by semantic **family**, not exact name, so mixed reads still
read as one run. Families: `inspect`, `edit`, `run`, `verify`, `git`, `plan`,
`ask`. Anything between two calls — prose, code, an artifact, a different
family — breaks the run, and a lone call stays a plain card.

- On by default. Turn it off with `features={{ toolChains: false }}`.
- A `slots.toolCall` component still renders the card; it is only wrapped in
  the rail.
- Each call shows a per-family glyph from `ToolIcon`, and the rail node is
  tinted by status (accent while running, destructive on failure).

The grouping logic is exported if you want it elsewhere:

```ts
import { computeToolRuns, toolFamily, toolFamilyLabel, buildToolRun } from '@smoke-monkey/ui';

const runs = computeToolRuns(message.parts);
// [{ ids, family: 'inspect', label: 'Inspecting', total: 4, positionById: { … } }]

toolFamily('github__create_issue'); // 'edit'  (MCP `server__tool` is understood)
```

`ToolIcon`, `ToolRunGroup`, `ToolRunRow` and `ToolRunHeader` are exported too,
so a custom message renderer can reuse the rail.

## Theming

The library ships a `ui.css` built on the Smoke Monkey design system
(`bg`, `ink-*`, `surface-*`, `accent`, `primary`, `md-body`, `btn-*`,
`glass-*`). Every value is a bare HSL triple (`"45 96% 58%"`) consumed as
`hsl(var(--token) / alpha)`, so pass channels, not hex or `hsl()` strings.

### Built-in themes

`theme` accepts 14 built-ins. `dark` is the default:

| Group  | Values |
| ------ | ------ |
| Dark   | `dark`, `yellow`, `ember`, `crimson`, `rose`, `midnight`, `ocean`, `forest`, `grape`, `synthwave`, `mono` |
| Light  | `light`, `solar`, `paper` |

```tsx
<SmokeMonkeyChat theme="yellow" />
```

All of them clear WCAG AA for body text, code, and the user bubble.

### Custom themes

`customTheme` takes a partial palette. Any key you omit is derived from the
keys you do set — set `bg` + `inkPrimary` and the surface, border, and ink
ramps follow; set `primary` and its hover/deep/subtle/foreground shades
follow. Explicit values always win. `scheme` (`"dark" | "light"`) picks the
ramp direction and otherwise follows the lightness of `bg`.

```tsx
<SmokeMonkeyChat
  theme="dark"
  customTheme={{ bg: '0 57% 12%', primary: '190 95% 52%' }}
/>
```

### Recoloring in place

`--sm-primary` / `--sm-accent` are a one-line recolor on top of any theme.
They take HSL triples and keep that theme's foreground pairing, so use
`customTheme` when you also need the surfaces to move:

```tsx
<SmokeMonkeyChat style={{ '--sm-primary': '45 96% 58%' }} />
```

### Chart series colors

Charts (marker blocks and chart artifacts) have no hardcoded palette. Their
series colors come from the semantic tokens, so they re-color with the active
built-in theme *and* with `customTheme`. Use `chartColor(i)` if you are
rendering your own chart:

```tsx
import { chartColor } from '@smoke-monkey/ui';

<div style={{ background: chartColor(0) }} />
```

`chartColor` cycles through `primary`, `accent`, `info`, `success`, `warning`,
`destructive`, plus two `color-mix` blends of those hues.

Two rules matter here:

- **Pass the color through a `style` prop.** SVG presentation attributes
  cannot resolve custom properties, so `fill="hsl(var(--primary))"` silently
  renders black. Use `style={{ fill: chartColor(0) }}`.
- **Do not pre-compose a `--chart-*` custom property on `:root`.** A
  declaration like `--chart-1: hsl(var(--primary))` resolves `var(--primary)`
  on `:root`, which pins every chart to the default palette and makes custom
  themes inert. Reference the token at the point of use so the lookup happens
  inside the themed subtree.

## Related packages

- [@smoke-monkey/inference](https://www.npmjs.com/package/@smoke-monkey/inference) — reference implementation of the event contract (streaming, tool use, multi-model).
- [@smoke-monkey/mcp](https://www.npmjs.com/package/@smoke-monkey/mcp) — MCP servers behind the contract.

## License

MIT
