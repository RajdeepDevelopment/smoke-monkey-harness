#!/usr/bin/env bash
#
# Install the smoke-monkey-harness plugin for EVERY agent that reads SKILL.md
# folders. The agent registry (plugin/agents.json) maps each agent/CLI to the
# project path and global/hidden path where that agent discovers skills — the
# same cross-agent table used by the AGENTS ecosystem (aider-desk, cursor,
# windsurf, cline, gemini-cli, goose, kopilot, opencode, and ~70 more).
#
# The plugin is the `plugin/` package — a self-contained directory with native
# manifests (`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`,
# `plugin.json`), a skill (`skills/smoke-monkey-harness/`), and an MCP server
# (`mcp/`). This script copies the skill (and, for the native hosts below, the
# whole package) into the skills directories that each tool natively reads:
#
#   universal  : .agents/skills/<name>/        project + ~/.agents/skills
#   Claude Code: ~/.claude/skills/<name>/      skills-dir plugin (+opencode)
#   Codex      : ~/.codex/skills/<name>/ + personal marketplace at ~/.agents/plugins
#   opencode   : ~/.config/opencode/skills/<name>/
#   Antigravity: ~/.gemini/config/skills/<name>/ + real plugin at ~/.gemini/config/plugins
#   Copilot    : ~/.copilot/skills/<name>/
#
#   --agent <id>   install only for one agent (any id in plugin/agents.json)
#   --local        additionally install into the current project and write the
#                  MCP wiring: project .mcp.json (Claude Code / Codex),
#                  .agents/mcp_config.json (Antigravity), and the opencode "mcp"
#                  block in project opencode.json.
#
# Usage:
#   plugin/install.sh                 # home install for all agents (~/.agents/skills + every home path)
#   plugin/install.sh --local         # + project install + .mcp.json + opencode.json
#   plugin/install.sh --agent cursor  # install only for one agent
#   plugin/install.sh --list          # print the supported-agent table
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
AGENT_SELECT=""
LIST=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --local) LOCAL=1 ;;
    --repo) REPO=1 ;;
    --list) LIST=1 ;;
    --agent|-a) AGENT_SELECT="${2:-}"; shift ;;
    --agent=*) AGENT_SELECT="${arg#*=}" ;;
    --help|-h)
      echo "Install the smoke-monkey-harness plugin (skill + MCP server) for ~70 agents."
      echo ""
      echo "  install.sh            install for all agents (home skills dirs)"
      echo "  install.sh --local    also install into the current project and write .mcp.json + .agents/mcp_config.json + opencode.json"
      echo "  install.sh --agent <id>  install only for one agent (see plugin/agents.json)"
      echo "  install.sh --list     print the supported-agent table"
      echo "  install.sh --force    overwrite any existing install at the same paths"
      echo "  install.sh --repo     print the Claude marketplace / Codex install commands for this repo"
      exit 0
      ;;
    --*) echo "unknown argument: $arg (see --help)" >&2; exit 2 ;;
    *) AGENT_SELECT="$arg" ;;
  esac
done

node --version >/dev/null 2>&1 || { echo "error: node is required to run the MCP server" >&2; exit 1; }
[ -d "$SKILL_SRC" ] || { echo "error: skill source missing at $SKILL_SRC" >&2; exit 1; }
[ -f "$SERVER_SRC" ] || { echo "error: MCP server missing at $SERVER_SRC" >&2; exit 1; }
[ -f "$ROOT/agents.json" ] || { echo "error: agent registry missing at $ROOT/agents.json" >&2; exit 1; }

# Emit the agent registry as `id<TAB>display<TAB>project<TAB>global<TAB>native`
agents_rows () {
  node -e '
    const path = process.argv[1];
    const reg = JSON.parse(require("fs").readFileSync(path, "utf8"));
    for (const a of reg.agents) {
      console.log([a.id, a.display, a.project ?? "", a.global ?? "", a.native ? "1" : ""].join("\t"));
    }
  ' "$ROOT/agents.json"
}

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

if [ "$LIST" -eq 1 ]; then
  echo "Supported agents (plugin/agents.json):"
  printf "  %-16s %-22s %-18s %s\n" "id" "display" "project" "global (~)"
  echo "  --------------------------------------------------------------------"
  agents_rows | while IFS=$'\t' read -r id display project global native; do
    [ -n "$id" ] || continue
    printf "  %-16s %-22s %-18s %s\n" "$id" "$display" "$project" "${global:-—}"
  done
  echo ""
  echo "Install a single agent: install.sh --agent <id>"
  exit 0
fi

CWD="$(pwd)"

# Resolve agents: a selection filters the registry; native ids get rich handlers.
SELECTED_AGENT="$AGENT_SELECT"
if [ -n "$SELECTED_AGENT" ]; then
  FOUND="$(agents_rows | awk -F '\t' -v want="$SELECTED_AGENT" '$1==want {print; found=1} END{exit !found}')" && true || true
  if [ -z "${FOUND:-}" ]; then
    echo "error: unknown agent '$SELECTED_AGENT' — see 'install.sh --list' or plugin/agents.json" >&2
    exit 2
  fi
fi

echo "Installing across the agent ecosystem…"
ALL_INSTALLED=0
while IFS=$'\t' read -r id display project global native; do
  [ -n "$id" ] || continue
  if [ -n "$SELECTED_AGENT" ] && [ "$id" != "$SELECTED_AGENT" ]; then
    continue
  fi
  ALL_INSTALLED=1

  # Global (home) install: write the skill where the agent reads it.
  if [ -n "$global" ]; then
    install_skill "$HOME/$global/$NAME"
  fi

  # Local (project) install for this agent.
  if [ "$LOCAL" -eq 1 ] && [ -n "$project" ]; then
    if [[ "$project" == /* ]]; then
      install_skill "$project/$NAME"
    else
      install_skill "$CWD/$project/$NAME"
    fi
  fi

  # Rich per-host wiring for the native agents.
  case "$id" in
    claude-code)
      install_pkg "$HOME/.claude/skills/$NAME"
      if [ "$LOCAL" -eq 1 ]; then
        install_pkg "$CWD/.claude/skills/$NAME"
        write_mcp_json "$CWD/.mcp.json" "$SERVER_SRC"
      fi
      ;;
    codex)
      install_skill "$HOME/.codex/skills/$NAME"
      write_codex_marketplace "$HOME/.agents/plugins/marketplace.json" "$PKG"
      if [ "$LOCAL" -eq 1 ]; then
        install_skill "$CWD/.codex/skills/$NAME"
        write_mcp_json "$CWD/.mcp.json" "$SERVER_SRC"
      fi
      ;;
    opencode)
      install_skill "$HOME/.config/opencode/skills/$NAME"
      if [ "$LOCAL" -eq 1 ]; then
        install_skill "$CWD/.opencode/skills/$NAME"
        write_opencode_json "$CWD/opencode.json" "$SERVER_SRC"
      fi
      ;;
    antigravity)
      install_skill "$HOME/.gemini/config/skills/$NAME"
      install_dir "$ANTIGRAVITY_SRC" "$HOME/.gemini/config/plugins/$NAME"
      write_mcp_json "$HOME/.gemini/config/plugins/$NAME/mcp_config.json" "$SERVER_SRC"
      if [ "$LOCAL" -eq 1 ]; then
        install_dir "$ANTIGRAVITY_SRC" "$CWD/.agents/plugins/$NAME"
        write_mcp_json "$CWD/.agents/mcp_config.json" "$SERVER_SRC"
      fi
      ;;
    github-copilot)
      install_skill "$HOME/.copilot/skills/$NAME"
      ;;
  esac
done < <(agents_rows)

if [ "$ALL_INSTALLED" -eq 0 ]; then
  echo "  (no agents matched)"
fi

echo ""
echo "Next steps:"
echo "  - Global skills are live for every agent that reads SKILL.md from ~/<agent-path>"
echo "    (~/.agents/skills covers ~20 agents; per-agent paths cover the rest)."
echo "  - Claude Code : skills-dir plugin at ~/.claude/skills (opencode auto-loads it too)."
echo "                  Marketplace install: run '$0 --repo' for the commands."
echo "  - Codex       : run 'codex plugin install smoke-monkey-harness@personal'"
echo "                  (registered at ~/.agents/plugins/marketplace.json)."
echo "  - opencode    : skill at ~/.config/opencode/skills — restart opencode. Add to"
echo "                  opencode.json (or run --local):"
echo "                  \"mcp\": { \"smoke-monkey-harness\": { \"type\": \"local\", \"command\": [\"$(command -v node)\", \"$SERVER_SRC\"], \"enabled\": true } }"
echo "  - Antigravity : skill → ~/.gemini/config/skills; plugin → ~/.gemini/config/plugins"
echo "                  (mcp_config.json written with an absolute server path)."
echo "  - Copilot     : skill → ~/.copilot/skills."
echo ""
echo "Done. In any agent, ask to build a new looping AI agent and the skill + MCP server will drive the scaffold."