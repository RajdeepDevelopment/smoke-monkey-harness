# MCP (Model Context Protocol)

The harness can surface external tools through the Model Context Protocol —
stdio servers (`command` / `args`) or streamable-HTTP servers (`url` / `headers`).

## Config

```ts
type McpServerConfig = {
  id: string;          // stable id, becomes the tool namespace
  name: string;
  description: string;
  icon?: string;
  command?: string;    // stdio: binary to spawn (e.g. 'npx')
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;        // streamable-HTTP transport
  headers?: Record<string, string>;
  enabled?: boolean;
};
```

## Connecting

```ts
const agent = createAgent({
  provider: 'nvidia',
  model: 'nvidia/nemotron-3-super-120b-a12b',
  workspacePath: process.cwd(),
  mcp: [
    { id: 'github', name: 'GitHub', description: 'GitHub API',
      command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN! } },
    { id: 'postgres', name: 'Postgres', description: 'Query a database',
      url: 'https://mcp.example.com/pg', headers: { Authorization: 'Bearer …' } },
  ],
});
```

Servers connect **lazily** when the matching `mcp_<id>` sub-context is
activated. Their tools surface as `<id>__<tool>` — e.g. `github__search_repos`.

## Approvals

MCP tools are read-only until approved. A disabled or unknown server raises a
`request_mcp_approval` / `mcp.approval_required` pause:

```ts
agent.on('request_mcp_approval', async (e) => {
  // e.data: { toolCallId, configs/info }
  await agent.resolveMcpDecision(e.data.toolCallId, {
    action: 'enable',           // 'enable' | 'leave' | 'deny'
    names: ['github', 'postgres'],
  });
});
```

`autoApprove: true` enables servers without pausing.

## Stock catalog

Curated server recipes ship with the library: `listStockCategories()`,
`findStockEntry(name)`, `stockToMcpConfig(entry)`. Examples include GitHub,
Postgres, Playwright, Sentry, database and browser entries. Recipes return a
ready `McpServerConfig` you can hand straight back to `options.mcp`.

## Runtime

`agent.addMcpServer(cfg)` / `agent.removeMcpServer(id)` /
`agent.listMcpServers()` manage servers between runs. `McpManager` exposes the
underlying lifecycle.

## The agent plugin

`plugin/` ships an MCP server that brings this library's build-agent and
deep-feature guide content into Claude Code, Codex, opencode, Antigravity, and
GitHub Copilot. Install with `bash plugin/install.sh`. Host layout and the
strict portable manifest are documented in
[`plugin/README.md`](../plugin/README.md). The offline fixture suite in
`scripts/fixtures/test-plugin-mcp.ts` validates the manifests end-to-end.