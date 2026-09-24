# @smoke-monkey/harness

Build agentic tools and AI code editors in a few lines. A framework-agnostic
rewrite of the agent core behind **[Smoke Monkey](https://github.com/RajdeepDevelopment/smoke-monkey-desktop)** —
the agent loop, 24 tools, permissions, compaction, an LLM client, MCP (Model
Context Protocol) client/manager, and a sub-context system — with no NestJS and
no database.

## Quickstart

```ts
import { createAgent } from '@smoke-monkey/harness'

// Model needs tool-call support — NVIDIA Hosted NIM by default:
const agent = createAgent({
  provider: 'nvidia',
  model: 'nvidia/nemotron-3-super-120b-a12b',
  apiKey: process.env.NVIDIA_API_KEY, // or pass a resolver: (provider) => key
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

No key handy? Any OpenAI-compatible endpoint works (`openrouter`, `xai`,
`gemini`, …), or run locally with Ollama:

```ts
const agent = createAgent({ provider: 'ollama', model: 'qwen3:8b', workspacePath: process.cwd() })
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

- **MCP (Model Context Protocol)** — connect stdio servers
  (`command`/`args`, e.g. `npx`). or streamable-HTTP servers (`url`, e.g.
  Google/remote endpoints). Tools surface as `<server>__<tool>` while the
  matching `mcp_<id>` sub-context is active. Servers connect lazily on first
  use and close at run end — nothing spawns until the agent needs it.
  `inspect_mcp_stock` / `request_mcp_approval` recommend + gate disabled
  servers via a user approval pause (`mcp.approval_required` →
  `resolveMcpDecision`). A curated stock catalog (`flattenStock` /
  `stockToMcpConfig`) helps you provision well-known servers.
- **Sub-contexts** — load/unload domain guidance with the `context_manage`
  tool (activate / deactivate / swap / set). Register your OWN contexts with
  `options.subContexts` or `registerSubContext()`; they activate exactly like
  the built-ins and appear in the per-turn context panel.
- **Operating rules injected at initialization** — every run's system prompt
  starts with a standing block (`renderRunOperatingRules`) covering loop
  discipline, sub-context usage, and MCP operation, so the model holds the same
  invariants the whole run.
- **Permissions** — `allow-all` / `deny-all` / `ask-default`, or a function
  `({ toolName, args, workspacePath, userId }) => 'allow' | 'deny' | 'ask'`.
  Read-only tools default to allow.
- **Compaction** — auto-summarises when the conversation crosses the token
  budget, so long runs keep going without blowing the context window.
- **Events** — `run.started`, `step.started/ended`, `tool.started/output/progress/completed/failed`,
  `text.delta/thought/end`, `phase.changed`, `agent.state`, `context.updated`,
  `ask_user.required`, `permission.required`, `mcp.approval_required`,
  `mcp.resolved`, `compaction.started/completed`, `llm.thinking`,
  `todo.updated`, `run.completed/failed/interrupted`.
  Subscribe with `agent.on(type, handler)` or `agent.onAny(handler)`.
- **Providers** — `openai`, `openrouter`, `nvidia`, `xai`, `gemini`, `opencode`,
  `omniroute`, `ollama` (REST + SSE streaming). Override the base URL with
  `baseUrl` for any OpenAI-compatible endpoint.
- **Swappable storage** — default is an in-memory store; implement the small
  `Storage` interface to persist sessions, runs, and messages anywhere.
- **Resumable sessions** — pass `sessionId` to continue work across runs with
  memory of what happened.

### MCP configuration

```ts
import { createAgent, stockToMcpConfig, findStockEntry } from '@smoke-monkey/harness'

const agent = createAgent({
  provider: 'nvidia',
  model: 'nvidia/nemotron-3-super-120b-a12b',
  apiKey: process.env.NVIDIA_API_KEY,
  workspacePath: process.cwd(),
  mcp: [
    // stdio server:
    {
      id: 'filesystem',
      name: 'filesystem-mcp',
      description: 'Local filesystem tools',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      enabled: true,
    },
    // streamable-HTTP server:
    {
      id: 'miro',
      name: 'miro',
      description: 'Miro boards',
      url: 'https://mcp.miro.com/',
      headers: { authorization: 'Bearer ' + process.env.MIRO_TOKEN },
      enabled: false, // disabled servers need user approval before use
    },
    // ...or pull a config from the stock catalog:
    stockToMcpConfig(findStockEntry('playwright-mcp')!) ,
  ],
  // User-owned sub-contexts, registered at init:
  subContexts: [
    {
      id: 'team_api_guide',
      title: 'Team API conventions',
      summary: 'Internal API routing + error conventions for this repo.',
      content: 'All routes live under src/routes. Errors use { code, message }.',
    },
  ],
})

agent.on('mcp.approval_required', (e) => {
  // the run pauses here — enable the recommended servers or skip
  agent.resolveMcpDecision(e.data.toolCallId, {
    action: 'enable',
    names: e.data.payload.recommendedToEnableIds,
  })
})
```

## API shape

`createAgent(options)` → `AgentHarness`

- `agent.run(task, opts?)` — run the agent to completion, pausing on questions /
  permission prompts.
- `agent.respond(toolCallId, text)` — answer a pending `ask_user` (questions are also sent as events).
- `agent.resolvePermission(toolCallId, 'allow' | 'deny')` — resolve a `permission.required` pause.
- `agent.resolveMcpDecision(toolCallId, { action: 'enable' | 'add' | 'skip', names })` —
  resolve an `mcp.approval_required` pause (enabling turns the server on for this and later runs).
- `agent.addMcpServer(config)` / `agent.removeMcpServer(id)` / `agent.listMcpServers()` —
  manage configured MCP servers at runtime.
- `agent.abort()` — stop the current run.
- `agent.on(type, cb)` / `agent.onAny(cb)` — subscribe to events.
- `agent.events` / `agent.store` — the raw emitter and store, for advanced wiring.

Lower-level pieces are exported for custom builds: `AgentLoop` + `AgentLoopDeps`,
every tool factory (`getRunCommandTool()`, `getEditFileTool()`, `getInspectMcpStockTool()`, …),
`McpManager` + `getHttp...` MCP clients, `LLMClient`, `ContextCompactionService`,
`buildSystemPrompt` / `renderRunOperatingRules`, `SubContextManager` +
`registerSubContext`, classifiers (`classifyTaskGroups`, phases), and the loop guards.

## Development

```sh
npm install
npm run build   # tsc ESM (dist/) + CJS (dist/cjs/)
npm run typecheck
npm run test:fixtures        # offline MCP client + tool-exposure checks (no LLM)
NVIDIA_API_KEY=nvapi-... npm run example  # examples/basic-agent.ts
NVIDIA_API_KEY=nvapi-... npm run demo     # examples/mcp-demo.ts (MCP + custom sub-contexts)
```

## License

PolyForm Noncommercial License 1.0.0 — free to use and modify for non-commercial
projects. See [LICENSE](./LICENSE).