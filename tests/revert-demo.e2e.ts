/**
 * Manual end-to-end check (not part of `npm test`): the REAL browser-side stack
 * — WebSocketTransport + createNormalizedStreamParser + ChatRuntime — against a
 * running `examples/revert-demo/server.ts`.
 *
 *   npx tsx examples/revert-demo/server.ts      # terminal 1
 *   npx tsx tests/revert-demo.e2e.ts            # terminal 2
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ChatRuntime } from '../ui/src/runtime/ChatRuntime.js';
import { createNormalizedStreamParser } from '../ui/src/runtime/StreamParser.js';
import { WebSocketTransport } from '../ui/src/transports/WebSocketTransport.js';

const dir = process.env.DEMO_WORKSPACE ?? path.join(os.tmpdir(), 'smoke-monkey-revert-demo');
const files = () =>
  fs.readdirSync(dir, { recursive: true }).map(String)
    .filter((f) => !f.startsWith('.smoke') && fs.statSync(path.join(dir, f)).isFile()).sort();

const transport = new WebSocketTransport({ url: process.env.DEMO_WS ?? 'ws://localhost:4010', parser: createNormalizedStreamParser() });
const rt = new ChatRuntime({ transport });
const users = () => rt.getState().messages.filter((m) => m.role === 'user');

const start = files();
await rt.send('create e2e-a.txt and e2e-b.txt');
await rt.send('delete e2e-b.txt');
assert.equal(rt.getState().messages.length, 4, 'two turns = 4 messages');
assert.ok(users().every((m) => typeof m.metadata?.checkpointRunId === 'string'), 'every user turn linked to its run');
assert.ok(users().every((m) => rt.canRevert(m.id)), 'revert offered on every checkpointed turn');
assert.equal(rt.canRevert(rt.getState().messages.find((m) => m.role === 'assistant')!.id), false);
console.log('after 2 turns   ', files());

const second = users()[1]!;
const preview = await rt.previewRevert(second.id);
assert.deepEqual([preview.ok, preview.changes.deleted], [true, ['e2e-b.txt']]);
assert.equal(rt.getState().messages.length, 4, 'preview leaves the chat alone');

const r = await rt.revertTo(second.id);
assert.deepEqual([r.ok, r.task], [true, 'delete e2e-b.txt']);
assert.ok(files().includes('e2e-b.txt') && files().includes('e2e-a.txt'), 'turn 2 undone, turn 1 kept');
assert.equal(rt.getState().messages.length, 2, 'chat cut at the reverted message');
console.log('after revert #2 ', files());

const first = users()[0]!;
const r1 = await rt.revertTo(first.id);
assert.equal(r1.ok, true);
assert.deepEqual(files(), start, 'back to exactly the starting files');
assert.equal(rt.getState().messages.length, 0);
console.log('after revert #1 ', files());
console.log('\nE2E OK — real WebSocketTransport + ChatRuntime against the real harness');
process.exit(0);
