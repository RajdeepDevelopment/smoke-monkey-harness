# Feature guide — sub-contexts

Sub-contexts are **on-demand guidance blocks** the model opens/closes with the
`context_manage` tool. Think of them as "attach this briefing to the system
prompt while I work on X, detach it when I leave X". They keep the prompt small
and focused, and they are how your product injects domain rules at the right
moment.

## How the model uses them

`context_manage` actions: `set`, `activate`, `deactivate`, `swap`, `list`.

- Up to **10** contexts may be active at once (`MAX_ACTIVE_CONTEXTS`).
- When a context is active, its `content` block is rendered into the system
  prompt under `## <Title>`.
- Each built-in has a `summary` (when to open), `cost` (token weight) and
  `closeWhen` (when to close) so the model self-manages.
- `pinned` contexts (e.g. `agent_operating_principles`) cannot be deactivated.

## Built-in catalog (activated by id)

Workflow — `efficient_editing`, `library_guide`, `todo_management`,
`repository_discovery`, `git_hygiene`
Quality — `verification_rigor`, `common_edge_cases`, `debugging`, `testing_strategy`,
`code_quality`
Architecture — `backend_scale`, `api_contract`, `data_modeling`,
`system_architecture`, `production_readiness`
UI — `frontend_ui`
Other — `terminal_mastery`, `security`, `performance`
Gen-AI — `pdf_generation`, `ppt_generation`, `hugging_face`, `excel_generation`
Core (pinned) — `agent_operating_principles`
MCP — `mcp_<id>` per configured server (see the mcp feature guide).

You are not limited to these — `options.subContexts` adds your own.

## Adding a custom sub-context

```ts
const agent = createAgent({
  workspacePath,
  subContexts: [
    {
      id: 'team_rules',
      title: 'Team Rules',
      summary: 'Repo conventions and review expectations — activate during edits.',
      content: 'All public APIs are typed. No `any`. Conventional commits. Run the test suite before done.',
      cost: 'low',
      closeWhen: 'after the edit is verified',
      category: 'workflow',
      pinned: false,
    },
  ],
  defaultSubContexts: ['team_rules'],   // active from run start
})
```

`registerSubContext(def)` (exported) registers globally at runtime — useful when
the context set is decided after `createAgent`.

## Extending product behaviour

- **Rules that vary by task** → sub-context the model toggles (`research_mode`
  pattern: activate while investigating, deactivate once it starts editing).
- **Always-on constraints** → `defaultSubContexts: [...]` or `pinned: true`.
- **Long domain briefings** → register as sub-contexts instead of stuffing the
  system prompt; the model opens them only when relevant.
- **Observer**: the emitted events `context.updated` / `state.changed` reflect
  the active set — use them to render a context panel in your UI.

## Cost & hygiene

- Every active block costs tokens every turn — prefer `cost: 'low'` brevity and
  a clear `closeWhen`.
- Prefer one focused context per phase over several broad ones.
- Compaction preserves the active set across summarisation.