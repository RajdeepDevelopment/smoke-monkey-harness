# Contributing

This page points at the repo's contribution guide for readers browsing docs.
See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full process.

## Quick reference

- **Setup**: `pnpm install` (Node >= 18, `nvm use` for the pinned version)
- **Checks**: `pnpm typecheck && pnpm build && pnpm test && pnpm test:fixtures && pnpm lint`
- **Branch**: `feat/…`, `fix/…`, `docs/…`
- **Commits**: Conventional Commits (`feat:`, `fix:`, …)
- **PR**: use the template; CI runs typecheck, build, tests, fixtures, lint

## Docs map

- `docs/getting-started.md` — quick start
- `docs/architecture.md` — layers and control flow
- `docs/api.md` — options, surface, events, sub-contexts, loop, permissions
- `docs/tools.md` — built-in tools, groups, custom tools, tool presentation
- `ui/README.md` — the chat UI package, and how a host wires a run to it
- `docs/providers.md` — provider matrix, NVIDIA reference
- `docs/mcp.md` — stdio / HTTP servers, approvals, stock catalog

Keep docs in sync when you change behaviour. The plugin distribution is
validated by the offline fixtures (`scripts/fixtures/test-plugin-mcp.ts`), which
also fail if the four universal skill copies (`.agents/skills`, `.opencode/skills`,
`.github/skills`, `.agents/plugins/…/skills`) drift from the source in
`plugin/skills/`. Edit the source, then copy it out — never the reverse.

Releasing is documented in [CONTRIBUTING.md](../CONTRIBUTING.md#releasing): a
merge to `main` publishes both the scoped and the legacy unscoped names.

## Code of conduct

All participants are expected to follow the
[CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md).