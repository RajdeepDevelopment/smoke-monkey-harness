# Feature guide — MCP servers

Attach today's tool ecosystem (GitHub, Postgres, Playwright, Slack…) to your
agent as **MCP servers**. Tools surface namespaced as `<server-id>__<tool>` and
are exposed only while the matching `mcp_<id>` sub-context is active.

## Config shape

```ts
mcp: [
  // stdio server (local binary on this machine):
  { id: 'github', name: 'github', description: 'GitHub API',
    command: 'npx', args: ['github-mcp-server'], enabled: true },

  // streamable-HTTP server (remote):
  { id: 'docs', name: 'docs', description: 'Docs search',
    url: 'https://mcp.example.com/mcp', headers: { authorization: 'Bearer ...' }, enabled: true },
]
```

Field | purpose
------|--------
`id` | snake_case; becomes the `mcp_<id>` sub-context and the `id__tool` prefix
`name` / `description` | human labels for the catalog
`command` / `args` / `cwd` / `env` | stdio launch options
`url` / `headers` | streamable-HTTP endpoint
`enabled` | start connected (default true)

## Lifecycle

- **Lazy connect** — a server connects on first activation of `mcp_<id>`; no
  sockets are spent idle.
- **Activation** — the model opens `mcp_<id>` with `context_manage`, then calls
  `<id>__<tool>`.
- **Approval** — unknown/disabled servers pause `request_mcp_approval`
  (`mcp.approval_required`). Resolve with:
  `agent.resolveMcpDecision(toolCallId, { action: 'enable', names: [...] })`
  (or `'leave'` / `'deny'`). With `autoApprove: true`, recommended servers
  enable automatically.
- **Shutdown** — all servers close at run end (`closeAll()`).
- **Read-only guard** — tools that only read are usable without approval.

## Curated stock catalog (no config guessing)

```ts
import { listStockCategories, findStockEntry, stockToMcpConfig } from 'smoke-monkey-harness'
listStockCategories()                     // e.g. ['DevOps & CI/CD', 'Databases & Storage', ...]
const entry = findStockEntry('postgres-mcp-server')
const cfg = stockToMcpConfig(entry)       // ready-made McpServerConfig
```

Categories include: Development & Coding Tools · Datasets & APIs · DevOps &
CI/CD · Databases & Storage · Observability & Dev Tools · Communication &
Productivity · AI & Vector Search · Cloudflare · Hosting & Backend · File System
& Storage · Email & Calendar · Search & Research · Security & Auth · Monitoring
& Uptime · Design & Creative · Whiteboards & Flowcharts.

## Misc helpers on the agent

`agent.addMcpServer(cfg)` / `agent.removeMcpServer(id)` / `agent.listMcpServers()`
— manage servers between runs (e.g. a UI toggle or a per-tenant config).

## Product patterns

- **API access without SDKs** — a generic MCP server (any OpenAPI) beats writing
  a client tool per endpoint.
- **Multi-tenant tools** — register all servers but keep them `enabled: false`;
  enable the ones for the current tenant at run start.
- **Safety** — combine with the permission layer: read-only tools pass, mutating
  MCP tools pause for approval decisions.