# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Custom tools can now be presented, and are actually reachable.** A tool
  registered through `tools: […]` or `agent.registerTool()` was added to the
  registry but never sent to the model — the exposed set was seeded only from
  the built-in tool groups — and a call to it was rejected as unexposed. Custom
  tools are host-provided capabilities, so they are now exposed from the first
  step.
  - New optional `ToolDefinition.presentation` (and `AgentTool.presentation`):
    `{ icon?, label?, family?, tone? }`. It is a plain serialisable object, so
    it reaches a browser untouched, and it is never sent to the model.
  - `ToolRegistry.getPresentation(name)` and `getPresentations()`, surfaced as
    `agent.getToolPresentations()`. Send it once on connect to render custom
    tools before the first `tool.started`, and to keep their icons in a history
    replayed from storage. It returns copies, so a caller cannot edit the
    objects later events are built from.
  - `tool.started` and `tool.completed` now carry `presentation`.
  - `tool.completed` now carries `toolName`. It previously carried only
    `toolCallId` and `result`, so a consumer subscribed to completions alone
    could not tell *which* tool finished — `e.data.toolName` was `undefined`.

- **Paused runs are now answerable end to end.** `ask_user.required` and
  `permission.required` suspend the loop, so a host that never resolves one
  leaves the run blocked forever.
  - `ChatTransport.respond({ toolCallId, kind, answer })` is the UI-side
    counterpart to `agent.respond()` / `agent.resolvePermission()`.
    `WebSocketTransport` sends `resolve_ask_user` / `resolve_permission` on the
    socket it is already holding open, and `SyntheticTransport` resumes its
    suspended generator.
  - `ChatRuntime.resolvePrompt()` records an answer immediately rather than
    waiting for the transport to echo an ack, so a card cannot be clicked twice.

- **Structured agent errors** — every failure now leaves the loop with a `layer`
  (`provider` · `tool` · `run` · `hook` · `permission` · `transport`), a
  `severity` (`info` · `warning` · `error` · `fatal`), a stable `code`, a
  `retryable` flag, and a user-facing `hint`. Previously every failure was a bare
  string, so a provider rate limit, a denied permission and a loop guard all
  reached the UI as the same red banner and were all assumed retryable.
  - `tool.failed` and `run.failed` payloads carry `errorInfo` alongside the
    existing `error` string, so existing consumers keep working unchanged.
  - New `run.warning` event for **non-terminal** failures: the loop hit a
    provider error and is still retrying, so the UI can show a 429 immediately
    instead of only after the run finally gives up.
  - Provider errors are classified by cause — `provider_rate_limited`,
    `provider_auth` (fatal, not retryable), `provider_timeout`,
    `provider_unavailable` — replacing the string-only `formatProviderError`
    path (kept as a deprecated wrapper for compatibility).
  - New public exports: `AgentErrorInfo`, `AgentErrorLayer`,
    `AgentErrorSeverity`, `toAgentErrorInfo`, `errorMessageOf`,
    `classifyProviderError`, and per-layer constructors
    (`toolFailedError`, `toolBlockedError`, `toolNotFoundError`,
    `toolCancelledError`, `permissionDeniedError`, `runHardStopError`,
    `repeatedErrorError`, `emptyResponseError`, `hookBlockedError`,
    `hookFailedError`, `transportError`, `connectionLostError`).
  - Harness messages are never filled with raw provider dumps: a provider error
    is summarised to a bounded, user-facing sentence.

- **Severity-aware error UI** (`@smoke-monkey/ui`) — new `ErrorCard` component
  and a `notice` message part.
  - `ChatErrorInfo` gains optional `layer`, `severity`, and `hint`; `toChatError`
    coerces bare strings and infers the missing fields from the text, so a proxy
    that only relays plain text still renders correctly.
  - Three deliberately distinct surfaces: `tool:error` lands on that tool call's
    card, the new non-terminal `notice` event lands inline in the message while
    the run keeps streaming, and `error` stays terminal.
  - Retry is only offered when the error is actually retryable, and never for a
    `fatal` error — the UI no longer offers an action that cannot work.
  - `ToolCall.error` added, and `ToolCallCard` renders it (a failed tool now
    opens by default, since the reason is the point of the card).
  - `createAgentEventParsers()` maps harness `run.*` / `tool.failed` events onto
    the normalized events with the terminal/non-terminal choice already made.
  - `SyntheticTransport` accepts `notices`, `failingTool`, and `failWith` for
    exercising every error level without a server.


- **Agent lifecycle hooks** (`AgentOptions.hooks`) — `beforeModelCall`,
  `afterModelCall`, `beforeToolCall`, and `afterToolCall` extension points for
  logging, metrics, tracing, cost accounting, authorization, and custom policy.
  `before*` hooks may rewrite the outgoing payload (`messages`, `tools`,
  `input`) or block the call; `after*` hooks are observability only and fire on
  every exit path, including failed and retried attempts.
  - `beforeToolCall` runs *ahead of* the permission prompt, so an authorization
    hook can reject a call without prompting the user. It complements
    `permission` / `autoApprove`, which still apply afterwards.
  - Failure policy: a throwing `before*` hook fails **closed** (the call is
    blocked with the error as the reason) so a crashed authz check can never
    allow through; a throwing `after*` hook is logged and ignored, because the
    work it observes has already happened.
  - Blocking a tool call feeds the reason back to the model as a failed tool
    result so the agent can adapt. Blocking a model call aborts the run and
    emits `run.failed` with `hook_blocked`.
  - New public exports: `AgentHookRunner`, `HookBlockedError`, `AgentHooks`,
    `BeforeModelCallContext` / `Result`, `AfterModelCallContext`,
    `BeforeToolCallContext` / `Result`, `AfterToolCallContext`,
    `BeforeHookOutcome`. Documented in `docs/api.md`.

### Fixed

- **Live streaming produced an empty message.** `ChatRuntime` adopted the
  transport's `message:start` into the optimistic placeholder, but only that one
  event was remapped — every later event kept the transport's id, so the reducer
  could not find the message and dropped it. There was no error anywhere: the
  turn simply rendered as an empty bubble, with no text, no tool calls and no
  chart. All message-scoped events are now remapped.

- **Registered custom tools were never exposed to the model** (see Added).

- **`getPresentations()` handed out live registry objects.** Mutating the
  returned map rewrote the very objects later `tool.started` payloads are built
  from, so one bad write in a host would have shipped a mutated icon on every
  subsequent event. It now returns copies.

### `@smoke-monkey/ui`

- **Inline `ask_user` / permission prompts** (`@smoke-monkey/ui`). A paused
  run was previously invisible in the UI: nothing rendered the question and
  nothing could answer it, so any run that asked one simply hung.
  - New `ChatPromptCard` and a `prompt` message part. Each prompt is its own
    inline card addressed to its own `toolCallId`, so a model that chains
    questions gets one card per question instead of a queue. Answering one
    collapses it in place to show what was chosen, which keeps the transcript
    readable as a conversation.
  - `<SmokeMonkeyChat onPromptRespond>` intercepts answers (persist, route to a
    human, answer on the user's behalf); `slots.prompt` replaces the card;
    `features.prompts={false}` hides the cards (it does not unblock the run).
  - A transport without `respond()` renders the card **read-only** and says why,
    rather than showing controls that go nowhere.

- **Custom tool icons.** A tool can carry its own presentation from the harness,
  so a custom tool is recognizable without an entry in this package. Resolution
  is per field: what the `tool:start` event declared, then the host's
  `toolPresentations` map, then inference from the tool name. `ToolIcon` now
  applies the declared `tone`, and `toolLabel` is exported alongside it for
  hosts replacing the tool card via `slots.toolCall`.

- **Fixed — one card-header treatment instead of eleven.** The same visual
  surface was painted eleven different ways depending on which block rendered
  it: a baked-in purple gradient (`rgba(139,92,246,0.10)`), a brand-tinted wash,
  a literal white overlay, or no background at all. That inconsistency is what
  made cards read as unfinished rather than premium, and the purple and the white
  overlay ignored the active theme entirely.
  - New shared `.sm-card-head` (and `.sm-card-head--toolbar`) applied to all 16
    card/toolbar headers across `ArtifactRenderer`, `TableWithExport`,
    `CodeBlock`, `CardBlock`, `TreeBlock`, `ChartBlock`, `WorkflowBlock`,
    `AddonShell`, and `FileBasedViewer`. The wash derives from `--ink-primary`
    at low alpha, so it is correct in dark *and* light themes and follows
    `customTheme`.
  - Full-screen preview backdrops used a hardcoded navy (`#0B1120`) and now use
    `--bg`; artifact table zebra rows, workflow node fills, and the agent rail's
    title/count/rule colors were literal values (including a near-white title
    that was invisible in light themes) and are now token-backed. Only
    intentional brand marks remain hardcoded: the macOS window dots and the
    vendor logo colors in `favicon.tsx`.

- **Fixed — chart series colors no longer ignore the active theme.** Bar, line,
  pie, and scatter charts (both marker blocks and chart artifacts) were painted
  with a hardcoded purple hex palette and now derive every series color from
  the semantic tokens, so they re-color across all 14 built-in themes and
  follow `customTheme` / in-place recolors.
  - New `chartColor(i)` helper (re-exported from `@smoke-monkey/ui`) returns a
  themed color for the nth data point, cycling `primary`, `accent`, `info`,
  `success`, `warning`, `destructive` plus two `color-mix` blends.
  - Colors are applied through `style` props: SVG/DOM presentation attributes
  (`fill="…"`, `stroke="…"`) cannot resolve custom properties and silently
  rendered black.
  - Chart chrome (grid lines, tick labels, tooltip bubble, donut track) moved
  from hardcoded hex to token-backed classes in the new `_chart.scss`.
  - `CardBlock`'s `primary` tone and `WorkflowBlock`'s node accents were
  hardcoded violet and now use the themed `primary` token.

---

## [1.2.0] — 2026-09-26

Published to npm as `smoke-monkey-harness@1.2.0` and
`smoke-monkey-harness-mcp@1.0.1`.

### Companion `smoke-monkey-harness-mcp@1.0.1`

- Versioned `1.0.1` in line with the library's `1.x` scheme; dependency
  tightened to `smoke-monkey-harness@^1.2.0` so
  `npx -y smoke-monkey-harness-mcp` resolves the harness 1.2.0 server (20 tools,
  including the category-wise agent-skills `harness_skills_by_category` and
  `harness_skill_content`).
- README tool table updated with the new skills tools.

### Added

- **Category-wise bundled Agent Skills** — the 25 skills in
  `plugin/agent-skills/skills` can now be loaded directly as harness skills
  (no MCP process needed), filtered by the same categories as the stock MCP
  entries: `loadAgentSkills({ category })`, `buildAgentSkillRegistry({ category })`,
  `AGENT_SKILL_CATEGORIES`, `agentSkillCategories()`, `categoryToDomain()`,
  `resolveBundledAgentSkillsDir()`, `loadAgentSkillCatalog()`. The bundled
  skills dir is resolved through the package `exports` subpath, so it works in
  both the ESM and CommonJS builds.
- **Shared skill catalog** — `plugin/agent-skills/catalog.json` is now the
  single source of truth for the lifecycle phase, domains (backend/frontend/
  devops/data/qa/meta), and aliases per skill. The bundled MCP server
  (`plugin/agent-skills/mcp/server.mjs`) reads it too, so the skill loader and
  the server can never drift on which skills belong to which category.
- `Skill` objects gain optional `domains: string[]` and `phase: string`
  metadata when loaded via `loadAgentSkills()` (frontmatter-only skills remain
  unchanged).
- Unit tests `tests/agent-skills.test.ts` (category mapping, 25-skill load,
  per-domain filtering, registry build).
- **Harness MCP server tools** — `plugin/mcp/server.mjs` now exposes the
  bundled agent-skills directly (18 → 20 tools): `harness_skills_by_category`
  (browse the 25 skills in `plugin/agent-skills/skills`, filtered by the stock
  categories or a raw domain) and `harness_skill_content` (load one skill's
  full `SKILL.md`), so agents can discover and apply the bundled skills through
  the harness server itself.
- **Installer ships the category-wise skills** — `plugin/install.sh` now drops
  the 25 bundled agent-skills under `<skills-dir>/agent-skills/<skill>/` for
  every agent (global + project), so all ~70 supported tools gain the
  backend/frontend/devops/qa skills alongside the smoke-monkey-harness skill.
  Loaders scan recursively, so no agent-side config is needed.

### Changed

- Loaded skills are tagged with their catalog domains/phases; `list_skills` /
  `use_skill` still work unchanged — bundled agent-skills are just an
  additional `loadAgentSkills()`/registry source.

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
