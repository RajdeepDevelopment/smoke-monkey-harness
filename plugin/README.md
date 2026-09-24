# smoke-monkey-harness plugin — for Claude Code, Codex, opencode (and more)

Turn **any** agent into a "build a looping agent" machine. This plugin bundles:

- **A skill** (`skills/smoke-monkey-harness/`) in the universal `SKILL.md`
  format that Claude Code, Codex, AniGravity, and opencode all read. Once
  installed, the agent knows that `@smoke-monkey/harness` exists, when to use
  it, and the exact workflow for scaffolding a new agent on it.
- **An MCP server** (`mcp/server.mjs`, zero dependencies) that guides the
  agent hands-on: it serves the master instructions and can scaffold a real
  starter project on disk.

## Install

```sh
plugin/install.sh          # copies the skill into ~/.claude, ~/.codex, ~/.opencode skills
plugin/install.sh --local  # + project-local skills and a .mcp.json for the MCP server
```

The skill is picked up on the next session in Claude Code, Codex, and opencode —
no agent-specific code. The MCP server is registered via a project `.mcp.json`
(Claude Code, Codex). For opencode, add the snippet printed by the installer to
`opencode.json`:

```jsonc
// opencode.json
{
  "mcp": {
    "smoke-monkey-harness": {
      "type": "local",
      "command": ["node", "/absolute/path/to/smoke-monkey-harness/plugin/mcp/server.mjs"],
      "enabled": true
    }
  }
}
```

## What the agent can now do

| request | what happens |
| --- | --- |
| "Build me an agent that reads my repo and writes docs" | skill loads → `harness_guide` → `harness_scaffold({ targetDir })` writes a project → agent wires + verifies it |
| "What can @smoke-monkey/harness do?" | `harness_status` + `harness_guide` answer from the live bundle |
| "Show me an example agent" | `harness_examples` + `harness_read_example` |

## MCP server tools

| tool | args | returns |
| --- | --- | --- |
| `harness_guide` | `topic?` | the master "build an agent" instructions |
| `harness_status` | — | installed library version + server capabilities |
| `harness_scaffold` | `targetDir`, `name?` | a complete starter project (package.json, tsconfig, src/index.ts, sample skill, README, .mcp.json) |
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
  install.sh                     # skill + MCP installer
  skills/smoke-monkey-harness/   # the SKILL.md plugin (references/api.md inside)
    SKILL.md
    references/api.md
  mcp/
    server.mjs                   # dependency-free stdio MCP server
    guide.md                     # master instructions (the mouth of the plugin)
    templates/
      scaffold/                  # starter-project template (harness_scaffold)
      examples/                  # sample agents (harness_examples)
```

The plugin is itself part of the `@smoke-monkey/harness` repo; the harness
library that agents build on is the same repo's `src/`.