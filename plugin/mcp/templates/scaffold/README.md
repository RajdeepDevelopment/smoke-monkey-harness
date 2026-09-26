# {{AGENT_NAME}}

A looping AI agent built on [smoke-monkey-harness](https://github.com/RajdeepDevelopment/smoke-monkey-harness)
— the agent loop, 24 tools, permissions, sub-contexts, skills, MCP, and
compaction, with no framework lock-in.

## Quickstart

```sh
npm install
export NVIDIA_API_KEY=nvapi-...          # or OPENAI_API_KEY / OPENROUTER_API_KEY / ...
npm run dev -- "write a README for this repo"
```

> The dependency is `smoke-monkey-harness@^1.1.0` from npm. If you are working
> inside a checkout of the library itself, `file:../../..` works too.

Set `PROVIDER` / `MODEL` to swap LLM backends (e.g. `openrouter` +
`anthropic/claude-sonnet-4`).

## What's in the box

- `src/index.ts` — the agent entry point. Wire `permission.required`,
  `ask_user.required`, and `mcp.approval_required` events to your UI here.
- `src/skills/` — SKILL.md folders loaded just-in-time with `use_skill`
  (Claude Code / Codex / opencode format).
- `tsconfig.json` / `package.json` — NodeNext ESM, strict TS.

## Building a real agent

1. **Tasks** — pass the task to `agent.run(task)` and read `result.status`.
2. **Tools** — the library ships 24 in 5 groups; add your own with `tools`:
   ```ts
   createAgent({
     tools: [
       'filesystem', 'terminal', 'search', 'git', 'agent',
       { name: 'my_tool', description: '...', inputSchema: {...}, annotations: {...},
         execute: async (input, ctx) => ({ content: [{ type: 'text', text: 'done' }] }) },
     ],
   })
   ```
3. **Sub-contexts** — register `subContexts` for domain guidance the agent
   opens/closes with `context_manage`.
4. **MCP** — pass `mcp` server configs (stdio or streamable-HTTP); tools appear
   as `<server>__<tool>` while `mcp_<id>` is active.
5. **Persistence** — pass a `store` (default in-memory) to persist sessions and
   resume across `run()` calls with `sessionId`.

See the package README for the full API.