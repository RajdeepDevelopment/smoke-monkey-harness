---
name: Build agents with @smoke-monkey/harness
description: Build a new looping AI agent (autonomous coding agent, RAG bot, dev-tool assistant) on the @smoke-monkey/harness library. Use whenever the user wants to create/build/start a new agent, AI assistant, or agentic tool, or asks how to use this harness library.
---

# Build a looping AI agent with @smoke-monkey/harness

`@smoke-monkey/harness` is a framework-agnostic library for building **looping
AI agents** — LLM-turn orchestration, 24 tools, permissions, sub-contexts,
skills, MCP clients, and compaction, with no NestJS/database lock-in. You build
your product on it; it provides the loop.

## Workflow

1. **Get the guide.** Prefer the harness MCP server (`harness_guide`, then
   `harness_examples` / `harness_read_example`) when it is connected — it has
   the live guide and bundled examples. Without MCP, read the package
   README at https://github.com/RajdeepDevelopment/smoke-monkey-harness
   (`src/` + `examples/` are the reference).
2. **Scaffold a project** with `harness_scaffold({ targetDir })` (a starter
   `package.json`, `tsconfig.json`, `src/index.ts`, sample skill, README). If
   the MCP server is unavailable, create the project from the README's
   quickstart instead.
3. **Wire the agent** in `src/index.ts`:
   ```ts
   import { createAgent } from '@smoke-monkey/harness'
   const agent = createAgent({
     provider: process.env.PROVIDER ?? 'nvidia',
     model: process.env.MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
     apiKey: process.env.NVIDIA_API_KEY,
     workspacePath: process.cwd(),
     autoApprove: true,   // or route permission.required to the UI
   })
   agent.on('ask_user.required', (e) => agent.respond(e.data.toolCallId, answer))
   const result = await agent.run(task)
   ```
4. **Extend** with the pieces above the base loop:
   - `tools` — pick built-in groups (`filesystem|terminal|search|git|agent`)
     or add custom `ToolDefinition`s.
   - `subContexts` / `defaultSubContexts` — your own domain-guidance blocks the
     agent opens with `context_manage`.
   - `skillsDir` (or `skills`) — SKILL.md folders loaded just-in-time with
     `list_skills` / `use_skill` (the same format as this skill).
   - `mcp` — external servers; tools are `<server>__<tool>` while `mcp_<id>`
     is active; disabled servers pause for `resolveMcpDecision`.
   - `sessionId` + a `store` for resume-able multi-run memory.
5. **Verify the scaffold compiles**: `npm install && npm run typecheck` in the
   target dir, then run a small task.

## Conventions
- Every agent needs a `workspacePath`; keep tool calls scoped to it.
- Read-only tools auto-allow; mutations ask unless `autoApprove`.
- The model holds the loop rules from init (`renderRunOperatingRules`) — keep
  your own instructions to the `systemPrompt`/`subSystemPrompt` options.
- Real products route the three interactive events
  (`permission.required`, `ask_user.required`, `mcp.approval_required`) to a UI
  instead of `autoApprove`.

## Support files
- `references/api.md` — condensed option/tool/event reference.
- The MCP server adds `harness_guide`, `harness_scaffold`, `harness_examples`,
  `harness_read_example`, `harness_status` tools.