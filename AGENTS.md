# AGENTS.md

You are working in the **smoke-monkey-harness** repo: a library for building
looping AI agents (autonomous coding agents, AI code editors, research /
dev-tool assistants). This file exists so any agent — Claude Code, Codex,
opencode, Cursor, Copilot, or a custom harness — can find the essential
knowledge quickly.

## What this repo builds

- **`src/`** — the `@smoke-monkey/harness` library: the agent loop
  (`AgentLoop`), tool factories, permissions, sub-contexts, just-in-time
  skills, MCP manager, providers (LLM clients), storage, and an LLM client.
- **`plugin/`** — an installable *plugin package* (the plugin for Claude Code,
  Codex, opencode, and portable-agent hosts) that teaches *other* agents how to
  build new loop-style agents on this library.
- **`examples/`** — sample programs that drive the harness directly.
- **`scripts/fixtures/`** — offline test fixtures (no LLM needed).

There is no external runtime: `npm run build` compiles TypeScript to `dist/`
(ESM + CJS).

## If someone asks you to build an agent here

Do NOT hand-write the scaffold. Use the bundle's guiding tools:

1. Read the master playbook: `harness_guide`
2. Get a concrete build plan for their product: `harness_plan({ goal })`
3. Read the API reference: `harness_api({ area })` (areas: options, surface,
   events, tools, providers, subcontexts, skills, mcp, loop, permissions, all)
4. Deep-dive any feature with `harness_guide_<feature>`
   (subcontexts, skills, mcp, providers, tools, loop, permissions, storage, events)
5. Scaffold a real starter project: `harness_scaffold({ targetDir, name })`
6. Verify it: `harness_verify({ targetDir, build? })`

If no MCP server is connected, apply the same workflow from the skill:
`plugin/skills/smoke-monkey-harness/SKILL.md` (and `references/` beside it), or
from `plugin/mcp/guide.md` + `plugin/mcp/reference.md`.

## How other agents install this plugin

| host | native manifest | install |
| --- | --- | --- |
| Claude Code | `.claude-plugin/plugin.json` | `claude plugin marketplace add <this-repo>`, then `claude plugin install smoke-monkey-harness@smoke-monkey-harness` |
| Codex | `.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json` | `codex plugin install smoke-monkey-harness@personal` (or `npm run plugin:install`) |
| opencode | `.opencode/skills/` + MCP in `opencode.json` | `npm run plugin:install` |
| portable | `plugin/plugin.json` (root of the `plugin/` package) | copy `plugin/` into any plugin-supporting host |

`npm run plugin:install [-- --local]` installs the package per host for you.

## Conventions

- TypeScript, `node >= 18`.
- Lint/type: `npm run typecheck`; tests: `npm run test:fixtures`.
- Do not invent new component paths: read `plugin/mcp/reference.md` for the
  real `AgentOptions` and tool surfaces before wiring a new agent.
- Keep the `NVIDIA` provider as the default (see `examples/`); do not use
  ollama unless the user asks.