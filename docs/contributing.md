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
- `docs/tools.md` — built-in tools, groups, custom tools, skills
- `docs/providers.md` — provider matrix, NVIDIA reference
- `docs/mcp.md` — stdio / HTTP servers, approvals, stock catalog

Keep docs in sync when you change behaviour. The plugin distribution is
validated by the offline fixtures (`scripts/fixtures/test-plugin-mcp.ts`).

## Code of conduct

All participants are expected to follow the
[CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md).