# Feature guide — storage & sessions

By default the harness keeps memory **in-process** (`MemoryStore`), which is
perfect for demos and single runs. Real products swap in a `Storage`
implementation so sessions, runs, and messages persist and resumes work.

## Concrete `Storage` surface

```ts
// sessions
ensureSession(sessionId, meta)                    getSession(sessionId)
setSessionStatus(sessionId, status)               setSessionSnapshot(sessionId, snapshot)
addSessionTokens(sessionId, prompt, completion)

// runs
ensureRun(runId, sessionId)                       getRun(runId)
bumpRunStep(runId)                                setRunStatus(runId, status)
setRunAgentState(runId, agentState)               addRunTokens(runId, prompt, completion)

// messages
addMessage(sessionId, message) → Promise<AgentMessage>
updateMessage(sessionId, message) → Promise<void>
listMessages(sessionId) → AgentMessage[]
```

That small contract is *everything* the loop touches on disk — no framework, no
database requirement. Implement it over Postgres/Redis/SQLite/Flat-Files as fits
your product. `src/store.ts` ships `MemoryStore` (a working reference) and
`createMemoryStore()`.

## Sessions & resume

```ts
const agent = createAgent({
  workspacePath,
  sessionId: 'usr_7/room_42',     // stable id → shared memory across runs
  store: myPersistentStore,        // default: new MemoryStore()
  userId: 'usr_7',
})
```

- Same `sessionId` + same `store` → a later `agent.run(task)` resumes with the
  conversation snapshot (and persisted sub-context state / todos).
- Omit `sessionId` → each run gets a fresh session (`run.sessionId` on result).
- `agent.store` is exposed for direct reads (e.g. render history in a UI).

## Task list + sub-contexts (run state)

The agent's `todo_write` list and its open sub-contexts live with the **session** (in
the session snapshot), not the run: they survive the end of a run, are re-announced
(`todo.updated`, `context.updated`) when the next run starts, and clear only when the
agent changes or closes them. `agent.getRunState(sessionId?)` returns
`{ todos, contexts }` so a UI can show them immediately after a refresh. This needs a
**stable `sessionId`** — a fresh session per run starts with nothing.

## Runs & token accounting

`HarnessRun` tracks `status`, step count (`bumpRunStep`), and token/cost
counters (`addRunTokens`); `HarnessSession` aggregates across runs. The exported
`estimateTokens` / `snapshotToSystemMessage` helpers let you inspect size
outside the loop.

## Product patterns

- **Server-side persistence** — map `Storage` to your rows; add a `userId` on
  every session for tenancy.
- **Resumable long tasks** — keep `sessionId` stable; CAD the UI to reload
  `listMessages(sessionId)` for the thread view.
- **Cost analytics** — `addRunTokens` per run + `addSessionTokens` per session
  are your billing/history primitives.