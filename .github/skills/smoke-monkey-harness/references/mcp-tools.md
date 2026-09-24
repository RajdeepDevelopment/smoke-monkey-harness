# Driving the smoke-monkey-harness MCP server (18 tools)

Call order for building an agent: `harness_status` → `harness_guide` →
`harness_plan({ goal })` → optional `harness_guide_<feature>` deep dives →
`harness_examples` / `harness_read_example` → `harness_scaffold` →
`harness_verify`. All args are JSON; all responses are text.

## Planning & learning

| tool | args | when |
| --- | --- | --- |
| `harness_status` | — | confirm the plugin + library facts |
| `harness_guide` | `topic?` | the master end-to-end playbook |
| `harness_plan` | `goal` *(required)* | a concrete build plan for the product |
| `harness_api` | `area?` | authoritative API reference slice: `options` `surface` `events` `tools` `providers` `subcontexts` `skills` `mcp` `loop` `permissions` (default: full) |
| `harness_events` | — | the event catalog (UI wiring) |

## Deep-feature guides (for real understanding)

`harness_guide_subcontexts` · `harness_guide_skills` · `harness_guide_mcp` ·
`harness_guide_providers` · `harness_guide_tools` · `harness_guide_loop` ·
`harness_guide_permissions` · `harness_guide_storage` · `harness_guide_events` —
no args; pick the one matching the part of the product you are unsure about.

## Building & verifying

| tool | args | when |
| --- | --- | --- |
| `harness_examples` | — | list bundled example agents |
| `harness_read_example` | `name` *(required, e.g. `basic-agent.ts`)* | read one example verbatim |
| `harness_scaffold` | `targetDir` *(required)*, `name?` | materialise a starter project |
| `harness_verify` | `targetDir` *(required)*, `build?` | run `npm run typecheck` (+build) → PASS/FAIL |

## Wiring the server into each host

- **Claude Code / Codex** — a project `.mcp.json`:
  `{ "mcpServers": { "smoke-monkey-harness": { "command": "<node>", "args": ["<abs>/plugin/mcp/server.mjs"] } } }`
  (the installer writes this with `plugin/install.sh --local`).
- **opencode** — `opencode.json`:
  `{ "mcp": { "smoke-monkey-harness": { "type": "local", "command": ["node", "<abs>/plugin/mcp/server.mjs"], "enabled": true } } }`

Use `command: process.execPath` — there is no `node` on the PATH guarantee in
some hosted shells.