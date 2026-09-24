#!/usr/bin/env bash
#
# Install the smoke-monkey-harness plugin for Claude Code / Codex / opencode:
#   1. Copies the SKILL.md skill into each home skills folder (the format all
#      three read), so any of them learns to build agents on the library.
#   2. With --local, also copies into the current project's .claude/.codex/
#      .opencode/skills and writes a project .mcp.json exposing the harness MCP
#      server (read by Claude Code and Codex).
#
# Usage:
#   plugin/install.sh                 # home skill install only
#   plugin/install.sh --local         # + project skills + .mcp.json
#   plugin/install.sh --force         # overwrite existing installs
#   plugin/install.sh --help
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ROOT/skills/smoke-monkey-harness"
SERVER="$ROOT/mcp/server.mjs"
FORCE=0
LOCAL=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --local) LOCAL=1 ;;
    --help|-h)
      echo "Install the smoke-monkey-harness plugin (skill + MCP server) for Claude Code / Codex / opencode."
      echo ""
      echo "  install.sh            install the SKILL.md into ~/.claude ~/.codex ~/.opencode skills"
      echo "  install.sh --local    also install into the current project and write .mcp.json"
      echo "  install.sh --force    overwrite any existing install at the same paths"
      exit 0
      ;;
    *) echo "unknown argument: $arg (see --help)" >&2; exit 2 ;;
  esac
done

node --version >/dev/null 2>&1 || { echo "error: node is required to run the MCP server" >&2; exit 1; }
[ -d "$SRC" ] || { echo "error: skill source missing at $SRC" >&2; exit 1; }
[ -f "$SERVER" ] || { echo "error: MCP server missing at $SERVER" >&2; exit 1; }

install_skill () {
  local dst="$1"
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ] && [ "$FORCE" -eq 0 ]; then
    echo "  skip (exists — rerun with --force) : $dst"
    return
  fi
  rm -rf "$dst"
  cp -R "$SRC" "$dst"
  echo "  installed skill → $dst"
}

write_mcp_json () {
  local target="$1"
  SERVER="$SERVER" node -e '
    const fs = require("fs");
    const target = process.env.TARGET || process.argv[1];
    const server = process.env.SERVER;
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(target, "utf8")); } catch {}
    cfg.mcpServers = cfg.mcpServers || {};
    cfg.mcpServers["smoke-monkey-harness"] = { command: process.execPath, args: [server] };
    fs.writeFileSync(target, JSON.stringify(cfg, null, 2) + "\n");
  ' "$target"
  echo "  wrote MCP config → $target"
}

echo "smoke-monkey-harness plugin installer"
echo "  skill source : $SRC"
echo "  mcp server   : $SERVER"
echo ""

echo "Installing the skill for Claude Code / Codex / opencode (home):"
install_skill "$HOME/.claude/skills/smoke-monkey-harness"
install_skill "$HOME/.codex/skills/smoke-monkey-harness"
install_skill "$HOME/.opencode/skills/smoke-monkey-harness"

if [ "$LOCAL" -eq 1 ]; then
  CWD="$(pwd)"
  echo ""
  echo "Local mode — installing into the current project ($CWD):"
  install_skill "$CWD/.claude/skills/smoke-monkey-harness"
  install_skill "$CWD/.codex/skills/smoke-monkey-harness"
  install_skill "$CWD/.opencode/skills/smoke-monkey-harness"
  write_mcp_json "$CWD/.mcp.json"
fi

echo ""
echo "Next steps:"
echo "  - Claude Code  / Codex : skills are live; for the MCP server, run '$(basename "${BASH_SOURCE[0]}") --local' inside the project (writes .mcp.json) or add the server to your project config manually:"
echo "      server: smoke-monkey-harness  command: $(node --version >/dev/null 2>&1 && echo \"node $SERVER\")"
echo "  - opencode : add to opencode.json:"
printf '      "mcp": { "smoke-monkey-harness": { "type": "local", "command": ["node", "%s"], "enabled": true } }\n' "$SERVER"
echo ""
echo "Done. In any of the three agents, describe building a new agent and the smoke-monkey-harness skill + MCP server will drive the scaffold."