#!/usr/bin/env bash
#
# Install the smoke-monkey-harness plugin for Claude Code / Codex / opencode.
#
# The plugin is a self-contained package (see build-dist.sh) with native
# manifests: .claude-plugin/plugin.json (+ marketplace.json), and
# .codex-plugin/plugin.json. This script places it where each tool natively
# discovers it:
#
#   Claude Code : ~/.claude/skills/<pkg>/            (skills-dir plugin; opencode
#                   also auto-loads ~/.claude/skills)
#   Codex       : ~/.codex/skills/<pkg>/             (skill folder)
#   opencode    : ~/.config/opencode/skills/<skill>/ (real global skills path)
#
#   --local     additionally installs into the current project and writes the
#               MCP wiring: project .mcp.json (Claude Code / Codex) and the
#               opencode "mcp" block in project opencode.json.
#
# Usage:
#   plugin/install.sh                 # home install (skill + MCP server assets)
#   plugin/install.sh --local         # + project install + .mcp.json + opencode.json
#   plugin/install.sh --force         # overwrite existing installs
#   plugin/install.sh --help
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="smoke-monkey-harness"
SKILL="build-agents-with-harness"
DIST="$ROOT/dist/$NAME"
SERVER="$DIST/mcp/server.mjs"
FORCE=0
LOCAL=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --local) LOCAL=1 ;;
    --help|-h)
      echo "Install the smoke-monkey-harness plugin (skill + MCP server) for Claude Code / Codex / opencode."
      echo ""
      echo "  install.sh            install the plugin package into your home skills dirs"
      echo "  install.sh --local    also install into the current project and write .mcp.json + opencode.json"
      echo "  install.sh --force    overwrite any existing install at the same paths"
      exit 0
      ;;
    *) echo "unknown argument: $arg (see --help)" >&2; exit 2 ;;
  esac
done

node --version >/dev/null 2>&1 || { echo "error: node is required to run the MCP server" >&2; exit 1; }

# --- build the self-contained bundle if needed --------------------------------
if [ ! -f "$SERVER" ]; then
  echo "building plugin dist bundle…"
  bash "$ROOT/build-dist.sh" --force
fi

install_dir () {
  local dst="$1"
  if [ -e "$dst" ] && [ "$FORCE" -eq 0 ]; then
    echo "  skip (exists — rerun with --force) : $dst"
    return 1
  fi
  rm -rf "$dst"
  mkdir -p "$(dirname "$dst")"
  cp -R "$DIST" "$dst"
  echo "  installed plugin → $dst"
}

install_skill_dir () {
  local dst="$1"
  if [ -e "$dst" ] && [ "$FORCE" -eq 0 ]; then
    echo "  skip (exists — rerun with --force) : $dst"
    return 1
  fi
  rm -rf "$dst"
  mkdir -p "$(dirname "$dst")"
  cp -R "$DIST/skills/$SKILL" "$dst"
  echo "  installed skill → $dst"
}

# write .mcp.json (Claude Code / Codex) pointing at $SERVER (absolute)
write_mcp_json () {
  local target="$1"
  SERVER="$SERVER" node -e '
    const fs = require("fs");
    const target = process.argv[1];
    const server = process.env.SERVER;
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(target, "utf8")); } catch {}
    cfg.mcpServers = cfg.mcpServers || {};
    cfg.mcpServers["smoke-monkey-harness"] = { command: process.execPath, args: [server] };
    fs.writeFileSync(target, JSON.stringify(cfg, null, 2) + "\n");
  ' "$target"
  echo "  wrote MCP config → $target"
}

# merge the opencode "mcp" block into an opencode.json (create if missing)
write_opencode_json () {
  local target="$1"
  SERVER="$SERVER" node -e '
    const fs = require("fs"), path = require("path");
    const target = process.argv[1];
    const server = process.env.SERVER;
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(target, "utf8")); } catch {}
    cfg.mcp = cfg.mcp || {};
    cfg.mcp["smoke-monkey-harness"] = { type: "local", command: [process.execPath, server], enabled: true };
    fs.writeFileSync(target, JSON.stringify(cfg, null, 2) + "\n");
  ' "$target"
  echo "  wrote opencode config → $target"
}

echo "smoke-monkey-harness plugin installer"
echo "  bundle     : $DIST"
echo "  skill id   : $SKILL"
echo "  mcp server : $SERVER"
echo ""

echo "Installing for Claude Code / Codex / opencode (home):"
install_dir "$HOME/.claude/skills/$NAME"
if [ -d "$HOME/.claude/skills/$NAME" ]; then
  write_mcp_json "$HOME/.claude/skills/$NAME/.mcp.json"
fi
install_dir "$HOME/.codex/skills/$NAME"
install_skill_dir "$HOME/.config/opencode/skills/$SKILL"

if [ "$LOCAL" -eq 1 ]; then
  CWD="$(pwd)"
  echo ""
  echo "Local mode — installing into the current project ($CWD):"
  install_dir "$CWD/.claude/skills/$NAME"
  install_dir "$CWD/.codex/skills/$NAME"
  install_skill_dir "$CWD/.opencode/skills/$SKILL"
  write_mcp_json "$CWD/.mcp.json"
  write_opencode_json "$CWD/opencode.json"
fi

echo ""
echo "Next steps:"
echo "  - Claude Code : skills are live (and opencode auto-loads ~/.claude/skills too)."
echo "                  For a package install: claude plugin install $DIST"
echo "  - Codex       : skills are live; project MCP server comes from .mcp.json (see --local)."
echo "  - opencode    : skills installed to ~/.config/opencode/skills (global) — restart opencode; MCP via the opencode.json block (see --local)."
echo ""
echo "Done. In any of the three agents, ask to build a new looping AI agent and the skill + MCP server will drive the scaffold."