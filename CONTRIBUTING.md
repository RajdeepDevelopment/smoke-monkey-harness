# Contributing to Smoke Monkey Harness

Thanks for helping make `smoke-monkey-harness` better. This project welcomes
contributions: bug reports, feature requests, docs, and code.

## Table of contents

- [Development setup](#development-setup)
- [Project layout](#project-layout)
- [Scripts](#scripts)
- [Making changes](#making-changes)
- [Plugin development](#plugin-development)
- [Documentation](#documentation)
- [Conventions](#conventions)
- [License](#license)

## Development setup

Prerequisites:

- **Node.js >= 18** (developers target the current LTS, see `.nvmrc`; `nvm use`)
- **pnpm** — the repository is locked with `pnpm-lock.yaml`

```bash
pnpm install        # install dependencies
nvm use             # optional: pin the Node version (see .nvmrc)
```

## Project layout

```
src/                 Harness core: agent loop, tools, skills, providers, MCP
examples/            Runnable tsx examples (basic agent, MCP, skills, plugin)
plugin/              Distributable agent plugin: SKILL.md + MCP server + manifests
                      (.claude-plugin, .codex-plugin, plugin.json, install.sh)
scripts/fixtures/    Offline integration fixtures that validate the plugin
tests/               Unit tests (node:test, run with tsx)
docs/                Long-form documentation
.agents/             Antigravity plugin + skills distribution (Copilot / universal)
.github/             CI workflows, issue/PR templates, Copilot skill, CODEOWNERS
```

## Scripts

| Command            | Purpose                                        |
| ------------------ | ---------------------------------------------- |
| `pnpm typecheck`   | Type-check `src/` without emitting             |
| `pnpm build`       | Emit `dist/` (ESM + CJS) + post-build step     |
| `pnpm test`        | Unit tests (`tests/`)                          |
| `pnpm test:fixtures`| Offline integration fixtures for the plugin   |
| `pnpm lint`        | ESLint over `src/`                             |
| `pnpm format`      | Prettier write                                 |
| `pnpm example`     | Run `examples/basic-agent.ts`                  |
| `pnpm demo:*`      | MCP / skills / plugin demos                    |
| `pnpm plugin:install` | Install the plugin into local agent hosts    |

## Making changes

1. Fork the repository and create a feature branch (`git checkout -b feat/…`).
2. Make your change — small, focused commits with clear messages.
3. Add or update tests where behaviour changes.
4. Run the checks locally:

   ```bash
   pnpm typecheck && pnpm build && pnpm test && pnpm test:fixtures && pnpm lint
   ```

5. Open a pull request using the template. CI runs the same checks on Node 22
   and 24.

Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`,
`refactor:`, …) — see the git history for examples.

## Plugin development

The plugin is distributed under `plugin/` and consumed natively by Claude Code,
Codex, opencode, Antigravity, GitHub Copilot, and portable agent hosts. When you
change plugin behaviour:

- Run `pnpm test:fixtures` — it validates the per-host manifests, the strict
  portable `plugin.json`, and byte-identical skill copies across all locations
  (`.opencode/`, `.agents/skills/`, `.github/skills/`, plugin skill folder).
- Manifests follow the schemas documented in `docs/mcp.md` and the plugin
  `README` (agent-plugins.org 1.0.0, Codex validator, Antigravity, Copilot).
- `install.sh` must keep working for every host; add a host to `--help` and the
  installer together.

## Documentation

- Keep `docs/` in sync with code changes (especially `docs/api.md`,
  `docs/providers.md`, `docs/mcp.md`).
- README stays high-level; deep material lives in `docs/`.

## Conventions

- TypeScript, ESM (`"type": "module"`), single quotes, semicolons, 2-space
  indent — Prettier config is checked in (`.prettierrc.json`).
- All APIs are exported from `src/index.ts`; keep the public surface small.
- NVIDIA is the reference provider (`NVIDIA_API_KEY`); provider code stays
  behind a small interface so others can be added.
- **Never commit secrets.** No `.env*`, raw API keys, or private paths. Runtime
  secrets come from environment variables only.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).