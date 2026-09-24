# Build a looping AI agent with @smoke-monkey/harness

You are looking at a framework-agnostic library for building **looping AI
agents** — the same agent core behind the Smoke Monkey code editor. It gives you
an agent-loop (LLM turn orchestration), a tool system, permissions, context
management, compaction, an LLM client, MCP clients, and skills — with no NestJS,
no databases, no framework lock-in.

Use it to build: autonomous coding agents, AI code editors, RAG Q&A bots,
research agents, dev-tool assistants, or any agent that must **plan → act →
verify → fix → finish** in a loop.

> The `harness_guide` tool that returned this text is part of the
> **smoke-monkey-harness MCP server**. Companion tools:
> `harness_scaffold` (generate a starter project), `harness_examples`
> (sample programs), `harness_status` (installed library facts).

---

## 1. The mental model

An agent is just:

1. **A system prompt** — identity, working-set rules, and (now) skills.
2. **A loop** — ask the model how to proceed, execute its tool calls, feed the
   results back, detect done, guard against infinite loops.
3. **Tools** — what the agent can actually do (files, terminal, search, git,
   MCP servers, your own custom tools).
4. **Context** — sub-contexts (on-demand guidance blocks), skills
   (just-in-time instruction bundles), and compaction (auto-summarise long runs).

The library ships the loop + guards + the common tools. You bring the provider
key, the storage hook (optional), and the UI bindings (events).

## 2. Quickstart (code)

```ts
import { createAgent } from '@smoke-monkey/harness'

const agent = createAgent({
  provider: 'nvidia',                          // openai | openrouter | nvidia | xai | gemini | ollama | ...
  model: 'nvidia/nemotron-3-super-120b-a12b', // any tool-capable model
  apiKey: process.env.NVIDIA_API_KEY,         // string or resolver (provider, userId?) => key
  workspacePath: process.cwd(),               // REQUIRED — where the agent operates
})

// Route the two interactive pauses to your UI (or set autoApprove: true)
agent.on('permission.required', (e) => agent.resolvePermission(e.data.toolCallId, 'allow'))
agent.on('ask_user.required',    (e) => agent.respond(e.data.toolCallId, await promptUser(e.data.question)))

const result = await agent.run('Add a /health route and prove it with curl.')
console.log(result.status, result.messages.at(-1)?.content)
```

That's a full looping agent. `run()` drives the loop to completion; the model
calls tools, reads results, verifies, and calls `finish_task` when done.

## 3. The loop, guards, and phases

- Every run goes through `explore → plan → edit → verify → recover → complete`.
- Guards stop pathology: no-progress, repeated-failure, same-output loops,
  empty responses, runaway steps (`MAX_STEPS`), and "doom loops".
- The model is told (at init, via `renderRunOperatingRules`): small verifiable
  steps, never fire the same failing call twice, call `finish_task` when done.

## 4. Options that matter

| option | what it does |
| --- | --- |
| `provider` / `model` / `apiKey` | LLM backend. Streams where supported. |
| `workspacePath` | workspace the agent reads/writes. |
| `agentId` | `build` (default) · `plan` · `explore` · `general` shaping the mode block. |
| `tools` | pick tool GROUPS (`"filesystem" | "terminal" | "search" | "git" | "agent"`) or pass custom `ToolDefinition[]`. |
| `permission` / `autoApprove` | `allow-all` · `deny-all` · `ask-default` · custom function. Read-only tools auto-allow. |
| `subContexts` / `defaultSubContexts` | register your own domain-guidance sub-contexts + which start active. |
| `skillsDir` / `skills` | SKILL.md folders (Claude/Codex/opencode format) loaded just-in-time. |
| `mcp` | MCP servers (stdio or streamable-HTTP); tools appear as `<server>__<tool>` while `mcp_<id>` is active. |
| `systemPrompt` / `subSystemPrompt` | replace or extend the built-in prompt. |
| `sessionId` | resume multi-run memory; pass a `store` to persist anywhere. |

## 5. Built-in tools (24, in 5 groups)

- **filesystem**: read_file, write_file, edit_file, line_edit, replace_lines,
  apply_patch, delete_file, list_directory, inspect.
- **terminal**: run_command, run_test.
- **search**: glob, grep.
- **git**: git_status, git_diff, git_log.
- **agent**: ask_user, context_manage, todo_write, finish_task
  (+ `list_skills`, `use_skill` when skills exist; + MCP tools when servers exist).

## 6. Sub-contexts, skills, MCP

- **Sub-contexts**: guidance blocks the agent opens/closes with `context_manage`
  (`activate` / `deactivate` / `swap` / `set`). Active ones appear in a panel
  every turn. Register your own with `subContexts`.
- **Skills**: `SKILL.md` folders (Claude Code / Codex / opencode compatible)
  loaded just-in-time — `list_skills` to browse, `use_skill` to pull instructions
  in. Discovered from `skillsDir` or the default `.opencode/.claude/.codex/skills`.
- **MCP**: connect external servers; the model activates `mcp_<id>` before using
  their `<server>__<tool>` tools. Disabled/needed-key servers pause for user
  approval (`mcp.approval_required` → `resolveMcpDecision`). `inspect_mcp_stock`
  recommends servers from a curated catalog.

## 7. Events you bind your UI to

`run.started/completed/failed/interrupted`, `step.started/ended`,
`tool.started/output/progress/completed/failed`, `text.delta/thought/end`,
`phase.changed`, `context.updated`, `permission.required`, `ask_user.required`,
`mcp.approval_required`, `mcp.resolved`, `compaction.started/completed`,
`todo.updated`. Subscribe with `agent.on(type, cb)` or `agent.onAny(cb)`.

## 8. Build something now

1. **Scaffold a starter project** → call `harness_scaffold({ targetDir })` — it
   writes a `package.json`, `tsconfig.json`, `src/index.ts` agent, a sample
   skill, and a README.
2. **Study examples** → `harness_examples` lists them; `harness_read_example`
   returns one verbatim.
3. **Wire it** → `npm install` in the scaffold, add your provider key, run
   `npm run dev -- "your first task"`.

Keep runs small and verifiable, and read the loop output before acting — the
library handles the loop, you handle the product.