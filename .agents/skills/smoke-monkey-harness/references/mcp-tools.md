# Driving the smoke-monkey-harness MCP server (22 tools)

Call order for building an agent: `harness_status` → `harness_guide` →
`harness_plan({ goal })` → optional `harness_guide_<feature>_<detail>` deep dives
→ `harness_examples` / `harness_read_example` → `harness_scaffold` →
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

Every guide tool takes **no arguments** — the name states the job, so pick by
name rather than by guessing:

| guide | use it for |
| --- | --- |
| `harness_guide_subcontexts_activation_and_switching` | `context_manage`, the built-in catalog, custom sub-contexts |
| `harness_guide_skills_skill_md_discovery` | `SKILL.md` format, discovery, `list_skills` / `use_skill` |
| `harness_guide_mcp_servers_and_discovery` | server config, lazy activation, the approval flow, stock catalog |
| `harness_guide_providers_models_and_api_keys` | provider list, env keys, streaming, model selection |
| `harness_guide_tools_custom_tool_implementation` | `ToolDefinition` shape, built-in factories, the two group enums, writing your own, UI presentation |
| `harness_guide_loop_phases_guards_and_compaction` | loop phases, automatic guards, compaction, budgets |
| `harness_guide_permissions_the_three_pauses` | the three pauses and how to resolve each |
| `harness_guide_storage_sessions_runs_messages` | storage interface, sessions/runs/messages, resume |
| `harness_guide_events_streaming_and_ui_wiring` | event catalog + reference UI wiring |
| `harness_guide_ui_bridge_and_components` | the full bridge mapping and component choice |
| `harness_guide_errors_validation_and_pauses` | the two failure modes that break a hosted agent without an exception: a pause nobody answers, and a tool call the model got wrong |

`harness_guide_ui_bridge_and_components` is the one to reach for the moment the
product needs a chat surface at all: an in-app help chat, a support widget on a
marketing site, or a whole agent app built on the UI package.

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