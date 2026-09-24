# Build a looping AI agent with @smoke-monkey/harness — end-to-end playbook

You are holding the master instructions for **@smoke-monkey/harness**, a
framework-agnostic library for building **looping AI agents** — the same agent
core behind the Smoke Monkey code editor. It provides an agent-loop (LLM-turn
orchestration), 24 tools, permissions, sub-contexts, skills, MCP clients, and
compaction — with no NestJS, no database, no framework lock-in.

**Who this is for:** any AI agent (Claude Code, Codex, opencode, …) that needs
to build another AI agent on this library. This server's tools —
`harness_guide`, `harness_scaffold`, `harness_examples`, `harness_read_example`,
`harness_status` — carry you from zero to a verified, running agent.

> This text came from the `harness_guide` tool. Follow the playbook below
> top-to-bottom; use the companion tools at each step.

---

## The end-to-end playbook

### Step 0 — Why this library
An agent = prompt + loop + tools + context. The library ships all four (plus
loop guards and compaction). You wire a provider key and a UI, then ship.

### Step 1 — Install the library
```sh
npm install @smoke-monkey/harness            # published release
# or, while pre-release:
npm install github:RajdeepDevelopment/smoke-monkey-harness#main
```
Needs Node ≥ 18. TypeScript projects: add `"types": ["node"]` and install
`@types/node` (the scaffold's `tsconfig.json` already does both).

### Step 2 — Scaffold the project (do this now)
Call **`harness_scaffold({ targetDir, name })`**. It writes a complete,
typecheck-clean starter:

```
<targetDir>/
  package.json            # deps + dev/build/typecheck scripts
  tsconfig.json           # strict, NodeNext, @types/node
  src/index.ts            # the agent entry point (createAgent + events + run)
  src/skills/example/SKILL.md   # sample just-in-time skill
  README.md               # how to run / extend
  .mcp.json               # re-exports this MCP server for your project
```

No MCP for scaffolding? Copy the Step 5 code into `src/index.ts` yourself.

### Step 3 — Read one example (recommended)
- **`harness_examples`** → `basic-agent.ts`, `skills-agent.ts`, `mcp-agent.ts`
- **`harness_read_example({ name })`** → the full source of one of them

These are the smallest correct programs; match your product to the closest one.

### Step 4 — Wire the agent (the three pauses)
In the scaffold's `src/index.ts`, route every interactive pause to your UI —
or keep `autoApprove: true` for a local/demo agent:

```ts
import { createAgent } from '@smoke-monkey/harness'

const agent = createAgent({
  provider: process.env.PROVIDER ?? 'nvidia',            // openai | openrouter | nvidia | xai | gemini | opencode | omniroute | ollama
  model: process.env.MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
  apiKey: process.env.NVIDIA_API_KEY,                    // string or resolver (provider, userId?) => key
  workspacePath: process.cwd(),                          // REQUIRED — the agent's operating dir
  autoApprove: true,                                     // remove for production
  // agentId: 'build' | 'plan' | 'explore' | 'general'
  // tools: ['filesystem','terminal','search','git','agent', myCustomTool],
  // subContexts: [...], defaultSubContexts: [...],      // your domain guidance
  // skillsDir: 'skills',                                // SKILL.md folders (just-in-time)
  // mcp: [{ id, name, description, command, args, url, headers, enabled }],
})

agent.on('permission.required', (e) => agent.resolvePermission(e.data.toolCallId, 'allow'))
agent.on('ask_user.required',    (e) => agent.respond(e.data.toolCallId, await promptUser(e.data.payload.question)))
agent.on('mcp.approval_required',(e) => agent.resolveMcpDecision(e.data.toolCallId, { action: 'enable', names: e.data.payload.recommendedToEnableIds ?? [] }))
agent.onAny((e) => e.type.startsWith('tool.') && console.log(e.type, e.data.toolCallId))

const result = await agent.run('Your task — e.g. "Add a /health route and prove it with curl."')
console.log(result.status, result.messages.at(-1)?.content)
```

`agent.run(task)` drives the whole loop: the model plans, calls tools, feeds
results back, verifies, and calls `finish_task` when done.

### Step 5 — Verify (do not skip)
```sh
npm install
npm run typecheck        # must be clean — this is where most scaffold issues surface
npm run dev -- "list the files in this directory"   # a SMALL first task
```
Success criteria: `result.status === 'completed'`, tool lines printed, and the
task's output in `result.messages`. Then grow the task.

### Step 6 — Extend with the four building blocks
1. **Custom tools** — pass `ToolDefinition { name, description, inputSchema, annotations?, execute }` in `tools`.
2. **Sub-contexts** — domain-guidance blocks the model opens/closes with
   `context_manage` (`set/activate/deactivate/swap/list`, max 10 active).
3. **Skills** — `SKILL.md` folders loaded just-in-time (`list_skills` →
   `use_skill`), in the same format Claude Code / Codex / opencode use.
4. **MCP servers** — stdio (`command`/`args`) or streamable-HTTP (`url`/`headers`);
   tools surface as `<server>__<tool>` while `mcp_<id>` is active; disabled
   servers pause for `resolveMcpDecision`.

### Step 7 — Ship
- Persist memory: pass a `store` (implement the small `Storage` interface) +
  a stable `sessionId` to resume across runs.
- Bind real UI to events: `run.started/completed/failed`, `step.started/ended`,
  `tool.started/output/progress/completed/failed`, `text.delta/thought/end`,
  `phase.changed`, `context.updated`, `permission.required`, `ask_user.required`,
  `mcp.approval_required`, `mcp.resolved`, `compaction.started/completed`,
  `todo.updated`.
- The loop guards (no-progress, repeated-failure, same-output, empty-response,
  runaway `MAX_STEPS`) and auto-compaction keep long runs healthy.

---

## Quick reference

**Options** — `provider` · `model` · `apiKey` · `baseUrl` · `workspacePath` (req) ·
`projectDir` · `agentId` · `tools` · `systemPrompt` · `subSystemPrompt` ·
`permission` · `autoApprove` · `sessionId` · `store` · `userId` ·
`loadProjectConfig` · `subContexts` · `defaultSubContexts` · `skills` · `skillsDir` · `mcp` · `logger`.

**Built-in tools (24, 5 groups)** —
filesystem: read_file write_file edit_file line_edit replace_lines apply_patch delete_file list_directory inspect ·
terminal: run_command run_test · search: glob grep · git: git_status git_diff git_log ·
agent: ask_user context_manage todo_write finish_task (+ `list_skills`/`use_skill` with skills; + MCP tools with servers).

**Loop** — phases `explore → plan → edit → verify → recover → complete`;
guards stop pathology; verification failures demote `verify → recover`;
`finish_task` ends the run.

**Agents surface** — `agent.run(task)` · `respond` · `resolvePermission` ·
`resolveMcpDecision` · `addMcpServer/removeMcpServer/listMcpServers` ·
`agent.skills.all()/get()/count` · `abort()` · `on/onAny` · `events` · `store`.

**MCP shape** — `{ id, name, description, icon?, command?, args?, cwd?, env?, url?, headers?, enabled? }`;
lazy-connect on first `mcp_<id>` activation, closed at run end; curated stock
configs via `stockToMcpConfig(findStockEntry('…'))`.

---

## How your agent uses this server

1. `harness_status` — confirm the plugin works.
2. `harness_guide` — read this playbook (optionally pass `topic`).
3. `harness_scaffold` — generate the project.
4. `harness_examples` + `harness_read_example` — study the smallest correct programs.
5. Install / typecheck / run a small task (Step 5) — then build the product.

Called from Claude Code (`.mcp.json`), Codex (`.mcp.json`), opencode
(`opencode.json` `mcp` block), or any MCP stdio client. The companion
smoke-monkey-harness **skill** (installed by `plugin/install.sh`) tells your
agent exactly when to call these tools.