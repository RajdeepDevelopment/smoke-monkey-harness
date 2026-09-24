# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/RajdeepDevelopment/smoke-monkey-harness/releases/tag/v0.1.0