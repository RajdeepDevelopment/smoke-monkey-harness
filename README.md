# @smoke-monkey/harness

Build agentic tools and AI code editors in a few lines. A framework-agnostic
rewrite of the agent core behind **[Smoke Monkey](https://github.com/RajdeepDevelopment/smoke-monkey-desktop)** —
the agent loop, 24 tools, permissions, compaction, and an LLM client — with no
NestJS, no database, no MCP infra to drag in.

## Quickstart

```ts
import { createAgent } from '@smoke-monkey/harness'

const agent = createAgent({
  provider: 'openrouter',
  model: 'anthropic/claude-3.7-sonnet',
  apiKey: process.env.OPENROUTER_API_KEY, // or pass a resolver: (provider) => key
  workspacePath: process.cwd(),
})

// Route permission prompts to your UI (or set autoApprove: true)
agent.on('permission.required', (e) => {
  const { toolCallId, toolName } = e.data
  agent.resolvePermission(toolCallId, /* allow | deny */ 'allow')
})

// Route ask_user questions to your UI
agent.on('ask_user.required', (e) => {
  agent.respond(e.data.toolCallId, await promptUser(e.data.question))
})

const result = await agent.run('Refactor the auth middleware to use JWTs, then run its tests.')
console.log(result.status, result.messages.at(-1)?.content)
```

Run locally with Ollama — no key needed:

```ts
const agent = createAgent({
  provider: 'ollama',
  model: 'qwen3:8b',
  workspacePath: process.cwd(),
})
```

## What you get

- **Agent loop** — LLM turn orchestration, tool-call parsing, phase machine
  (explore → plan → edit → verify → recover → complete), step / no-progress /
  runaway / spin guards, `finish_task` + report detection, interruption + resume.
- **24 built-in tools** in 5 groups — `filesystem`, `terminal`, `search`, `git`,
  `agent`. Disable groups with `tools` or register your own.

| Group | Tools |
| --- | --- |
| filesystem | read_file, write_file, edit_file, line_edit, replace_lines, apply_patch, delete_file, list_directory, inspect |
| terminal | run_command, run_test |
| search | glob, grep |
| git | git_status, git_diff, git_log |
| agent | ask_user, context_manage, todo_write, finish_task |

- **Permissions** — `allow-all` / `deny-all` / `ask-default`, or a function
  `({ toolName, args, workspacePath, userId }) => 'allow' | 'deny' | 'ask'`.
  Read-only tools default to allow.
- **Compaction** — auto-summarises when the conversation crosses the token
  budget, so long runs keep going without blowing the context window.
- **Events** — `run.started`, `step.started/ended`, `tool.started/output/progress/completed/failed`,
  `text.delta/thought/end`, `phase.changed`, `agent.state`, `context.updated`,
  `ask_user.required`, `permission.required`, `compaction.started/completed`,
  `llm.thinking`, `todo.updated`, `run.completed/failed/interrupted`.
  Subscribe with `agent.on(type, handler)` or `agent.onAny(handler)`.
- **Providers** — `openai`, `openrouter`, `nvidia`, `xai`, `gemini`, `opencode`,
  `omniroute`, `ollama` (REST + SSE streaming). Override the base URL with
  `baseUrl` for any OpenAI-compatible endpoint.
- **Swappable storage** — default is an in-memory store; implement the small
  `Storage` interface to persist sessions, runs, and messages anywhere.
- **Resumable sessions** — pass `sessionId` to continue work across runs with
  memory of what happened.

## API shape

`createAgent(options)` → `AgentHarness`

- `agent.run(task, opts?)` — run the agent to completion, pausing on questions /
  permission prompts.
- `agent.respond(toolCallId, text)` — answer a pending `ask_user` (questions are also sent as events).
- `agent.resolvePermission(toolCallId, 'allow' | 'deny')` — resolve a `permission.required` pause.
- `agent.abort()` — stop the current run.
- `agent.on(type, cb)` / `agent.onAny(cb)` — subscribe to events.
- `agent.events` / `agent.store` — the raw emitter and store, for advanced wiring.

Lower-level pieces are exported for custom builds: `AgentLoop` + `AgentLoopDeps`,
every tool factory (`getRunCommandTool()`, `getEditFileTool()`, …), `LLMClient`,
`ContextCompactionService`, `buildSystemPrompt`, `SubContextManager`, classfiers
(`classifyTaskGroups`, phases), and the loop guards.

## Development

```sh
npm install
npm run build   # tsc ESM (dist/) + CJS (dist/cjs/)
npm run typecheck
npm run example # runs examples/basic-agent.ts against a local Ollama
```

## License

PolyForm Noncommercial License 1.0.0 — free to use and modify for non-commercial
projects. See [LICENSE](./LICENSE).