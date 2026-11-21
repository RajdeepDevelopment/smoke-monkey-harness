# Revert demo

Try the chat UI's **revert** control in a browser, against a **real harness**:
real loop, real file tools, real shadow-git checkpoints, real `agent.revert()`.

No API key needed. Only the *model* is faked (a tiny local server returns
scripted tool calls); every file the agent touches is a real file you can watch.

## Run

```bash
# 1. build the local UI once (this demo uses the unreleased local build)
pnpm --dir ../../ui build

# 2. from this folder
pnpm install
pnpm dev            # server (ws://localhost:4010) + web (http://localhost:5174)
```

The server prints the workspace folder (a temp dir, reset on every start).
Open it in your editor or `watch ls` it while you chat.

## Try it

1. Send `create hello.txt and extra.txt` — two files appear on disk.
2. Send `delete notes.txt` — it disappears.
3. Send `` `echo built > out.txt` `` — a shell command; `out.txt` appears.
4. Hover your **second** message and press **↶**. The confirm lists what will change
   (`out.txt` created, `notes.txt` deleted). Press **Revert**.
5. `notes.txt` is back, `out.txt` is gone, the chat is cut after message 1, and
   `delete notes.txt` is back in the input box to edit and resend.
6. Revert the first message: you are back to the starting files.

Also: the ↶ control is hidden while a run is streaming, and it only appears on
messages that have a restore point.

## What to look at

| File | Shows |
| --- | --- |
| `server.ts` | `checkpoints: true`, one `revertHarnessRun(agent, msg.data)` call, chat + revert on the same WebSocket endpoint |
| `src/App.tsx` | `createNormalizedStreamParser()` + `WebSocketTransport` + `<SmokeMonkeyChat onReverted />` — that is all the client needs |

## A real model instead of the mock

```bash
NVIDIA_API_KEY=... pnpm server -- --live      # DEMO_MODEL=... to pick the model
```

Use prompts a real model understands ("create hello.txt with a haiku").

## Headless check

With the server running: `npx tsx tests/revert-demo.e2e.ts` (from the repo root) drives
the real `WebSocketTransport` + `ChatRuntime` through two turns and two reverts and
asserts the files on disk.
