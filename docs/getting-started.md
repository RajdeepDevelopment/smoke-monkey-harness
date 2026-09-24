# Getting started

Build agentic tools, AI code editors, and agent harnesses in a few lines — the
agent loop, tools, permissions, and LLM client behind the Smoke Monkey code
editor.

## Install

```bash
pnpm add @smoke-monkey/harness
```

Requires **Node >= 18**. TypeScript types ship with the package.

## Set an API key

The reference provider is NVIDIA:

```bash
export NVIDIA_API_KEY="nvapi-..."   # https://integrate.api.nvidia.com
```

Keys are read from environment variables at runtime; they never live in code.

## First agent

```ts
import { createAgent } from '@smoke-monkey/harness';

const agent = createAgent({
  provider: 'nvidia',
  model: 'nvidia/nemotron-3-super-120b-a12b',
  workspacePath: process.cwd(),
});

const result = await agent.run('What is in this workspace?');
console.log(result.messages.at(-1)?.content);
```

That's the whole loop: planning, tool calls, permissions, and streaming state are
handled for you.

## Minimal interactive agent

`agent.run()` pauses anytime it needs a decision. The simplest way to go from
zero to usable:

```ts
const agent = createAgent({
  provider: 'nvidia',
  model: 'nvidia/nemotron-3-super-120b-a12b',
  workspacePath: process.cwd(),
  autoApprove: true,          // allow read-only + mutating tools automatically
});

agent.on('ask_user.required', async (e) => {
  const answer = await prompt(e.data.question);
  await agent.respond(e.data.toolCallId, answer);
});

// and/or drive everything yourself:
agent.on('tool.started', (e) => console.log('\n$', e.data.toolName));
agent.on('text.delta',   (e) => process.stdout.write(e.data.delta));
```

## Licensing beyond the basics

| You want | Do |
| --- | --- |
| Different model | set `model` (any tool-capable model on the provider) |
| Local model | `provider: 'ollama'`, no key needed |
| Restrict tools | `tools: ['core', 'search']` or any `ToolGroupName[]` |
| Custom tools | pass `ToolDefinition[]` in `options.tools` |
| External tools | `mcp: [{ id, command, args }]` (see `docs/mcp.md`) |
| SKILL.md skills | `skillsDir: ['.mine/skills']` (see `docs/tools.md`) |
| Reuse memory | stable `sessionId` persists the conversation across runs |

See [docs/api.md](api.md) for the full surface, [docs/providers.md](providers.md)
for the provider matrix, and the `examples/` folder for runnable demos
(`pnpm example`, `pnpm demo`, `pnpm demo:skills`, `pnpm demo:plugin`).

## Installing the editor plugin

The repo also distributes a plugin that brings the harness to Claude Code,
Codex, opencode, Antigravity, and GitHub Copilot:

```bash
bash plugin/install.sh
```

See [`plugin/README.md`](../plugin/README.md) and [docs/mcp.md](mcp.md).