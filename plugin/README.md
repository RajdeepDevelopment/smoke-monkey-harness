# smoke-monkey-harness plugin — for Claude Code, Codex, opencode, Antigravity, Copilot

Turn **any** agent into a "build a looping agent" machine. This repo ships a
plugin at `plugin/` that bundles:

- **A skill** (`skills/smoke-monkey-harness/SKILL.md`, universal `SKILL.md`
  format) that teaches the agent that `@smoke-monkey/harness` exists, when to
  use it, and the exact workflow for scaffolding a new agent on it.
- **An MCP server** (`mcp/server.mjs`, zero dependencies) that guides the
  agent hands-on: master instructions, feature deep-dives, a plan wizard, a
  verifier, and a real starter-project scaffold.

The plugin dir carries **native per-host manifests**, so each tool consumes it
the way it consumes any plugin:

```
plugin/                       # the plugin package (plugin root)
  plugin.json                 # agent-plugins.org 1.0.0 registry manifest
  .claude-plugin/plugin.json  # Claude Code manifest
  .codex-plugin/plugin.json   # Codex manifest
  .mcp.json                   # MCP wiring (uses ${CLAUDE_PLUGIN_ROOT})
  skills/smoke-monkey-harness/# the SKILL.md skill (references/ inside)
  mcp/                        # server.mjs + guide + features + templates
```

Repo root adds the distribution files:

```
AGENTS.md                                  # onboarding for ANY agent that reads AGENTS.md
.claude-plugin/marketplace.json            # Claude marketplace → installs ./plugin
.agents/plugins/marketplace.json           # Codex marketplace entry
.agents/plugins/smoke-monkey-harness/      # Antigravity workspace plugin
.agents/skills/                            # (name kept for any-host universal skills)
.github/skills/smoke-monkey-harness/       # GitHub Copilot project skill
.opencode/skills/smoke-monkey-harness/     # opencode auto-load when this repo is the workspace
```

| host | manifest used | install |
| --- | --- | --- |
| Claude Code | `.claude-plugin/plugin.json` | `claude plugin marketplace add <repo>` → `claude plugin install smoke-monkey-harness@smoke-monkey-harness`, or `plugin/install.sh` (skills-dir plugin) |
| Codex | `.codex-plugin/plugin.json` | `codex plugin install smoke-monkey-harness@personal`, or `plugin/install.sh` |
| opencode | `.opencode/skills/` + `opencode.json` mcp | `plugin/install.sh [--local]` |
| Antigravity | `.agents/plugins/smoke-monkey-harness/` (`plugin.json`, `mcp_config.json`, `skills/`) | open this repo, or `plugin/install.sh` (global: `~/.gemini/config/plugins/` + `~/.gemini/config/skills/`) |
| GitHub Copilot | `.github/skills/` (project) / `~/.copilot/skills/` (personal) | open this repo, or `plugin/install.sh` |
| portable registry | `plugin.json` | agent-plugins.org 1.0.0 metadata; functional config lives in the sibling per-host manifests |
| any agent at all | `SKILL.md` + `AGENTS.md` | point the agent at this repo |

## Install

### Claude Code

```sh
claude plugin marketplace add https://github.com/RajdeepDevelopment/smoke-monkey-harness
claude plugin install smoke-monkey-harness@smoke-monkey-harness
```

or install locally with the repo installer:

```sh
plugin/install.sh          # copies the plugin package into your home skills dirs
plugin/install.sh --local  # + project-local install, .mcp.json, opencode.json
plugin/install.sh --force  # overwrite existing installs
```

The Claude install becomes a **skills-directory plugin**
(`smoke-monkey-harness@skills-dir`) under `~/.claude/skills/`, discovered with
no marketplace and no install step. `opencode` also auto-loads `~/.claude/skills`,
so one install serves both.

### Codex

`plugin/install.sh` copies the skill into `~/.codex/skills/` and registers a
personal marketplace entry at `~/.agents/plugins/marketplace.json`. Then:

```sh
codex plugin install smoke-monkey-harness@personal
```

### opencode

`plugin/install.sh` copies the skill into `~/.config/opencode/skills/` (and
project `--local` installs write `.opencode/skills/`). MCP goes in
`opencode.json`:

```jsonc
{
  "mcp": {
    "smoke-monkey-harness": { "type": "local", "command": ["node", "/path/to/plugin/mcp/server.mjs"], "enabled": true }
  }
}
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
plugin/                          # plugin package (plugin root)
  plugin.json                    # portable manifest (any portable-agent host)
  .claude-plugin/plugin.json     # Claude Code manifest
  .codex-plugin/plugin.json      # Codex manifest
  .mcp.json                      # MCP server config (${CLAUDE_PLUGIN_ROOT})
  skills/smoke-monkey-harness/   # the SKILL.md skill (references/ inside)
    SKILL.md
    references/{api,features,mcp-tools}.md
  mcp/
    server.mjs                   # dependency-free stdio MCP server (18 tools)
    guide.md                     # master instructions (the mouth of the plugin)
    reference.md                 # authoritative API reference (harness_api)
    features/                    # deep per-feature guides (harness_guide_<feature>)
    templates/
      scaffold/                  # starter-project template (harness_scaffold)
      examples/                  # sample agents (harness_examples)
  install.sh                     # per-host installer (Claude / Codex / opencode)

AGENTS.md                              # any agent reads this to build with the harness
.claude-plugin/marketplace.json        # repo-root Claude marketplace (installs ./plugin)
.agents/plugins/marketplace.json     # repo-root Codex marketplace (personal installs mirror it)
.opencode/skills/smoke-monkey-harness/  # opencode project skill (this repo as a project)
```

The plugin is itself part of the `@smoke-monkey/harness` repo; the harness
library that agents build on is the same repo's `src/`.