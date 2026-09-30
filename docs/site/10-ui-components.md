# 10. Drop-In React Chat UI (@smoke-monkey/ui)

> ⭐️ **Love Smoke Monkey Harness?** Please support the project with a star on [GitHub](https://github.com/RajdeepDevelopment/smoke-monkey-harness)!
> 🌐 **Interactive Simulator:** Test the agent loop and stream live at [smoke-monkey-harness.vercel.app](https://smoke-monkey-harness.vercel.app/)

---


Building an AI agent chat interface that looks polished, handles streaming markdown, renders collapsible tool-call execution cards, charts data, and supports interactive pause modals is exceptionally complex.

`@smoke-monkey/ui` provides a **production-ready, drop-in React chat interface** built specifically for AI agents, with a headless runtime and normalized event contract.

---

## Installation

Install `@smoke-monkey/ui` and its peer dependencies:

```bash
pnpm add @smoke-monkey/ui react react-dom
```

Import the stylesheet once in your application entry point (e.g. `main.tsx` or `_app.tsx`):

```tsx
import '@smoke-monkey/ui/ui.css';
```

---

## Zero-Backend Quickstart (`SyntheticTransport`)

During frontend development, you can test complete agent conversations—including tool calls, execution durations, and charts—**without running a backend or spending LLM tokens**:

```tsx
import React from 'react';
import { SmokeMonkeyChat, SyntheticTransport } from '@smoke-monkey/ui';
import '@smoke-monkey/ui/ui.css';

// Synthetic transport simulates agent reasoning, tool execution, and charts
const transport = new SyntheticTransport({
  includeToolCall: true,
  includeChart: true,
});

export default function App() {
  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <SmokeMonkeyChat 
        transport={transport} 
        theme="yellow" 
        brand={{ name: 'Smoke Monkey Studio', icon: <span>🐒</span> }}
      />
    </div>
  );
}
```

---

## Connecting the Real Harness (`WebSocketTransport`)

When deploying against a running `@smoke-monkey/harness` backend, use `WebSocketTransport` with `StreamParser`:

```tsx
import React, { useMemo } from 'react';
import { SmokeMonkeyChat, WebSocketTransport, StreamParser } from '@smoke-monkey/ui';
import '@smoke-monkey/ui/ui.css';

export function AgentWorkspaceView({ toolPresentations }) {
  const transport = useMemo(
    () =>
      new WebSocketTransport({
        url: 'wss://api.my-agent.dev/chat-ws',
        parser: StreamParser,
      }),
    []
  );

  return (
    <div style={{ height: '100vh', background: '#09090b' }}>
      <SmokeMonkeyChat
        transport={transport}
        theme="dark"
        layout="cozy"
        toolPresentations={toolPresentations}
        features={{
          header: true,
          tools: true,       // Renders collapsible tool cards
          artifacts: true,   // Renders Mermaid diagrams & code blocks
          charts: true,      // Renders bar and line charts
          suggestions: true, // Clickable starter prompts
          attachments: true,
        }}
        shortcuts={{
          send: 'Enter',
          stop: 'Escape',
          focusComposer: 'Meta+K',
        }}
        onRetry={(prompt) => console.log('Retrying prompt:', prompt)}
      />
    </div>
  );
}
```

---

## Key Features & Component Breakdown

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       <SmokeMonkeyChat /> ANATOMY                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 1. Header Toolbar     │ Brand Logo, Session Title, Model Picker, Workspace Menu │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 2. Message Stream     │ GFM Markdown, Syntax Highlighting, Inline Copy Buttons  │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 3. Tool Cards         │ Status Badge (Running / Done / Failed), Execution       │
│                       │ Duration, Expandable Input/Output JSON Inspector        │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 4. Inline Pauses      │ Interactive 'Allow' & 'Deny' buttons for permissions;   │
│                       │ Clarification question prompts                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 5. Visual Artifacts   │ Line/Bar Charts (Recharts), Mermaid diagrams            │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 6. Composer Input     │ Multi-line input, Keyboard shortcuts, Quick suggestions │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 14 Built-In Theme Presets

Themes can be changed dynamically with a single `theme` prop:

```tsx
<SmokeMonkeyChat theme="midnight" ... />
```

| Palette | Built-In Themes |
| :--- | :--- |
| **Dark Schemes** | `dark`, `yellow` *(default)*, `ember`, `crimson`, `rose`, `grape`, `midnight`, `ocean`, `forest`, `synthwave`, `mono` |
| **Light Schemes** | `light`, `solar`, `paper` |

### Custom HSL Theme Builder
You can override colors dynamically using standard HSL triples or the built-in color helper:

```tsx
<SmokeMonkeyChat
  theme="dark"
  customTheme={{
    scheme: 'dark',
    primary: '45 96% 58%',       // Smoke Monkey gold
    accent: '24 95% 53%',        // Amber glow
    inkPrimary: '0 0% 98%',      // Main text
    bgSurface: '240 10% 4%',     // Surface card background
  }}
/>
```

---

## Customizing Component Slots

Every section of the chat interface supports custom component overrides via the `slots` prop:

```tsx
import { ToolIcon, toolLabel, ErrorCard } from '@smoke-monkey/ui';

// Custom compact tool card
function CustomToolSlot({ call, presentation }) {
  const label = toolLabel(call.name, presentation);
  return (
    <div className="flex items-center gap-2 p-2 border border-zinc-800 rounded bg-zinc-900">
      <ToolIcon name={call.name} icon={presentation?.icon} />
      <span className="font-mono text-xs">{label}</span>
      <span className="ml-auto text-xs text-zinc-500">{call.durationMs}ms</span>
      {call.error && <ErrorCard error={call.error} dense />}
    </div>
  );
}

<SmokeMonkeyChat
  transport={transport}
  slots={{
    toolCall: CustomToolSlot, // Override tool execution rendering
  }}
/>
```

---

## Summary of the 10 Guides

You now have a complete, production-grade understanding of the Smoke Monkey ecosystem:
1. **[01. Overview](01-overview.md)** — 3 Pillars & Engine Layers
2. **[02. Getting Started](02-getting-started.md)** — Providers & Setup
3. **[03. The Agent Loop](03-agent-loop.md)** — 6 Phases & Guardrails
4. **[04. Tools](04-tools.md)** — Tool Contracts & Presentations
5. **[05. Permissions](05-permissions.md)** — The 3 Pauses & HITL Safety
6. **[06. MCP](06-mcp.md)** — Stdio/HTTP Protocol & Server Hub
7. **[07. Skills](07-skills.md)** — JIT Skill Injection
8. **[08. Sub-Contexts](08-subcontexts.md)** — Modular Memory
9. **[09. Hooks & Errors](09-hooks-and-errors.md)** — Observability & Error Hierarchy
10. **[10. React UI](10-ui-components.md)** — Drop-in Chat Interface
