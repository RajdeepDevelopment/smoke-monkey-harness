#!/usr/bin/env bash
#
# Build the self-contained smoke-monkey-harness plugin package at
#   plugin/dist/smoke-monkey-harness/
# with native manifests for Claude Code (.claude-plugin/plugin.json +
# marketplace), Codex (.codex-plugin/plugin.json), and opencode (skill + MCP
# server assets; host config is written by install.sh).
#
#   plugin/build-dist.sh [--force]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(node -e 'console.log(require(`${process.argv[1]}/../package.json`).version)' "$ROOT" 2>/dev/null || echo 0.1.0)"
NAME="smoke-monkey-harness"
SKILL="build-agents-with-harness"
DIST="$ROOT/dist/$NAME"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

if [ -e "$DIST" ] && [ "$FORCE" -eq 0 ]; then
  echo "dist bundle exists at $DIST (rerun with --force to rebuild)"
  exit 0
fi

rm -rf "$DIST"
mkdir -p "$DIST/.claude-plugin" "$DIST/.codex-plugin" \
  "$DIST/skills/$SKILL/references" \
  "$DIST/mcp/features" "$DIST/mcp/templates/scaffold" "$DIST/mcp/templates/examples"

export VERSION
subst() {
  local file="$1"
  node -e 'const fs=require("fs");const f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,"utf8").replaceAll("VERSION",process.env.VERSION));' "$file"
}

# --- portable + host manifests ----------------------------------------------
cat > "$DIST/.claude-plugin/plugin.json" <<'EOF'
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json",
  "name": "smoke-monkey-harness",
  "displayName": "Smoke Monkey Harness",
  "version": "VERSION",
  "description": "Build a new looping AI agent on @smoke-monkey/harness. Guides any Claude Code session to scaffold, wire, verify, and ship an agent via this plugin's MCP server.",
  "author": { "name": "Rajdeep Development", "url": "https://github.com/RajdeepDevelopment" },
  "repository": "https://github.com/RajdeepDevelopment/smoke-monkey-harness",
  "license": "MIT",
  "keywords": ["agent", "harness", "loop", "mcp", "ai"],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json"
}
EOF

cat > "$DIST/.claude-plugin/marketplace.json" <<'EOF'
{
  "$schema": "https://json.schemastore.org/claude-code-marketplace-manifest.json",
  "name": "smoke-monkey-harness",
  "owner": { "name": "Rajdeep Development", "url": "https://github.com/RajdeepDevelopment" },
  "metadata": { "description": "Build looping AI agents on @smoke-monkey/harness", "version": "VERSION" },
  "plugins": [
    {
      "name": "smoke-monkey-harness",
      "version": "VERSION",
      "description": "Build a new looping AI agent on @smoke-monkey/harness (skill + MCP guide server).",
      "source": "./",
      "skills": "./skills/",
      "mcpServers": "./.mcp.json"
    }
  ]
}
EOF

cat > "$DIST/.codex-plugin/plugin.json" <<'EOF'
{
  "name": "smoke-monkey-harness",
  "version": "VERSION",
  "description": "Build a new looping AI agent on @smoke-monkey/harness (skill + MCP guide server).",
  "author": { "name": "Rajdeep Development", "url": "https://github.com/RajdeepDevelopment" },
  "repository": "https://github.com/RajdeepDevelopment/smoke-monkey-harness",
  "license": "MIT",
  "keywords": ["agent", "harness", "loop", "mcp", "ai"],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "Smoke Monkey Harness",
    "shortDescription": "Build looping AI agents on the harness library",
    "longDescription": "Guides Codex to scaffold, wire, verify and ship a new looping AI agent using @smoke-monkey/harness and its MCP server.",
    "developerName": "Rajdeep Development",
    "category": "Developer Tools",
    "capabilities": ["Interactive", "Write"],
    "defaultPrompt": [
      "Build me a new looping AI agent scaffold.",
      "Show me how to wire events UI to the harness.",
      "Explain how skills and MCP work in the harness."
    ]
  }
}
EOF

cat > "$DIST/plugin.json" <<'EOF'
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "smoke-monkey-harness",
  "version": "VERSION",
  "description": "Build a new looping AI agent on @smoke-monkey/harness (skill + MCP guide server).",
  "author": { "name": "Rajdeep Development", "url": "https://github.com/RajdeepDevelopment" },
  "repository": "https://github.com/RajdeepDevelopment/smoke-monkey-harness",
  "license": "MIT",
  "keywords": ["agent", "harness", "loop", "mcp", "ai"]
}
EOF

for f in "$DIST/.claude-plugin/plugin.json" "$DIST/.claude-plugin/marketplace.json" \
         "$DIST/.codex-plugin/plugin.json" "$DIST/plugin.json"; do
  subst "$f"
done

# --- skill (source of truth: plugin/skills/build-agents-with-harness) --------
cp -R "$ROOT/skills/$SKILL" "$DIST/skills/"
cp "$ROOT/skills/$SKILL/SKILL.md" "$DIST/SKILL.md"

# --- MCP server + its assets (server resolves these relative to its path) ----
cp "$ROOT/mcp/server.mjs" "$DIST/mcp/"
cp "$ROOT/mcp/guide.md" "$DIST/mcp/"
cp "$ROOT/mcp/reference.md" "$DIST/mcp/"
cp "$ROOT/mcp/features/"*.md "$DIST/mcp/features/"
cp -R "$ROOT/mcp/templates/scaffold/." "$DIST/mcp/templates/scaffold/"
cp -R "$ROOT/mcp/templates/examples/." "$DIST/mcp/templates/examples/"

# --- bundle README -----------------------------------------------------------
cat > "$DIST/README.md" <<'EOF'
# smoke-monkey-harness — build-an-agent plugin

Self-contained plugin package for **Claude Code**, **Codex**, and **opencode**.

- `SKILL.md` / `skills/build-agents-with-harness/SKILL.md` — the universal
  `SKILL.md` that teaches any agent how to build a looping agent on
  `@smoke-monkey/harness` (with `references/`).
- `mcp/server.mjs` — dependency-free stdio MCP server (18 tools) whose guide +
  templates live next to it (`guide.md`, `reference.md`, `features/`,
  `templates/`). Configure it via `.mcp.json` (Claude Code / Codex) or
  `opencode.json` (opencode) pointing `command` at this `mcp/server.mjs`.
- Manifests: `.claude-plugin/plugin.json` (+ `marketplace.json`),
  `.codex-plugin/plugin.json`, portable `plugin.json`.

Install with the repo's `plugin/install.sh`, or add it to a Claude marketplace
via `.claude-plugin/marketplace.json`.
EOF

echo "built $DIST"
echo "  skill     : $DIST/skills/$SKILL"
echo "  mcp server: $DIST/mcp/server.mjs"
echo "  manifests : .claude-plugin/plugin.json .claude-plugin/marketplace.json .codex-plugin/plugin.json plugin.json"