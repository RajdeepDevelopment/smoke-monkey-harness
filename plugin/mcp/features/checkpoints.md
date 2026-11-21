# Feature guide — checkpoints: revert / undo a run

Other coding agents let the user rewind a chat message and have **every change
the agent made undone on disk**. This is that feature. It is **opt-in** and
purely additive: without `checkpoints`, nothing here runs and no file is written.

## How it works

Before each `agent.run()` the harness snapshots the workspace into a **shadow git
repository** at `<workspace>/.smoke/checkpoints/git`. The user's own `.git` is
never read, written, or modified. `agent.revert(runId)` restores the workspace to
that snapshot and drops the run's messages from the session.

Because it snapshots the whole working tree (not just the file tools' targets),
it also undoes what `run_command` / `run_test` did — `sed -i`, `rm`, codegen,
`npm install` scripts, formatters.

What it does **not** touch:

- files ignored by the workspace's `.gitignore` (so `node_modules`, `.env`, build
  output are neither snapshotted nor reverted);
- the harness's own ignore list (`.git`, `node_modules`, `dist`, `build`, `.smoke`, …);
- anything outside the workspace (a revert never leaves `workspacePath`).

Requires the `git` binary. If it is missing, checkpoints disable themselves with a
warning, the agent runs normally, and `revert()` returns `{ ok: false, error }`.

## Enable it

```ts
const agent = createAgent({
  workspacePath: '/repo',
  sessionId: 'project-123',
  checkpoints: true,                       // or { dir?, maxCheckpoints? } (default 100)
});
```

## API

```ts
await agent.listCheckpoints(sessionId?)    // Checkpoint[] — one per run, oldest first
await agent.previewRevert(runId)           // RevertResult — what WOULD change; modifies nothing
await agent.revert(runId?, opts?)          // RevertResult — omit runId to revert the latest run

// opts: { files?: boolean (default true), messages?: boolean (default true), dryRun?: boolean }
// RevertResult: { ok, runId, error?, dryRun, changes: { added, modified, deleted },
//                 filesReverted, messagesReverted, task? }
```

- `revert(runId)` rewinds to **just before that run started**: that run and every
  later run are undone (files **and** messages). Their checkpoints are forgotten.
- `result.task` is the reverted run's prompt — put it back in the input box so
  the user can edit and resend ("edit a previous message").
- `changes` lists what was created (`added`), edited (`modified`) and deleted
  (`deleted`) since the checkpoint. A revert deletes `added`, restores the rest.
- Refuses while a run is active (`abort()` first) and when checkpoints are off.
- The session's compaction snapshot is restored too, so a summary of the undone
  turns never leaks back into the conversation.
- **Hand edits made after the run started are overwritten as well.** Show
  `previewRevert()`'s file list and ask before calling `revert()`.

### Events

`checkpoint.created` — emitted at the start of a run (`data: { messageCount, createdAt }`,
`e.runId` is the id to pass to `revert`). `checkpoint.reverted` —
`data: { filesReverted, messagesReverted, changes }`.

### Custom `Storage`

Message removal uses an **optional** `Storage.truncateMessages?(sessionId, keepCount)`.
`MemoryStore` implements it. A custom store without it keeps working: files are
still restored and the result reports `messagesReverted: false`. Implement it to
get the full conversation rewind on your own database.

## Wire it into the chat UI (`@smoke-monkey/ui`)

The UI shows a ↶ control on each user message that has a restore point. Clicking
it dry-runs the revert and lists the files, then **Revert** restores them, cuts the
transcript, and puts the prompt back in the composer. It only appears when the
transport can revert, so existing apps see no change.

1. **Server** — answer a `revert` request with `revertHarnessRun` (never throws):

```ts
import { createHarnessBridge, revertHarnessRun } from '@smoke-monkey/ui';

// WebSocket: a fresh short-lived socket per revert (a run's socket closes at the end)
socket.on('message', async (raw) => {
  const msg = JSON.parse(String(raw));
  if (msg.type === 'revert') {
    socket.send(JSON.stringify({
      type: 'revert_result',
      requestId: msg.requestId,
      data: await revertHarnessRun(agent, msg.data),   // { runId, dryRun?, files?, messages? }
    }));
  }
});

// HTTP/SSE: POST /revert  →  res.json(await revertHarnessRun(agent, req.body))
```

2. **Browser** — `WebSocketTransport` already has `revert()`; for `FetchTransport` set
   `revertUrl`:

```ts
new FetchTransport({ url: '/api/chat', parser, revertUrl: '/api/revert' });
```

`createHarnessBridge` maps `checkpoint.created` to a `checkpoint:created` stream
event; the reducer links the run id to the turn's user message
(`message.metadata.checkpointRunId`). Headless apps use
`runtime.canRevert(messageId)` / `previewRevert(messageId)` / `revertTo(messageId)`.
`SmokeMonkeyChat` accepts `onReverted({ messageId, result })`.

**Parser pitfall.** `StreamParser` silently skips event types it was not told about.
If your server forwards the bridge's events unchanged, build the browser parser with
`createNormalizedStreamParser()` (exported by `@smoke-monkey/ui`); a hand-written list
drops `checkpoint:created` and no message gets a revert control. Raw harness events
forwarded through `createAgentEventParsers` are covered (`checkpoint.created`).
Runnable end to end, offline: `examples/revert-demo`.

## Gotchas

- Empty directories the agent created are not tracked by git, so a revert leaves them
  behind (their files are removed).
- The harness ignore list matches folder names at ANY depth: a source folder named
  `build/`, `out/`, `dist/` or `coverage/` is neither snapshotted nor reverted.
- The first snapshot of a large, un-ignored tree takes a moment; later ones are incremental.
- Revert is only as good as the snapshot moment: it undoes changes made **since the
  run started**. Edits between two runs belong to the next run's baseline.
- Un-ignored large binaries are snapshotted too; add them to `.gitignore`.
- Side effects outside the workspace (network calls, databases, `git push`) cannot
  be undone — only files in the workspace are restored.
- Don't call `revert()` from inside a hook or tool of a running agent.
- Leave `.smoke/` in `.gitignore` (the harness already excludes it from snapshots).
