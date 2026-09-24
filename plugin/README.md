# smoke-monkey-harness plugin — for Claude Code, Codex, opencode

Turn **any** agent into a "build a looping agent" machine. This plugin bundles:

- **A skill** (`skills/build-agents-with-harness/`) in the universal `SKILL.md`
  format that Claude Code, Codex, and opencode all read. Installed it teaches
  the agent that `@smoke-monkey/harness` exists, when to use it, and the exact
  workflow for scaffolding a new agent on it.
- **An MCP server** (`mcp/server.mjs`, zero dependencies) that guides the
  agent hands-on: it serves the master instructions, feature deep-dives, a
  plan wizard, a verifier, and can scaffold a real starter project on disk.

The package is built with **native per-host manifests**:

| host | manifest | how it's discovered |
| --- | --- | --- |
| Claude Code | `.claude-plugin/plugin.json` (+ `.claude-plugin/marketplace.json`) | installed under `~/.claude/skills/` as a skills-dir plugin; or add the repo as a marketplace |
| Codex | `.codex-plugin/plugin.json` | installed under `~/.codex/skills/` as a skill folder; project wiring via `.mcp.json` |
| opencode | skill folder + `opencode.json` "mcp" block | `~/.config/opencode/skills/` (global) or `.opencode/skills/` (project); opencode also auto-loads `~/.claude/skills` |
| portable | `plugin.json` (agent-plugins.org) | generic distribution |

## Build + install

```sh
plugin/build-dist.sh          # assemble the self-contained bundle → plugin/dist/smoke-monkey-harness/
plugin/install.sh             # install into home skills dirs for Claude Code / Codex / opencode
plugin/install.sh --local     # + project-local install, .mcp.json, and opencode.json mcp block
plugin/install.sh --force     # overwrite existing installs
```

The bundle includes the MCP server **and** everything it reads (`guide.md`,
`reference.md`, `features/`, `templates/`), so each install is self-contained.
MCP wiring points `command` at the installed `mcp/server.mjs`:

```jsonc
// Claude Code / Codex: .mcp.json
{ "mcpServers": { "smoke-monkey-harness": { "command": "<node>", "args": ["<bundle>/mcp/server.mjs"] } } }
// opencode: opencode.json
{ "mcp": { "smoke-monkey-harness": { "type": "local", "command": ["<node>", "<bundle>/mcp/server.mjs"], "enabled": true } } }
```

## What the agent can now do

| request | what happens |
| --- | --- |
| "Build me an agent that reads my repo and writes docs" | skill loads → `harness_guide` → `harness_scaffold({ targetDir })` writes a project → agent wires + verifies it |
| "What can @smoke-monkey/harness do?" | `harness_status` + `harness_guide` answer from the live bundle |
| "How do permissions/subcontexts/skills work?" | `harness_plan` → `harness_guide_<feature>` deep dives |
| "Show me an example agent" | `harness_examples` + `harness_read_example` |

## MCP server tools

| tool | args | returns |
| --- | --- | --- |
| `harness_guide` | `topic?` | the master "build an agent" end-to-end playbook |
| `harness_plan` | `goal` | a concrete build plan for your product (provider/model, agentId, tools, wiring, verify, ship) |
| `harness_api` | `area?` | authoritative API reference: options, surface, events, tools, providers, subcontexts, skills, mcp, loop, permissions |
| `harness_guide_subcontexts` | — | deep dive: context_manage, built-in catalog, custom contexts |
| `harness_guide_skills` | — | deep dive: SKILL.md format + just-in-time list_skills/use_skill |
| `harness_guide_mcp` | — | deep dive: server config, activation, approvals, stock catalog |
| `harness_guide_providers` | — | deep dive: providers, keys, models, streaming |
| `harness_guide_tools` | — | deep dive: custom ToolDefinition, groups, annotations |
| `harness_guide_loop` | — | deep dive: phases, guards, compaction, budgets |
| `harness_guide_permissions` | — | deep dive: the three pauses + how to resolve them |
| `harness_guide_storage` | — | deep dive: Storage interface, sessions, resume |
| `harness_guide_events` | — | deep dive: event catalog + UI wiring |
| `harness_events` | — | event catalog (wire a UI/log layer) |
| `harness_status` | — | installed library version + server capabilities |
| `harness_scaffold` | `targetDir`, `name?` | a complete starter project (package.json, tsconfig, src/index.ts, sample skill, README, .mcp.json) |
| `harness_verify` | `targetDir`, `build?` | runs `npm run typecheck` (+build) and reports PASS/FAIL |
| `harness_examples` | — | bundled example programs |
| `harness_read_example` | `name` | one example verbatim |

Run the server directly to smoke-test it:

```sh
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' \
  | node plugin/mcp/server.mjs
```

## Layout

```
plugin/
  build-dist.sh                   # assembles the self-contained dist bundle
  install.sh                      # per-host installer (Claude / Codex / opencode)
  skills/build-agents-with-harness/   # the SKILL.md skill (references/ inside)
    SKILL.md
    references/{api,features,mcp-tools}.md
  mcp/
    server.mjs                    # dependency-free stdio MCP server (18 tools)
    guide.md                      # master instructions (the mouth of the plugin)
    reference.md                  # authoritative API reference (harness_api)
    features/                     # deep per-feature guides (harness_guide_<feature>)
    templates/
      scaffold/                   # starter-project template (harness_scaffold)
      examples/                   # sample agents (harness_examples)
  dist/smoke-monkey-harness/      # GENERATED self-contained plugin package
    .claude-plugin/plugin.json    #   Claude Code manifest (+ marketplace.json)
    .codex-plugin/plugin.json     #   Codex manifest
    plugin.json                   #   portable agent-plugins manifest
    SKILL.md, skills/, mcp/, .mcp.json
```

The plugin is itself part of the `@smoke-monkey/harness` repo; the harness
library that agents build on is the same repo's `src/`.