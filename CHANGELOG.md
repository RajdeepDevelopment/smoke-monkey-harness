# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-09-26

Published to npm as `smoke-monkey-harness@1.1.0`.

### Added

- Bundled **Agent Skills** MCP servers in `plugin/agent-skills/` (25 engineering
  skills from the `agent-skills` skill bundle, served over MCP by a
  dependency-free stdio server), shipped in the package tarball.
- Four stock catalog entries under a new **Agent Skills** stock category —
  `agent-skills-backend`, `agent-skills-frontend`, `agent-skills-devops`,
  `agent-skills-qa` — each a `node <bundled server> --domain=…` config. Pick one
  from stock or add your own MCP; both flow through `stockToMcpConfig`.
- `stockToMcpConfig` now resolves bundled stock entries to an absolute, spawnable
  server path (works in both the ESM and CommonJS builds; validates the server is
  installed if resolution fails).
- Package exports subpath `./plugin/agent-skills/mcp/server.mjs`.
- **Universal agent installer**: `plugin/install.sh` (and `pnpm run
  plugin:install`) now installs the plugin skill for ~70 agents. It reads
  `plugin/agents.json` — the cross-agent SKILL.md path table — and writes the
  skill to every agent's global skills directory (plus project dirs with
  `--local`). New flags: `--list` to print the supported-agent table and
  `--agent <id>` to install for one agent by id.
- `defaultSkillDirs` now also discovers skills from the universal agent paths
  (`~/.agents/skills`, cursor, windsurf, gemini, goose, etc.), so skills
  installed by `plugin/install.sh` are found no matter which agent owns them.

### Changed

- Scaffold dependency bumped to `smoke-monkey-harness@^1.1.0`.

## [1.0.9] — 2026-09-24

Published to npm as `smoke-monkey-harness@1.0.9`.

### Changed

- README: moved the "Use it over MCP (connect this repository)" section above
  "Why Smoke Monkey?" so the `npx -y smoke-monkey-harness-mcp` snippet is easy
  to find; the MCP configuration section now links to it.
- Scaffold dependency bumped to `smoke-monkey-harness@^1.0.9`.

## [1.0.8] — 2026-09-24

Published to npm as `smoke-monkey-harness@1.0.8`.

### Changed

- README hero: replaced shields.io image badges (which rendered as raw
  label text on npm) with a single plain-text strip — npm, 0 dependencies,
  MIT, CI, TypeScript.
- Scaffold dependency bumped to `smoke-monkey-harness@^1.0.8`.

## [1.0.7] — 2026-09-24

Published to npm as `smoke-monkey-harness@1.0.7`.

### Added

- New companion package **`smoke-monkey-harness-mcp`**: a stdio MCP server you
  can run with `npx -y smoke-monkey-harness-mcp`, exposing the harness toolset
  (`harness_guide`, `harness_plan`, `harness_api`, `harness_scaffold`,
  `harness_verify`, ...) to any MCP client.
- `package.json` now exports `./plugin/mcp/server.mjs` so the MCP server is
  reachable through the package boundary.
- README: new "Connect this repository over MCP" section (`.mcp.json` + harness
  `mcp:` examples).
- Scaffold dependency bumped to `smoke-monkey-harness@^1.0.7`.

## [1.0.6] — 2026-09-24

Published to npm as `smoke-monkey-harness@1.0.6`.

### Changed

- README reorganized: `## Install` and `## Quickstart` now appear right after
  the hero, with `## Why Smoke Monkey?` moved below quickstart.
- README hero now calls out **zero runtime dependencies** and adds an npm
  downloads badge and a `dependencies: 0` badge.
- npm package `keywords` expanded for discoverability (coding agent, autonomous
  agent, agent loop, zero-dependency, …); GitHub topics expanded accordingly.
- Scaffold dependency bumped to `smoke-monkey-harness@^1.0.6`.

## [1.0.5] — 2026-09-24

Published to npm as `smoke-monkey-harness@1.0.5`.

### Changed

- README: centered the "Why Smoke Monkey?" capabilities table and replaced
  the Mermaid architecture diagram with a plain-text box diagram so it renders
  on npm as well as GitHub.
- Scaffold dependency bumped to `smoke-monkey-harness@^1.0.5`.

## [1.0.4] — 2026-09-24

Published to npm as `smoke-monkey-harness@1.0.4`.

### Changed

- README hero: removed the monkey icon, centered the intro (title, tagline,
  banner, badges), and replaced the ASCII architecture diagram with a compact
  Mermaid flowchart.
- Scaffold dependency bumped to `smoke-monkey-harness@^1.0.4`.

## [1.0.3] — 2026-09-24

Published to npm as `smoke-monkey-harness@1.0.3`.

### Changed

- README rewritten as a product landing page: hero banner (centered), "Why
  Smoke Monkey?", short quickstart, core-capability cards, architecture diagram,
  and a beginner → advanced docs flow. Banner shipped in the package `assets/`.
- Scaffold dependency bumped to `smoke-monkey-harness@^1.0.3`.

## [1.0.2] — 2026-09-24

Published to npm as `smoke-monkey-harness@1.0.2`.

### Changed

- Releases are now triggered automatically on merge to `main`, and the version
  tag is created by CI once the npm publish succeeds.
- Repo "About" links to the npm package; install from GitHub Packages is
  documented (`@rajdeepdevelopment/smoke-monkey-harness`).
- Scaffold dependency bumped to `smoke-monkey-harness@^1.0.2`.

## [1.0.1] — 2026-09-24

Stable release — published to npm as `smoke-monkey-harness@1.0.1`.

### Changed

- Published on the npm registry under the unscoped name `smoke-monkey-harness`
  (`@smoke-monkey/harness` scope was unavailable).
- SEO tuning: install section + badges in README, expanded description and
  keywords (`mcp`, `model-context-protocol`, `ai-agents`, `agent-framework`, …),
  GitHub topics.
- Build-an-agent scaffold now depends on the published package
  (`smoke-monkey-harness@^1.0.1`).

## [0.1.0] — 2026-09-24

Initial public release.

### Added

- **Harness core** (`src/`) extracted from the Smoke Monkey agent core:
  - `createAgent` / `AgentHarness` agent loop with steps, events, dispose
  - Tool registry, permission policy, run rules, sub-contexts, compaction
  - Just-in-time SKILL.md support (Claude Code / Codex / opencode format)
  - Operational MCP manager (`mcpStdio`, `createMcpTool`) + custom sub-contexts
  - Persisted store, artifact store, file-read cache
  - Multiple providers with NVIDIA as the reference provider
    (`nvidia/nemotron-3-super-120b-a12b`)
- **Examples** in `examples/`: basic agent, MCP demo, skills demo, plugin demo
- **Agent plugin** (`plugin/`) for Claude Code, Codex, opencode, Antigravity,
  and GitHub Copilot:
  - `install.sh` cross-host installer
  - MCP server exposing 18 tools (build-an-agent + 9 deep-feature guides)
  - Strict portable `plugin.json` (agent-plugins.org 1.0.0 schema)
  - Offline fixture suite (`scripts/fixtures/`) validating manifests and
    byte-identical skill copies
- **Docs + OSS scaffolding**: `docs/`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `SUPPORT.md`, GitHub CI / release / npm-publish workflows,
  issue + PR templates, ESLint + Prettier config

### License changed

- Relicensed from **PolyForm Noncommercial 1.0.0** to **MIT**.

[1.1.0]: https://github.com/RajdeepDevelopment/smoke-monkey-harness/releases/tag/v1.1.0
[1.0.9]: https://github.com/RajdeepDevelopment/smoke-monkey-harness/releases/tag/v1.0.9
[1.0.8]: https://github.com/RajdeepDevelopment/smoke-monkey-harness/releases/tag/v1.0.8
[1.0.7]: https://github.com/RajdeepDevelopment/smoke-monkey-harness/releases/tag/v1.0.7
[1.0.6]: https://github.com/RajdeepDevelopment/smoke-monkey-harness/releases/tag/v1.0.6
[1.0.5]: https://github.com/RajdeepDevelopment/smoke-monkey-harness/releases/tag/v1.0.5
[1.0.4]: https://github.com/RajdeepDevelopment/smoke-monkey-harness/releases/tag/v1.0.4
[1.0.3]: https://github.com/RajdeepDevelopment/smoke-monkey-harness/releases/tag/v1.0.3
[1.0.2]: https://github.com/RajdeepDevelopment/smoke-monkey-harness/releases/tag/v1.0.2
[1.0.1]: https://github.com/RajdeepDevelopment/smoke-monkey-harness/releases/tag/v1.0.1
[0.1.0]: https://github.com/RajdeepDevelopment/smoke-monkey-harness/releases/tag/v0.1.0
