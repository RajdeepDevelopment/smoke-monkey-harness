# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **New direct cloud providers (OpenAI-compatible, native endpoints + per-provider API keys):**
  `huggingface` (router.huggingface.co), `deepseek`, `qwen` (DashScope),
  `zai` (Z.ai GLM), `moonshot` (Kimi), `mistral`, `cohere`, `groq`, `together`,
  `fireworks`, and `cerebras`. All stream by default (now 18 `STREAMING_PROVIDERS`);
  key env vars resolve via `envKey` (`HUGGINGFACE_API_KEY`, `DEEPSEEK_API_KEY`,
  `QWEN_API_KEY`/`DASHSCOPE_API_KEY`, `ZAI_API_KEY`, `MOONSHOT_API_KEY`,
  `MISTRAL_API_KEY`, `COHERE_API_KEY`, `GROQ_API_KEY`, `TOGETHER_API_KEY`,
  `FIREWORKS_API_KEY`, `CEREBRAS_API_KEY`, last resort `LLM_API_KEY`).
- Shared provider registry (`provider-apis.ts`) keeps the loop LLM client and the
  compaction summarizer on the same endpoint/key map.
- `PROVIDER_CAPS` defaults for every new provider + ~210 `MODEL_CAPS` entries
  for the OpenRouter/OpenAI/xAI/NVIDIA/reasoning catalogs (OpenAI ChatGPT,
  OpenRouter cloud, xAI Grok, NVIDIA NIM free, OpenCode Zen free, Hugging Face
  cloud). Unknown models fall back to provider-level caps via basename matching.
- Provider guide + reference updated everywhere: README, `docs/providers.md`,
  `docs/api.md`, MCP `guide.md`/`reference.md`/`providers.md` feature guide, the
  plugin SKILL (SKILL.md + references/api.md + references/features.md), and the
  four mirrored skill copies.

## [1.3.1] - 2026-09-28

Docs-only patch. `smoke-monkey-harness@1.3.1`, `@smoke-monkey/ui@0.1.3`, and
both MCP wrappers at `1.1.1` republish purely to refresh the npm READMEs:

- The main README hero no longer carries the package-names callout; it is its
  own `## Package names` section after Quickstart, with Install/Quickstart at
  the top.
- The `@smoke-monkey/mcp` README leads with the demo video, moves the
  "Two names, one server" note down into `## Run with npx`, and corrects the
  tool count heading to `Tools (22)`.
- The `@smoke-monkey/ui` README hoists Install + Quick start above the Why
  blurb.

No runtime, manifest, or API changes.

## [1.3.0] - 2026-09-28

Ships as `smoke-monkey-harness@1.3.0`, `@smoke-monkey/ui@0.1.2`, and the MCP
wrappers at `1.1.0`. The wrappers are thin launchers that resolve
`plugin/mcp/server.mjs` out of the harness package; they are republished at
`1.1.0` retargeted to `smoke-monkey-harness@^1.3.0` so the renamed guide tools
`harness_guide_errors_validation_and_pauses` and the rest reach
`npx -y smoke-monkey-harness-mcp` and `npx -y @smoke-monkey/mcp` with the
harness release.

### Fixed

- **Plugin manifests no longer drift from the published package.** `plugin.json`,
  `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, the Antigravity
  `marketplace.json`, and the MCP server's `serverInfo` were all still reporting
  `1.2.0` while the library was at `1.2.1` — so `harness_status` told a client it
  was talking to an older build than the one installed beside it. They are bumped
  with the package now, and the plugin fixture asserts the manifests match
  `package.json` so the next bump cannot skip them again.

### Changed

- **Guide tools renamed to self-describing names.** *(Released as `1.3.0` rather than
  `1.2.1`: the rename is a breaking change to the public tool surface, and a
  patch bump would not signal that.)* The eleven
  `harness_guide_<feature>` tools now carry a descriptive suffix, because a
  `tools/list` dump gets truncated and `harness_guide_ui` tells a model nothing:
  `harness_guide_subcontexts_activation_and_switching`,
  `..._skills_skill_md_discovery`, `..._mcp_servers_and_discovery`,
  `..._providers_models_and_api_keys`, `..._tools_custom_tool_implementation`,
  `..._loop_phases_guards_and_compaction`, `..._permissions_the_three_pauses`,
  `..._storage_sessions_runs_messages`, `..._events_streaming_and_ui_wiring`,
  `..._ui_bridge_and_components`, `..._errors_validation_and_pauses`. **This is a
  breaking change for any prompt or script that calls a guide by its old short
  name** — the old names are no longer registered. Tool count is unchanged (22).

- **Tools guide rewritten as a real implementation reference.** Covers
  `ToolDefinition` vs `AgentTool` and the adapter between them, the full
  built-in factory table, the **two different `ToolGroupName` enums**
  (`options.tools` load groups vs `TOOL_GROUPS` exposure groups — mixing them
  fails silently), writing and registering a custom tool, permissions
  annotations, and UI presentation. Also documents three facts that are easy to
  get wrong: the model only ever reads `output` (built from `content[].text`, and
  `data` is UI-only), `inputSchema` is advertised but **not** enforced at runtime,
  and a custom tool is `permissionAction: 'allow'` until you set
  `annotations.destructiveHint`.

- **MCP guide now documents the full discovery lifecycle.** Separates the host's
  job from the model's: `inspect_mcp_stock` surveys **configured** servers and
  never pauses, the model decides silently, `request_mcp_approval` is the only
  pause, and the host resolves via `resolveMcpDecision(toolCallId, { action:
  'enable'|'add'|'skip', names })`. Makes explicit that the model can only
  enable *configured-but-disabled* servers — adding one is a host call
  (`addMcpServer`) — and that a stock server is only reachable by the model if it
  ships in `options.mcp`.

- **MCP wrapper packages retargeted to `^1.3.0` (`1.1.0`).** Both
  `smoke-monkey-harness-mcp` and `@smoke-monkey/mcp` are unchanged launchers —
  they ship the same `bin/` that resolves `plugin/mcp/server.mjs` from the
  installed harness — so the only real change is the dependency floor: `^1.2.0`
  is now `^1.3.0`. That guarantees the renamed guide tools and the manifest
  drift fix are what an `npx` consumer actually runs, rather than a possibly
  stale 1.2.x in a lockfile.

- **`inspect_mcp_stock` is opt-in and no longer hijacks runs.** The MCP stock
  search is now gated behind `mcpStockSearch: true` (default **off**). Two
  related problems are fixed: The MCP stock
  search is now gated behind `mcpStockSearch: true` (default **off**). Two
  related problems are fixed:

  - **A read-only listing could stop the run.** The tool used to auto-pause with
    a `mcp.approval_required` popup whenever it surfaced a recommendation, so
    a routine "what servers do I have?" probe could block every run before any
    work happened — and it fired on the tool's own data rather than on a
    decision. `inspect_mcp_stock` no longer pauses, changes run status, or asks
    the user anything. It returns a compact, ranked inventory (bounded to 20
    rows) and the **model decides** what it needs. `request_mcp_approval` is now
    the single, deliberate consent path and stays available by default.
  - **The prompt no longer teaches a tool that may not exist.** Every
    stock-search instruction (the "run this at task start and at every phase
    boundary" doctrine) is rendered only when the tool is actually exposed.
    Telling a model to call an unregistered tool produces hallucinated calls and
    stall loops. Guidance about activating and using **already-configured**
    servers is not gated and works either way.

  `mcpStockSearch` is threaded from one option through `Agent` →
  `BuildSystemPromptOptions.mcpStockSearch` and
  `RunOperatingRulesOpts.mcpStockSearch`, so the registry and the prompt can
  never disagree.

### Added

- **The `@smoke-monkey` scope.** The library, the MCP server, and the chat UI
  are now published under a scope, and `main` deploys every package to both the
  scoped and the unscoped name on each version bump:

  | Package | Name | Status |
  |---|---|---|
  | Agent runtime | `@smoke-monkey/harness` | new, `1.2.0` |
  | MCP server | `@smoke-monkey/mcp` | new, `1.0.2` |
  | Chat UI | `@smoke-monkey/ui` | new, `0.1.1` |
  | Agent runtime | `smoke-monkey-harness` | unchanged, still published |
  | MCP server | `smoke-monkey-harness-mcp` | unchanged, still published |

  The unscoped packages are kept exactly as they are because they have real
  download counts; nothing is renamed, moved, or deprecated. The publishing
  workflow rewrites `package.json`'s `name` in the runner at publish time only,
  so the repository's own manifests keep the legacy names and the legacy jobs
  keep publishing untouched. New installs should use the scoped names.

  `@smoke-monkey/mcp` installs a `smoke-monkey-mcp` binary. Naming the bin
  `@smoke-monkey/mcp` would have produced a bare `mcp` command, because npm
  strips the scope from bin names.

- **`harness_guide_errors` (MCP server), the 22nd tool.** Prompts, tool input,
  and failure handling in one guide: the `AgentErrorInfo` model, the
  recoverable-vs-terminal event table, the three layers of tool-input
  validation, and the buffering, abort and denial rules for each of the three
  pauses. It is the reference for the two failure modes that break a hosted
  agent without throwing — a pause nobody answers, and a tool call the model got
  wrong. The plugin fixture now asserts that every file in `features/` is
  registered and served, so a guide cannot ship unreachable.

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

- **An interrupted run hung its consumer forever.** `run.interrupted` is the
  last event an interrupted run emits — the loop has already saved the
  transcript, marked the run and session interrupted, and there is nothing after
  it — but the bridge mapped it to a plain `notice` and only treated
  `agent:complete` / `error` as terminal. A host looping over
  `bridge.events()` waited on a stream that could never produce again, with no
  error logged. The bridge now ends the iteration on `run.interrupted` too.

- **Interrupting a run looked like a failure.** The harness's reason is the
  string `user_interrupt`, which matches nothing in `toChatError`'s patterns, so
  the bare string was classified as a retryable `run` error. A deliberately
  stopped run rendered a red banner on a transcript that was fine. It is now an
  `info`-severity notice with the code `run_interrupted`; the work is saved and
  the session is still replyable.

- **The third pause deadlocked the run.** `mcp.approval_required` suspends a
  run until `agent.resolveMcpDecision()` is called, and the bridge had no case
  for it, so the event was dropped: no prompt on screen and no way to answer.
  Only the path that recommends an MCP server ever hit this.
  - New `mcp_approval` prompt kind (`ChatPromptKind`, `prompt:mcp_approval`,
    `ChatMcpApproval`), an `mcp.resolved` mapping, and a `resolve_mcp_approval`
    command in `WebSocketTransport`.
  - `ChatPromptResponse.mcpDecision` carries `{ action, names }` — the answer is
    a configuration decision, not text to read. It is optional: omitted, the
    bridge falls back to the ids the prompt already showed, so a host that
    forwards `answer` alone cannot enable nothing by accident.
  - `ChatPromptCard` renders the recommended servers and enable/add/skip.

- **Structured errors were thrown away at the UI boundary.** `run.failed`,
  `run.warning` and `tool.failed` all carry `errorInfo` next to a flat `error`
  string, and the bridge read only the string — so `code`, `layer`, `severity`
  and `retryable` never arrived, and the UI fell back to guessing them from the
  wording. The bridge now passes the structured error through, and synthesizes a
  complete one when the producer sent only a string or a half-filled object.

- **One decision produced two `prompt:resolved` events.** The bridge closes a
  prompt locally in `answer()`, and the harness then echoes `ask_user.response`
  (and `mcp.resolved`) for the same call. The reducer is idempotent, so state
  survived, but each answer put a second event on the wire. The echo is now
  dropped, while still allowing the echo to close a prompt the bridge did not
  answer itself (a bridge attached mid-run).

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
