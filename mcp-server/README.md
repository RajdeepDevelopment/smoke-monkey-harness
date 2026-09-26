# smoke-monkey-harness-mcp

`smoke-monkey-harness-mcp` — build, scaffold, verify, and run looping TypeScript
AI agents on [Smoke Monkey Harness](https://github.com/RajdeepDevelopment/smoke-monkey-harness)
from any MCP client.

![Build an agentic looping workflow in seconds](https://raw.githubusercontent.com/RajdeepDevelopment/smoke-monkey-harness/main/mcp-server/smoke-monkey-harness-mcp.gif)

MCP server for [Smoke Monkey Harness](https://github.com/RajdeepDevelopment/smoke-monkey-harness) — an embeddable,
framework-agnostic TypeScript agent runtime.

## Build an AI agentic workflow in seconds

Point **Claude Code**, **Codex**, **opencode**, **Cursor**, or any Model Context
Protocol client at this server and it turns the full smoke-monkey-harness
toolset into native MCP tools. Your agent can go from an idea to a **running,
looping agent** end-to-end:

1. **Plan** — `harness_plan` turns your product goal into a concrete build plan.
2. **Scaffold** — `harness_scaffold` writes the starter project on disk.
3. **Wire** — `harness_guide` / `harness_api` supply the exact API details for
   the looping flow (explore → plan → edit → verify → recover → complete).
4. **Verify** — `harness_verify` typechecks/builds the project and closes the loop.
5. **Apply skills** — browse and load the 25 bundled production-engineering
   skills category-wise, so the agent follows the right methodology as it ships.

The looping agent workflow (run loop, tool execution, permissions, context
management, MCP integration, sessions, recovery) is already built into the
library — this server just drives it from any MCP client.

## Run with npx

```sh
npx -y smoke-monkey-harness-mcp
```

Talk to it with any MCP client over stdio:

```json
{
  "mcpServers": {
    "smoke-monkey-harness": {
      "command": "npx",
      "args": ["-y", "smoke-monkey-harness-mcp"]
    }
  }
}
```

## Tools (20)

### Build the agent (harness workflow)

| Tool | Purpose |
| --- | --- |
| `harness_guide` | Master instructions for building a looping agent (read first) |
| `harness_plan` | Turn a product goal into a concrete build plan |
| `harness_scaffold` | Generate a starter agent project on disk |
| `harness_verify` | Typecheck/build an existing agent project |
| `harness_api` | Authoritative API reference (optionally sliced by area) |
| `harness_events` | Complete agent event catalog for UI wiring |
| `harness_status` | Installed library + server capabilities |
| `harness_examples` | List the bundled example agents |
| `harness_read_example` | Read one bundled example agent verbatim |

### Apply the bundled agent skills (category-wise)

| Tool | Purpose |
| --- | --- |
| `harness_skills_by_category` | Browse the 25 bundled agent-skills (`plugin/agent-skills/skills`) by category (agent-skills-backend/frontend/devops/qa) or raw domain |
| `harness_skill_content` | Load one bundled skill's full `SKILL.md` workflow |

### Deep dives (`harness_guide_<feature>`)

| Tool | Purpose |
| --- | --- |
| `harness_guide_subcontexts` | On-demand guidance blocks, context_manage, built-in catalog |
| `harness_guide_skills` | SKILL.md format, discovery, `list_skills`/`use_skill` loading |
| `harness_guide_mcp` | MCP server config, lazy activation, approval flow, stock catalog |
| `harness_guide_providers` | Provider list, env keys, streaming, model selection |
| `harness_guide_tools` | ToolDefinition shape, built-in factories, groups |
| `harness_guide_loop` | Loop phases, automatic guards, compaction, budgets |
| `harness_guide_permissions` | The three pauses and how to resolve each |
| `harness_guide_storage` | Storage interface, sessions/runs/messages, resume |
| `harness_guide_events` | Event catalog + reference UI wiring |

Every tool description carries `PURPOSE / WHEN TO CALL / RELATED` so agents
route correctly between the harness-library tools and the generic
development-skill tools. The category-wise skills are the same set the library
loads via `loadAgentSkills({ category })` / `buildAgentSkillRegistry({ category })`
and that `plugin/install.sh` drops under `<skills-dir>/agent-skills/<skill>/`.

No runtime dependencies of its own — the server itself ships inside the
`smoke-monkey-harness` package (which is published as a dependency).

## License

MIT — see the [Smoke Monkey Harness repository](https://github.com/RajdeepDevelopment/smoke-monkey-harness) for details.