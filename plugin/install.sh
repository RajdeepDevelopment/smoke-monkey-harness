#!/usr/bin/env bash
#
# Install the smoke-monkey-harness plugin for Claude Code / Codex / opencode /
# Antigravity / GitHub Copilot (and every agent that reads ~/.agents/skills).
#
# The plugin is the `plugin/` package — a self-contained directory with native
# manifests (`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`,
# `plugin.json`), a skill (`skills/smoke-monkey-harness/`), and an MCP server
# (`mcp/`) whose `.mcp.json` references paths via ${CLAUDE_PLUGIN_ROOT}. This
# script places that package where each tool natively discovers it:
#
#   Claude Code : ~/.claude/skills/<name>/            as a skills-dir plugin
#                   (`smoke-monkey-harness@skills-dir`); opencode also
#                   auto-loads ~/.claude/skills
#   Codex       : ~/.codex/skills/<name>/             as a skill, plus a
#                   personal marketplace entry at ~/.agents/plugins/ so
#                   `codex plugin install` finds it
#   opencode    : ~/.config/opencode/skills/<name>/   global skills path
#   Antigravity : ~/.gemini/config/skills/<name>/     global skill, plus a
#                   real plugin at ~/.gemini/config/plugins/<name>/ with an
#                   absolute-path mcp_config.json
#   Copilot     : ~/.copilot/skills/<name>/           project/personal skill
#   any agent   : ~/.agents/skills/<name>/            universal skills dir
#
#   --local     additionally installs into the current project and writes the
#               MCP wiring: project .mcp.json (Claude Code / Codex),
#               .agents/mcp_config.json (Antigravity), and the opencode "mcp"
#               block in project opencode.json.
#
# Usage:
#   plugin/install.sh                 # home install
#   plugin/install.sh --local         # + project install + .mcp.json + opencode.json
#   plugin/install.sh --force         # overwrite existing installs
#   plugin/install.sh --help
#   plugin/install.sh --repo          # print the Claude marketplace add commands
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UP="$(cd "$ROOT/.." && pwd)"
NAME="smoke-monkey-harness"
PKG="$ROOT"
SKILL_SRC="$ROOT/skills/$NAME"
SERVER_SRC="$ROOT/mcp/server.mjs"
ANTIGRAVITY_SRC="$UP/.agents/plugins/$NAME"
FORCE=0
LOCAL=0
REPO=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --local) LOCAL=1 ;;
    --repo) REPO=1 ;;
    --help|-h)
      echo "Install the smoke-monkey-harness plugin (skill + MCP server) for Claude Code / Codex / opencode / Antigravity / Copilot."
      echo ""
      echo "  install.sh            install the plugin package into your home skills dirs"
      echo "  install.sh --local    also install into the current project and write .mcp.json + .agents/mcp_config.json + opencode.json"
      echo "  install.sh --force    overwrite any existing install at the same paths"
      echo "  install.sh --repo     print the Claude marketplace / Codex install commands for this repo"
      exit 0
      ;;
    *) echo "unknown argument: $arg (see --help)" >&2; exit 2 ;;
  esac
done

node --version >/dev/null 2>&1 || { echo "error: node is required to run the MCP server" >&2; exit 1; }
[ -d "$SKILL_SRC" ] || { echo "error: skill source missing at $SKILL_SRC" >&2; exit 1; }
[ -f "$SERVER_SRC" ] || { echo "error: MCP server missing at $SERVER_SRC" >&2; exit 1; }

install_pkg () {  # copy the whole plugin package (manifests + skill + mcp)
  local dst="$1"
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ] && [ "$FORCE" -eq 0 ]; then
    echo "  skip (exists — rerun with --force) : $dst"
    return 0
  fi
  rm -rf "$dst"
  cp -R "$PKG" "$dst"
  echo "  installed plugin → $dst"
}

install_dir () {  # copy an arbitrary directory as-is
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ] && [ "$FORCE" -eq 0 ]; then
    echo "  skip (exists — rerun with --force) : $dst"
    return 0
  fi
  rm -rf "$dst"
  cp -R "$src" "$dst"
  echo "  installed dir → $dst"
}

install_skill () {  # copy just the skill folder (SKILL.md at target root)
  local dst="$1"
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ] && [ "$FORCE" -eq 0 ]; then
    echo "  skip (exists — rerun with --force) : $dst"
    return 0
  fi
  rm -rf "$dst"
  cp -R "$SKILL_SRC" "$dst"
  echo "  installed skill → $dst"
}

# write .mcp.json (Claude Code / Codex) pointing at an absolute server path
write_mcp_json () {
  local target="$1" server="$2"
  SERVER="$server" node -e '
    const fs = require("fs");
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch {}
    cfg.mcpServers = cfg.mcpServers || {};
    cfg.mcpServers["smoke-monkey-harness"] = { command: process.execPath, args: [process.env.SERVER] };
    fs.writeFileSync(process.argv[1], JSON.stringify(cfg, null, 2) + "\n");
  ' "$target"
  echo "  wrote MCP config → $target"
}

# merge the opencode "mcp" block into an opencode.json (create if missing)
write_opencode_json () {
  local target="$1" server="$2"
  SERVER="$server" node -e '
    const fs = require("fs");
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch {}
    cfg.mcp = cfg.mcp || {};
    cfg.mcp["smoke-monkey-harness"] = { type: "local", command: [process.execPath, process.env.SERVER], enabled: true };
    fs.writeFileSync(process.argv[1], JSON.stringify(cfg, null, 2) + "\n");
  ' "$target"
  echo "  wrote opencode config → $target"
}

# add a personal Codex marketplace entry so `codex plugin install` can find it
write_codex_marketplace () {
  local target="$1" repo_abs="$2"
  PKG_ABS="$repo_abs" node -e '
    const fs = require("fs");
    const target = process.argv[1];
    const pkg = process.env.PKG_ABS;
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(target, "utf8")); } catch {}
    cfg.name = cfg.name || "personal";
    cfg.interface = cfg.interface || { displayName: "Personal plugins" };
    cfg.plugins = cfg.plugins || [];
    if (!cfg.plugins.some((p) => p.name === "smoke-monkey-harness")) {
      cfg.plugins.push({
        name: "smoke-monkey-harness",
        source: { source: "local", path: pkg },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Developer Tools"
      });
    }
    fs.mkdirSync(require("path").dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(cfg, null, 2) + "\n");
  ' "$target"
  echo "  wrote codex marketplace → $target"
}

echo "smoke-monkey-harness plugin installer"
echo "  plugin package : $PKG"
echo "  skill          : $SKILL_SRC"
echo "  mcp server     : $SERVER_SRC"
echo ""

if [ "$REPO" -eq 1 ]; then
  echo "Claude Code — install from this repo (marketplace = smoke-monkey-harness):"
  echo "  claude plugin marketplace add https://github.com/RajdeepDevelopment/smoke-monkey-harness"
  echo "  claude plugin install smoke-monkey-harness@smoke-monkey-harness"
  echo ""
  echo "Codex — after this install, a personal marketplace entry is written to ~/.agents/plugins/."
  exit 0
fi

echo "Installing for Claude Code / Codex / opencode / Antigravity / Copilot (home):"
install_pkg "$HOME/.claude/skills/$NAME"
install_skill "$HOME/.codex/skills/$NAME"
install_skill "$HOME/.config/opencode/skills/$NAME"
install_skill "$HOME/.agents/skills/$NAME"
install_skill "$HOME/.copilot/skills/$NAME"
install_skill "$HOME/.gemini/config/skills/$NAME"
install_dir "$ANTIGRAVITY_SRC" "$HOME/.gemini/config/plugins/$NAME"
write_mcp_json "$HOME/.gemini/config/plugins/$NAME/mcp_config.json" "$SERVER_SRC"
write_codex_marketplace "$HOME/.agents/plugins/marketplace.json" "$PKG"

if [ "$LOCAL" -eq 1 ]; then
  CWD="$(pwd)"
  echo ""
  echo "Local mode — installing into the current project ($CWD):"
  install_pkg "$CWD/.claude/skills/$NAME"
  install_skill "$CWD/.codex/skills/$NAME"
  install_skill "$CWD/.opencode/skills/$NAME"
  install_dir "$ANTIGRAVITY_SRC" "$CWD/.agents/plugins/$NAME"
  write_mcp_json "$CWD/.mcp.json" "$SERVER_SRC"
  write_mcp_json "$CWD/.agents/mcp_config.json" "$SERVER_SRC"
  write_opencode_json "$CWD/opencode.json" "$SERVER_SRC"
fi

echo ""
echo "Next steps:"
echo "  - Claude Code : skills are live (skills-dir plugin, opencode auto-loads it too)."
echo "                  Marketplace install: run '$0 --repo' for the commands."
echo "  - Codex       : skill is live in ~/.codex/skills; run 'codex plugin install smoke-monkey-harness@personal'"
echo "                  (registered at ~/.agents/plugins/marketplace.json) for the full plugin + MCP."
echo "  - opencode    : skill installed to ~/.config/opencode/skills — restart opencode."
echo "                  Add to opencode.json (or run --local in this project):"
echo "                  \"mcp\": { \"smoke-monkey-harness\": { \"type\": \"local\", \"command\": [\"$(command -v node)\", \"$SERVER_SRC\"], \"enabled\": true } }"
echo "  - Antigravity : skill → ~/.gemini/config/skills; full plugin → ~/.gemini/config/plugins"
echo "                  (mcp_config.json written with an absolute server path)."
echo "  - Copilot     : skill → ~/.copilot/skills (project skill lives in .github/skills when open in this repo)."
echo ""
echo "Done. In any agent, ask to build a new looping AI agent and the skill + MCP server will drive the scaffold."