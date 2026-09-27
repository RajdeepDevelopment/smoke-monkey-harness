# Smoke Monkey Chat — demo

A friendly, runnable demo for the **`@smoke-monkey/ui`** chat component.

> 🌐 **Live Online Showcase & Simulator:** [https://smoke-monkey-harness.vercel.app/](https://smoke-monkey-harness.vercel.app/)

**No backend. No API keys. No setup.** Just run it and type.

It installs `@smoke-monkey/ui` from npm exactly like your own app would — no
local build step, no Vite alias, no workspace linking. If it renders here, it
renders for your users, because it is the same published artifact.

## Run

```bash
# from this folder (examples/chat-demo)
pnpm install
pnpm dev
```

That opens [http://localhost:5173](http://localhost:5173).

> Nothing is built locally first. `pnpm install` pulls the published package
> from npm and `pnpm dev` starts Vite. Bumping the version in
> `package.json` is how you try a new release.

## What you'll see

- A full chat: assistant answers that **stream** live
  (demo backend = `SyntheticTransport`, canned but realistic — agent steps,
  reasoning, a tool call, a chart artifact, sources and token usage)
- A **model picker**, **workspace picker**, **MCP server toggles** and
  **API-key status pills** in the header
- **Suggestion chips** when the conversation is empty (click to send)
- **Attachments**: hit the paperclip in the composer (file names are sent
  as `📎 name` preambles)
- Keyboard: **Enter** send · **Shift+Enter** new line · **Esc** stop ·
  **⌘/Ctrl+K** focus the box
- A custom **`slot`** (`toolCall`) that replaces the built-in tool card

## Where's everything?

| Piece | File |
| --- | --- |
| The chat widget (all props) | `src/App.tsx` |
| The custom `toolCall` slot | `src/App.tsx` → `TinyToolCard` |
| Fake models/workspaces/MCP/keys/suggestions | `src/demoData.ts` |
| Entry point & theme import | `src/main.tsx` → `@smoke-monkey/ui/ui.css` |
| The library itself | npm: [`@smoke-monkey/ui`](https://www.npmjs.com/package/@smoke-monkey/ui) |

## Props cheat-sheet

- **Data**: `models`, `workspaces`, `mcpServers`, `apiKeys`, `suggestions`
- **Runtime**: `transport` (required), `store`, `conversationId`, `model`, `system`, `request`
- **Layout**: `layout` (`'coding' | 'cozy' | 'minimal'`), `position` (`composer` & `header`)
- **Features**: one boolean per UI piece — flip any off (e.g. `markdown: false`)
- **Theme**: `theme` (14 built-ins, `dark` by default), `customTheme` (partial
  palette — omitted tokens are derived), `classNames`, `style` (incl.
  `--sm-primary` / `--sm-accent`). The picker in the header builds a custom
  theme live and shows the `customTheme` object to paste.
- **Slots**: `header`, `footer`, `empty`, `composer`, `message`, `codeBlock`,
  `toolCall`, `chart`, `table`, `sources`
- **Callbacks**: `onSend`, `onStop`, `onRetry`, `onRegenerate`, `onModelChange`,
  `onWorkspaceChange`, `onMCPChange`
- **Keyboard**: `shortcuts = { send: 'Enter', stop: 'Escape', focusComposer: 'Meta+K' }`

## Going further

Swap in a real backend (see `src/App.tsx` step 1):

```ts
import { FetchTransport, StreamParser } from '@smoke-monkey/ui';

const transport = new FetchTransport({
  url: 'https://your-api.example.com/chat',
  parser: StreamParser,
});
```

Check the [`@smoke-monkey/ui` README](https://github.com/RajdeepDevelopment/smoke-monkey-harness/tree/main/ui) for the stream event contract and how transports work.