# Feature guide — agent loop (phases, guards, compaction)

`agent.run(task)` orchestrates a **plan → act → verify → fix → finish** loop.
You don't script the loop; you set its knobs and let the model drive it.

## Phases

Each turn has a phase, derived from the task and the last result
(`classifyTaskGroups`, `nextPhaseOnCall`, `nextPhaseOnResult`):

```
explore → plan → edit → verify → recover → complete
```

- `explore` — research repo/knowledge before acting (research-typed tasks).
- `plan` — structure the work (cards, todos) before mutations.
- `edit` — apply tool mutations.
- `verify` — evidence-based checks (tests, typecheck, inspect the diff).
- `recover` — a verification failure demotes here: diagnose, fix, re-verify.
- `complete` — calls `finish_task`, ends the run.

The prompt embeds the current phase directive (`phaseDirective`), so the model
tailors its actions each turn. `PHASE_TOOLS` maps phases to allowed tool groups
(e.g. `verify` skips mutators).

## Guards (automatic)

`createRunGuards` + `wouldTripLoopGuards` enforce:

- **no-progress** — repeated identical tool calls in a row.
- **repeated-failure** — the same call failing back-to-back.
- **same-output** — the model echoing the same text unchanged.
- **empty-response** — empty model turns, with backoff (`emptyResponseDelay`).
- **search-family loop / doom-loop** — `checkSearchFamilyLoop`,
  `checkDoomLoop` (read-only tool churn).
- **runaway steps** — `MAX_STEPS` (default 1000, override in `RunOptions`).

A guard trip interrupts `run()`; the agent surfaces a clear `run.interrupted`
so the product can present a retry/repair path.

## Compaction

Long runs are summarised automatically over `COMPACTION_THRESHOLD` (fraction of
the `CONTEXT_TOKEN_BUDGET`, default 0.9; budget default 164k tokens):

- `ContextCompactionService` merges history into a snapshot, keeping
  `KEEP_RECENT_MESSAGES` recent rings intact.
- Events: `compaction.started` / `compaction.completed`.
- The active sub-context set survives summarisation.

## Turning the knobs

```ts
const agent = createAgent({
  workspacePath,
  // token discipline:
  // subSystemPrompt: 'Keep work batched; prefer the cheapest edit tool.',
  // permission: …,
})
```

Run-level controls: `agent.abort()` interrupts; `MAX_STEPS` / budgets live in
`runOpts`. `resolveTokenBudget(snapshot)` reports current spend vs budget so a UI
can warn before compaction kicks in.

## Product patterns

- **Long autonomous runs** — keep guards on; surface `phase.changed` so users see
  the state machine, not silence.
- **Flaky page testing** — verification tools (tests/e2e) feed `verify`；on
  `recover` the model self-heals; demote to human when a guard trips.
- **Step UX** — `step.started`/`step.ended` + `todo.updated` give you a live
  progress timeline.