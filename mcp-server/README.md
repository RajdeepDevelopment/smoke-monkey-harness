# smoke-monkey-harness-mcp

MCP server for [Smoke Monkey Harness](https://github.com/RajdeepDevelopment/smoke-monkey-harness) — an embeddable,
framework-agnostic TypeScript agent runtime.

Connect **Claude Code**, **Codex**, **opencode**, or any Model Context Protocol
client to the harness so the agent can build, scaffold, verify, and run looping
AI agents **on this library** through MCP.

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

## Tools

| Tool | Purpose |
| --- | --- |
| `harness_guide` | Master instructions for building a looping agent |
| `harness_plan` | Turn a product goal into a concrete build plan |
| `harness_api` | Authoritative API reference (optionally sliced by area) |
| `harness_events` | Complete agent event catalog for UI wiring |
| `harness_status` | Installed library + server capabilities |
| `harness_scaffold` | Generate a starter agent project on disk |
| `harness_verify` | Typecheck/build an existing agent project |
| `harness_examples` / `harness_read_example` | Bundled example agents |
| `harness_guide_<feature>` | Deep dives: subcontexts, skills, mcp, providers, tools, loop, permissions, storage, events |

No runtime dependencies of its own — the server itself ships inside the
`smoke-monkey-harness` package (which is published as a dependency).

## License

MIT — see the [Smoke Monkey Harness repository](https://github.com/RajdeepDevelopment/smoke-monkey-harness) for details.