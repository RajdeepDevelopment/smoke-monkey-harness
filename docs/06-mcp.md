# 06. Model Context Protocol (MCP) Integration

> ⭐️ **Love Smoke Monkey Harness?** Please support the project with a star on [GitHub](https://github.com/RajdeepDevelopment/smoke-monkey-harness)!
> 🌐 **Interactive Simulator:** Test the agent loop and stream live at [smoke-monkey-harness.vercel.app](https://smoke-monkey-harness.vercel.app/)

---


The Model Context Protocol (MCP) is an open standard that allows AI agents to securely connect to external data sources, tools, and environments.

Smoke Monkey provides a **dual MCP integration**:
1. **The Native MCP Client** inside `@smoke-monkey/harness` connects external tools (GitHub, databases, browsers) into your agent loop.
2. **The `@smoke-monkey/mcp` Server** exposes 22 development tools to external agents (Claude Code, Cursor, Codex, Windsurf) to scaffold and verify harness projects.

---

## 1. Using External MCP Tools in Your Agent

You can connect external MCP servers directly to your agent via `options.mcp`. Both **stdio** (local processes) and **streamable-HTTP** (SSE endpoints) transports are supported:

```ts
import { createAgent } from '@smoke-monkey/harness';

const agent = createAgent({
  workspacePath: process.cwd(),
  mcp: [
    // 1. Local process via stdio
    {
      id: 'github',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN },
    },
    // 2. Local database inspector
    {
      id: 'db',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://user:pass@localhost:5432/mydb'],
    },
    // 3. Remote cloud service via streamable-HTTP (SSE)
    {
      id: 'cloud-metrics',
      url: 'https://mcp.internal.company.com/sse',
      headers: { Authorization: `Bearer ${process.env.CLOUD_TOKEN}` },
    },
  ],
});
```

### Automatic Tool Namespacing
To avoid tool collisions, external MCP tools are automatically namespaced using the server ID:
- GitHub tool `create_issue` becomes: **`github__create_issue`**
- Postgres tool `query` becomes: **`db__query`**

### Lazy Server Startup
MCP servers are connected **lazily**. The harness does not launch background processes until the agent's phase machine or user explicitly requests a tool from that server, saving memory and startup latency.

---

## 2. Managing MCP Servers at Runtime

You can dynamically add or remove MCP servers after your agent has started:

```ts
// Dynamically register an external server
await agent.addMcpServer({
  id: 'slack',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-slack'],
  env: { SLACK_BOT_TOKEN: process.env.SLACK_TOKEN },
});

// List all registered servers and their status
const servers = agent.listMcpServers();
console.log('Active MCP servers:', servers);

// Remove a server
await agent.removeMcpServer('slack');
```

---

## 3. The `@smoke-monkey/mcp` Server

If you use external agent tools like **Claude Code**, **Codex**, **Cursor**, or **Windsurf**, you can give them native mastery over the Smoke Monkey Harness using `@smoke-monkey/mcp`.

### Run via npx
```bash
npx -y @smoke-monkey/mcp
```

### Configure in Your Client (`mcpServers` JSON)
Add this to your client's configuration file (e.g., `~/.claude/claude_desktop_config.json`, `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "smoke-monkey": {
      "command": "npx",
      "args": ["-y", "@smoke-monkey/mcp"]
    }
  }
}
```

---

## The 22 Development Tools in `@smoke-monkey/mcp`

The server provides 22 structured tools categorized into three primary areas:

### 1. Harness Workflow Tools
| Tool | Purpose |
| :--- | :--- |
| `harness_guide` | Master instructions and architecture guide for building a looping agent. |
| `harness_plan` | Converts a developer's high-level product goal into a concrete build plan. |
| `harness_scaffold` | Generates a complete, runnable agent starter project on disk. |
| `harness_verify` | Typechecks and builds an agent project to verify correctness. |
| `harness_api` | Authoritative API reference (options, events, tools, providers). |
| `harness_events` | Complete event catalog and UI wiring specifications. |
| `harness_status` | Returns library version, provider status, and capabilities. |
| `harness_examples` | Lists bundled example agents for reference. |
| `harness_read_example` | Reads an example agent file verbatim. |

### 2. Category-Wise Skill Tools
| Tool | Purpose |
| :--- | :--- |
| `harness_skills_by_category` | Browses 25 bundled engineering skills across backend, frontend, devops, and QA. |
| `harness_skill_content` | Loads the complete `SKILL.md` instruction manual for a specific skill. |

### 3. Feature Deep-Dive Guides
Specialized guidance tools that require zero parameters:
- `harness_guide_loop_phases_guards_and_compaction`
- `harness_guide_permissions_the_three_pauses`
- `harness_guide_tools_custom_tool_implementation`
- `harness_guide_subcontexts_activation_and_switching`
- `harness_guide_skills_skill_md_discovery`
- `harness_guide_mcp_servers_and_discovery`
- `harness_guide_providers_models_and_api_keys`
- `harness_guide_storage_sessions_runs_messages`
- `harness_guide_events_streaming_and_ui_wiring`
- `harness_guide_ui_bridge_and_components`
- `harness_guide_errors_validation_and_pauses`

---

## Next Steps

- Inject domain-specific engineering playbooks with skills: [07. Just-in-Time Skills](07-skills.md)
- Dynamically alter system prompts: [08. Sub-Contexts](08-subcontexts.md)
- Render MCP tool cards in the chat UI: [10. React UI Components](10-ui-components.md)
