# 08. Sub-Contexts & Dynamic Memory Management

> ⭐️ **Love Smoke Monkey Harness?** Please support the project with a star on [GitHub](https://github.com/RajdeepDevelopment/smoke-monkey-harness)!
> 🌐 **Interactive Simulator:** Test the agent loop and stream live at [smoke-monkey-harness.vercel.app](https://smoke-monkey-harness.vercel.app/)

---


Traditional AI agents rely on static system prompts. However, real-world development tasks evolve: an agent begins in an exploratory posture, shifts to high-focus editing, requires strict testing rules, and needs persistent memory across runs.

Smoke Monkey Harness introduces **Sub-Contexts**: modular prompt blocks that can be dynamically activated, deactivated, updated, or swapped at runtime by either the developer or the agent itself.

---

## What is a Sub-Context?

A sub-context is a structured, named memory block rendered into the active system prompt under `## <Title>`. 

```ts
export interface SubContext {
  id: string;                      // Unique identifier (e.g. 'strict_typescript')
  title: string;                   // Header rendered into the prompt
  summary: string;                 // 1-line description for the context index
  content: string;                 // The markdown instructions or memory content
  icon?: string;                   // Visual icon for UI representation
  lockMode?: 'unlocked' | 'locked';// 'locked' prevents the LLM from mutating it
}
```

Up to **10 sub-contexts** can be active simultaneously, keeping prompt sizes controlled and focused.

---

## Built-In Sub-Contexts

The harness includes several pre-configured sub-contexts:

| ID | Title | Purpose |
| :--- | :--- | :--- |
| `goal` | Active Goal | High-level objective and acceptance criteria. |
| `task` | Current Task | Tactical task decomposition and checklist. |
| `research_mode`| Research & Analysis | Puts the model in a thorough, exploratory posture (read-first, no edits). |
| `constants` | System Invariants | Immutable rules (e.g. "Do not modify `package-lock.json`"). |
| `notes` | Scratchpad | Working memory for intermediate findings during long runs. |
| `skills` | Active Skills | Target container where activated `SKILL.md` workflows are injected. |
| `mcp_*` | MCP Server Docs | Dynamically injected when an external MCP server is approved. |

---

## Registering Custom Sub-Contexts

You can register application-specific sub-contexts during agent initialization:

```ts
import { createAgent, registerSubContext } from '@smoke-monkey/harness';

// 1. Register a specialized coding guideline
registerSubContext({
  id: 'strict_typing',
  title: 'Strict TypeScript Quality Standards',
  summary: 'Enforces explicit typing, no `any`, and comprehensive JSDoc comments.',
  content: `
- Never use 'any' or 'unknown' without explicit type guards.
- Every exported function must define input and return type interfaces.
- Prefer Discriminated Unions over optional nullable properties.
  `,
  lockMode: 'locked', // Prevents the agent from accidentally disabling these rules
});

// 2. Pre-activate default subcontexts for the agent
const agent = createAgent({
  workspacePath: process.cwd(),
  defaultSubContexts: ['goal', 'task', 'strict_typing'],
});
```

---

## Dynamic Model Control (`context_manage`)

The agent is equipped with a built-in `context_manage` meta-tool. During a run, the model can autonomously manage its own cognitive context:

```
context_manage({
  action: 'activate' | 'deactivate' | 'swap' | 'set' | 'list',
  id: 'research_mode',
  content?: '...'
})
```

- **`activate`**: Enables a registered sub-context block.
- **`deactivate`**: Removes a sub-context from the system prompt to reclaim token budget.
- **`swap`**: Replaces one active sub-context with another (e.g. swapping `research_mode` for `edit_mode`).
- **`set`**: Updates the dynamic text inside a sub-context (e.g. updating the active task checklist in `task`).

### Sub-Context Lifecycle Events

Your application UI can monitor context adjustments in real time:

```ts
agent.on('context.updated', (e) => {
  console.log('Active subcontexts changed:', e.data.activeIds);
  console.log('Total context token weight:', e.data.estimatedTokens);
});
```

---

## Session Persistence Across Runs

To allow agents to remember context, previous tool executions, and conversation history across different user turns, pass a stable `sessionId`:

```ts
const agent = createAgent({
  workspacePath: process.cwd(),
  sessionId: 'user-session-dev-104', // Stable session key
});

// Turn 1
await agent.run('Investigate why the Stripe webhook handler is returning 500 errors.');

// Turn 2: Retains full memory of Turn 1 findings without repeating exploration!
await agent.run('Apply the fix you identified in the previous step and write a regression test.');
```

### Storage Backends
By default, the harness stores session memory in a fast, in-memory store. For production deployments, pass a persistent storage adapter (PostgreSQL, Redis, or SQLite) via `options.store`:

```ts
const agent = createAgent({
  workspacePath: process.cwd(),
  sessionId: user.id,
  store: new PostgresSessionStore({ pool: pgPool }),
});
```

---

## Next Steps

- Intercept tool calls and handle errors with hooks: [09. Lifecycle Hooks](09-hooks-and-errors.md)
- Render chat interfaces with `@smoke-monkey/ui`: [10. React UI Components](10-ui-components.md)
