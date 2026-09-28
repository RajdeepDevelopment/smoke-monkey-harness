# Feature guide — MCP servers

Attach today's tool ecosystem (GitHub, Postgres, Playwright, Slack…) to your
agent as **MCP servers**. A server's tools surface namespaced as
`<server-id>__<tool>` and are exposed only while the matching `mcp_<id>`
sub-context is active.

This guide's main job: explain the exact path a model walks to *find* an MCP
server, *decide* it needs one, and *ask* for it — and where the host's job ends
and the model's begins.

## Config shape

```ts
mcp: [
  // stdio server (local binary on this machine):
  { id: 'github', name: 'github', description: 'GitHub API',
    command: 'npx', args: ['github-mcp-server'], enabled: true },

  // streamable-HTTP server (remote):
  { id: 'docs', name: 'docs', description: 'Docs search',
    url: 'https://mcp.example.com/mcp', headers: { authorization: 'Bearer ...' }, enabled: true },

  // A catalog entry, pre-filled, but OFF. The model can ask to turn it on:
  { id: 'postgres', name: 'postgres-mcp-server', description: 'Query Postgres',
    command: 'npx', args: ['postgres-mcp-server'], enabled: false },
]
```

Field | purpose
------|--------
`id` | snake_case; becomes the `mcp_<id>` sub-context and the `<id>__<tool>` prefix
`name` / `description` | human labels; `name` is also matched against the stock catalog
`command` / `args` / `cwd` / `env` | stdio launch options
`url` / `headers` | streamable-HTTP endpoint
`enabled` | start connected (default `true`); `false` = available, but the model must ask

The third entry is the one that makes stock search useful: a server can be
**configured but disabled**, which is the only state `request_mcp_approval` can
act on.

## Discovery: `mcpStockSearch` (opt-in, default off)

```ts
createAgent({
  workspacePath,
  mcp: [/* … */],
  mcpStockSearch: true,   // default false
})
```

`inspect_mcp_stock` is **not exposed by default**. It only helps while you are
deciding *what to link*; once your servers are added the agent already knows
them, so an unrequested search loop is pure context cost. Turn it on explicitly
when you want the model to be able to survey its inventory.

Two consequences of the flag, both deliberate:

1. **It registers the tool.** With it off, `inspect_mcp_stock` is not in the
   registry and the model cannot call it.
2. **It gates the prompt.** The stock-search doctrine ("run this at task start
   and every phase boundary") is only rendered when the tool is actually
   exposed. The prompt can never instruct a tool the model does not have — that
   mismatch is what produces hallucinated calls and stall loops. Guidance about
   activating and using **already-configured** servers is not gated and works
   either way.

## How the model finds and enables a server

This is the flow to design against. The two halves belong to different actors,
and the most common integration bug is expecting the model to do the host's job.

**Host side (before the run):** the host decides what *could* be available and
ships it in `options.mcp`. Servers ship with `enabled: false` when the model
should decide whether the task needs them. Nothing a model does can add a server
that is not in the config.

**Model side (during the run), four steps:**

1. **Survey — `inspect_mcp_stock(task)`, no pause.** Returns a compact ranked
   table of the servers in `options.mcp` with live status: `active`,
   `enabled-idle`, or `disabled`, plus tool count, transport, and whether the
   server is key-required. Bounded to 20 rows; filter with
   `includeCategories` to narrow instead of blowing the context window.
   `recommendedToEnableIds` names the *disabled* servers whose name/description
   matches the task text.
2. **Decide — in the model's head, silently.** The tool returns a
   `Candidates for this task (…) — you decide` line. No popup fires. The model
   is told to ignore the candidates and keep working if none is genuinely
   required. This step is the point: an LLM asking a human about every weakly
   matched server is worse than useless.
3. **Ask — `request_mcp_approval({ serverIds, reason })`, the only pause.** The
   run stops (`mcp.approval_required`) so a human can approve. Call it only for
   ids the model actually needs, and say *why* in `reason`. Ids that are already
   enabled, or that are not configured, produce a normal text result and **no**
   pause — so a wrong `serverIds` never traps the run in an approval loop.
4. **Resolve — host code answers.** The pause surfaces as a
   `mcp.approval_required` event; the host calls
   `agent.resolveMcpDecision(toolCallId, { action, names })` and the run
   resumes. On `enable` the server connects and its sub-context becomes
   available.

```ts
// Note the event envelope: everything the emitter sends is in `data`.
agent.on('mcp.approval_required', async (event) => {
  const { toolCallId, payload } = event.data as {
    toolCallId: string;
    payload: { task: string | null; servers: { id: string }[] };
  };
  // `payload.task` is the model's `reason` — surface it, humans approve far
  // more readily when they see why.
  const names = payload.servers.map((s) => s.id);
  const ok = await askOperator(`Enable ${names.join(', ')}? ${payload.task ?? ''}`);
  agent.resolveMcpDecision(toolCallId, { action: ok ? 'enable' : 'skip', names });
});
```

`action` is `'enable' | 'add' | 'skip'`. In practice the model only ever
produces ids that exist and are disabled, so `add` is for host-initiated flows.

Two things follow from step 1 that are easy to misread:

- **The inventory is what you configured, not the whole catalog.** The rows come
  from `options.mcp`. A stock server that is not in the config is not a
  candidate — the tool's own output says so ("Stock servers NOT configured here
  must be added to options.mcp before use"). To make a catalog entry reachable
  by the model, **configure it with `enabled: false`**.
- **Enabling is a model decision; adding is yours.** The model can flip
  `false → true`. It cannot invent a config. If a user should be able to attach a
  new server mid-run, that is your UI calling `agent.addMcpServer(cfg)`.

## Lifecycle

- **Lazy connect** — a server connects on first activation of `mcp_<id>`; no
  sockets are spent idle.
- **Activation** — the model opens `mcp_<id>` with `context_manage`, then calls
  `<id>__<tool>`.
- **Approval** — the ONLY tool that stops the run to ask, and it fires only
  because the model called it. `autoApprove: true` accepts recommendations
  without a human, which is fine for a trusted local run and wrong for one that
  can spend money.
- **Shutdown** — all servers close at run end (`closeAll()`).
- **Read-only guard** — tools that only read are usable without approval.

## Curated stock catalog (no config guessing)

```ts
import { listStockCategories, findStockEntry, stockToMcpConfig } from '@smoke-monkey/harness'
listStockCategories()                     // e.g. ['DevOps & CI/CD', 'Databases & Storage', ...]
const entry = findStockEntry('postgres-mcp-server')
const cfg = stockToMcpConfig(entry)       // ready-made McpServerConfig
```

An entry carries what a hand-written config gets wrong: `category`, the launch
`command`/`args` or `url`, `envKeys`, `keyGetUrl`, and `manualOAuth`. A server
whose entry has `envKeys.length > 0`, `manualOAuth`, `remote`, or a `keyGetUrl`
is reported as `key-required` in the stock table, so the model does not propose
one that cannot actually work.

Categories include: Development & Coding Tools · Datasets & APIs · DevOps &
CI/CD · Databases & Storage · Observability & Dev Tools · Communication &
Productivity · AI & Vector Search · Cloudflare · Hosting & Backend · File System
& Storage · Email & Calendar · Search & Research · Security & Auth · Monitoring
& Uptime · Design & Creative · Whiteboards & Flowcharts.

The catalog and `inspect_mcp_stock` are complementary: the catalog is how *you*
decide what to ship in `options.mcp`; the stock tool is how the model surveys
what you shipped.

## Misc helpers on the agent

`agent.addMcpServer(cfg)` / `agent.removeMcpServer(id)` / `agent.listMcpServers()`
— manage servers between runs (e.g. a UI toggle or a per-tenant config). Adding
a server mid-run is safe: its sub-context is available on the next activation.

## Product patterns

- **API access without SDKs** — a generic MCP server (any OpenAPI) beats writing
  a client tool per endpoint.
- **Ship the catalog, disabled.** Pre-configure the servers your users plausibly
  need with `enabled: false`, turn on `mcpStockSearch`, and let the model ask for
  the one it needs. That is what turns the stock catalog into a live suggestion
  surface instead of a config file the user has to read.
- **Multi-tenant tools** — register all servers but keep them `enabled: false`;
  enable the ones for the current tenant at run start.
- **Give `reason` a good default** in your approval UI. A human approves
  "the agent needs postgres-mcp-server" far more readily than "approve 1 server".
- **Safety** — combine with the permission layer: read-only tools pass, mutating
  MCP tools pause for approval decisions. A server's tools are still your
  permission surface; see `harness_guide_permissions_the_three_pauses`.
