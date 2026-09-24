---
name: smoke-monkey-harness
description: >-
  Build a new looping AI agent (autonomous coding agent, code editor, RAG/Q&A
  bot, research or dev-tool assistant) on the smoke-monkey-harness library. Use
  whenever the user wants to create, scaffold, or start a new agent,
  assistant, or agentic tool; or asks how to use or install this harness
  library and its plugin/MCP server.
---

# Build a looping AI agent with smoke-monkey-harness

Framework-agnostic: `agent = prompt + loop + tools + context`. The library
ships the loop (LLM-turn orchestration), 24 tools in 5 groups, permissions,
sub-contexts, skills, MCP clients, and compaction — no NestJS/database lock-in.
You wire a provider key + optional UI; it does the rest.

Decide which path is available:

- **MCP path (preferred)** — the bundled `smoke-monkey-harness` MCP server is
  connected. Drive it with the tools in `references/mcp-tools.md`.
- **Standalone path** — no MCP server. Build from the quickstart below and the
  digests in `references/features.md`.

## Workflow (MCP path)

1. `harness_status()` — confirm the plugin + library facts.
2. `harness_guide({ topic? })` — the end-to-end playbook (install → scaffold →
   wire → verify → extend → ship).
3. `harness_plan({ goal })` — a concrete plan for THIS product: provider/model,
   agentId, tools, wiring, verification gate.
4. For real understanding, pull the relevant `harness_guide_<feature>` deep
   dive: `subcontexts` · `skills` · `mcp` · `providers` · `tools` · `loop` ·
   `permissions` · `storage` · `events` — and/or slice `harness_api({ area })`.
5. Study an example: `harness_examples()` then
   `harness_read_example({ name: "basic-agent.ts" })`.
6. `harness_scaffold({ targetDir, name? })` — materialises the project.
7. `harness_verify({ targetDir })` — runs `npm run typecheck`; PASS before you
   ship. Then run the scaffold with a SMALL task to confirm an end-to-end run.

## Workflow (standalone path)

1. Read `references/features.md` for the 9 feature digests and `references/api.md` for signatures.
2. Scaffold manually (or `npx create-…` if one exists) from this skeleton:

```ts
import { createAgent } from 'smoke-monkey-harness'
const agent = createAgent({
  provider: process.env.PROVIDER ?? 'nvidia',
  model: process.env.MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
  apiKey: process.env.NVIDIA_API_KEY,
  workspacePath: process.cwd(),
  autoApprove: true,                      // or route permission.required to the UI
})
agent.on('ask_user.required', (e) => agent.respond(e.data.toolCallId, answer))
const result = await agent.run(task)
```

## Choosing agentId / provider / model

| goal looks like | `agentId` |
| --- | --- |
| coding/editing/refactor/build/fix | `build` |
| research/understand/investigate | `explore` |
| roadmap/design/proposal only | `plan` |
| chat/QA/RAG/answers | `general` |

- `provider`: `nvidia` (NVIDIA_API_KEY) · `openai` (OPENAI_API_KEY) ·
  `openrouter` (OPENROUTER_API_KEY) · `xai` (XAI_API_KEY) · `gemini`
  (GEMINI_API_KEY) · `opencode` (OPENCODE_API_KEY) · `omniroute`
  (OMNIROUTE_API_KEY) · `ollama` (local, default).
- Model must support tool-calls. Known-good: `nvidia/nemotron-3-super-120b-a12b`,
  `gpt-5`, `anthropic/claude-3.7-sonnet`, `qwen3:8b` (ollama).
- Defaults: the scaffold sets nvidia + nemotron-3-super-120b-a12b.

## The verify gate (do not skip)

After scaffold or edits: `npm install && npm run typecheck`; then run a SMALL
task and require `result.status === "completed"`. Loop → tool-call → verify →
`finish_task` proven before the product work begins.

## Conventions

- Every agent needs `workspacePath` (required); keep tool calls scoped to it.
- Read-only tools auto-allow; mutations ask unless `autoApprove`.
- Real products route the three interactive pauses
  (`permission.required`, `ask_user.required`, `mcp.approval_required`) to a UI.
- Extend with the four building blocks: custom `tools`, `subContexts`,
  `skills/skillsDir`, and `mcp` servers — never by forking the loop.

## Support files

- `references/mcp-tools.md` — the 18 MCP server tools, args, and call order.
- `references/features.md` — the 9 feature digests (standalone learning).
- `references/api.md` — condensed API reference (options/surface/events/tools).
- Repo source of truth: `src/` + `examples/` in
  https://github.com/RajdeepDevelopment/smoke-monkey-harness