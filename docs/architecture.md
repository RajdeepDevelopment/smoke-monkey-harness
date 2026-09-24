# Architecture

```
┌─────────────────────────────── createAgent() ───────────────────────────────┐
│  AgentHarness                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  AgentLoop                 services/agent-loop.ts                       │ │
│  │   phase machine  explore→plan→edit→verify→recover→complete             │ │
│  │   guards (no-progress, repeats, empty, runaway)                        │ │
│  │   compaction (past COMPACTION_THRESHOLD)                               │ │
│  ├─────────────────────────────────────────────────────────────────────────┤ │
│  │  ToolLibrary             services/tool-library.ts                      │ │
│  │   built-ins (fs, terminal, search, git, agent, mcp, skills)            │ │
│  │   + MCP tools  <id>__<tool>   + custom ToolDefinition[]                │ │
│  ├─────────────────────────────────────────────────────────────────────────┤ │
│  │  RunContext              services/run-context.ts                       │ │
│  │   system prompt, messages, token budget, task classification           │ │
│  │   sub-contexts (goal, task, research_mode, constants, …)              │ │
│  ├─────────────────────────────────────────────────────────────────────────┤ │
│  │  Skills                   src/skills.ts                                │ │
│  │   list_skills / use_skill  — just-in-time SKILL.md injection           │ │
│  ├─────────────────────────────────────────────────────────────────────────┤ │
│  │  MCP Manager             services/mcp-manager.ts                       │ │
│  │   stdio + streamable-HTTP servers, lazy connect, approvals             │ │
│  ├─────────────────────────────────────────────────────────────────────────┤ │
│  │  LLM Client               services/llm-client.ts                       │ │
│  │   provider routing, tool calls, streaming, retry logic                 │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│   emit: run.* / step.* / text.* / tool.* / permission.* / context.* …      │
└───────────────────────────────────────────────────────────────────────────────┘
        ▲                        ▲                        ▲
        │ provider switches          custom tools            custom sub-contexts
   providers/*               ToolDefinition[]           registerSubContext()
```

## Layers

1. **`createAgent(options)` → `AgentHarness`** — the public entry
   (`src/index.ts`). Owns config, room setup, and runtime wiring.
2. **`AgentLoop.run(task)`** — the outer driver: builds the run snapshot, then
   repeatedly calls the model, executes tool calls, and checks phase/guards until
   the task finishes, fails, or is interrupted.
3. **`RunContext`** — immutable-per-turn context assembly: system prompt
   (base + sub-contexts + active skill), messages, and token budgeting.
4. **Tool layer** — every tool is a `ToolDefinition { name, description,
   inputSchema, execute }`; registry resolves names, exposes the curated groups,
   and guards read-only/mutating sets.
5. **Skill layer** — `.opencode/`, `.claude/`, `.codex/` (workspace + home)
   SKILL.md discovery. Catalog only in the prompt; full body injected on
   `use_skill`.
6. **MCP layer** — servers connect lazily. Tools appear as `<id>__<tool>` and are
   read-only until approved. Disabled or unknown servers raise an approval pause.
7. **Providers** — one OpenAI-compatible adapter, per-provider base URLs and key
   resolution; NVIDIA is the reference provider.

## Asynchronicity

`run()` returns a `Promise<RunResult>` and emits events as it goes:

- `text.delta` — streaming tokens (surfaced as `reasoning_content` on NVIDIA)
- `text.end` — model turn finished
- `tool.started` / `tool.output` / `tool.completed` / `tool.failed`
- `permission.required` / `ask_user.required` / `request_mcp_approval` —
  interactive pauses, resolvable via `resolvePermission` / `respond` /
  `resolveMcpDecision`
- `phase.changed`, `compaction.started/completed`, `agent.state`

## Design rules

- **Framework-agnostic core.** `src/` depends on Node built-ins only (plus the
  MCP client for the optional integration).
- **Keys never in code.** `apiKey` is a string or a `(provider, userId?) => key`
  resolver.
- **NVIDIA by default.** `options.provider` defaults to `nvidia`; every provider
  is a drop-in OpenAI-compatible config.

Larger pieces are called out in `docs/api.md`, `docs/tools.md`,
`docs/providers.md`, and `docs/mcp.md`.