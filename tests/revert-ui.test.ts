import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createAgent } from '../src/index.js';
import { createHarnessBridge, mapHarnessEvent, revertHarnessRun } from '../ui/src/runtime/harnessBridge.js';
import { ChatRuntime } from '../ui/src/runtime/ChatRuntime.js';
import { createNormalizedStreamParser } from '../ui/src/runtime/StreamParser.js';
import { createAgentEventParsers } from '../ui/src/runtime/agentEventParsers.js';
import { StreamParser } from '../ui/src/runtime/StreamParser.js';
import { applyChatEvent } from '../ui/src/runtime/EventReducer.js';
import type { ChatMessage } from '../ui/src/types/message.js';
import type { ChatStreamEvent } from '../ui/src/types/stream.js';
import type { ChatRevertRequest, ChatRevertResult, ChatStore, ChatTransport } from '../ui/src/types/transport.js';

const ok = (over: Partial<ChatRevertResult> = {}): ChatRevertResult => ({
  ok: true, runId: 'run_1', changes: { added: ['n.txt'], modified: ['a.ts'], deleted: [] },
  filesReverted: true, messagesReverted: true, task: 'make it blue', ...over,
});

/** A transport whose one run announces a checkpoint like the harness bridge does. */
function transport(revert?: (r: ChatRevertRequest) => Promise<ChatRevertResult>): ChatTransport & { revertCalls: ChatRevertRequest[] } {
  const revertCalls: ChatRevertRequest[] = [];
  return {
    revertCalls,
    async *send(): AsyncGenerator<ChatStreamEvent> {
      yield { type: 'checkpoint:created', runId: 'run_1' };
      yield { type: 'message:start', messageId: 'a1' };
      yield { type: 'text:delta', messageId: 'a1', delta: 'done' };
      yield { type: 'message:complete', messageId: 'a1' };
    },
    ...(revert ? { revert: async (r: ChatRevertRequest) => (revertCalls.push(r), revert(r)) } : {}),
  };
}

describe('revert: harness event -> UI', () => {
  it('maps checkpoint.created to checkpoint:created with the run id', () => {
    const out = mapHarnessEvent({ type: 'checkpoint.created', runId: 'run_9', data: {} }, { messageId: 'm1' });
    assert.deepEqual(out, [{ type: 'checkpoint:created', runId: 'run_9', messageId: 'm1' }]);
  });

  it('links the run to the preceding user message, not the reply', () => {
    const msgs = [
      { id: 'u0', role: 'user', content: 'old' },
      { id: 'u1', role: 'user', content: 'new' },
    ] as ChatMessage[];
    const next = applyChatEvent(msgs, { type: 'checkpoint:created', runId: 'run_1' }, 'a1');
    assert.equal(next[0]!.metadata?.checkpointRunId, undefined);
    assert.equal(next[1]!.metadata?.checkpointRunId, 'run_1');
  });

  it('revertHarnessRun reports instead of throwing when the agent cannot revert', async () => {
    const r = await revertHarnessRun({ on() {}, onAny() {} }, { runId: 'run_1' });
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /cannot revert/);
    const boom = await revertHarnessRun({ on() {}, onAny() {}, revert: async () => { throw new Error('nope'); } }, { runId: 'run_1' });
    assert.deepEqual([boom.ok, boom.error], [false, 'nope']);
  });
});

describe('revert: ChatRuntime', () => {
  it('offers revert only with a transport that can, and a checkpointed turn', async () => {
    const without = new ChatRuntime({ transport: transport() });
    await without.send('hello');
    const u = without.getState().messages.find((m) => m.role === 'user')!;
    assert.equal(without.canRevert(u.id), false);

    const withIt = new ChatRuntime({ transport: transport(async () => ok()) });
    await withIt.send('hello');
    const user = withIt.getState().messages.find((m) => m.role === 'user')!;
    assert.equal(withIt.canRevert(user.id), true);
    assert.equal(withIt.canRevert(withIt.getState().messages.find((m) => m.role === 'assistant')!.id), false);
  });

  it('previews without touching the transcript, then reverts and cuts it', async () => {
    const t = transport(async (r) => ok({ dryRun: r.dryRun }));
    const rt = new ChatRuntime({ transport: t });
    await rt.send('first');
    await rt.send('make it blue');
    const target = rt.getState().messages.filter((m) => m.role === 'user')[1]!;
    assert.equal(rt.getState().messages.length, 4);

    const preview = await rt.previewRevert(target.id);
    assert.equal(preview.dryRun, true);
    assert.equal(rt.getState().messages.length, 4, 'preview changes nothing');

    const done = await rt.revertTo(target.id);
    assert.equal(done.ok, true);
    assert.equal(done.task, 'make it blue');
    assert.deepEqual(t.revertCalls.map((c) => [c.runId, c.dryRun]), [['run_1', true], ['run_1', false]]);
    assert.deepEqual(rt.getState().messages.map((m) => m.content), ['first', 'done']);
  });

  it('leaves the transcript alone when the backend refuses', async () => {
    const rt = new ChatRuntime({ transport: transport(async () => ok({ ok: false, error: 'git missing' })) });
    await rt.send('x');
    const u = rt.getState().messages.find((m) => m.role === 'user')!;
    const r = await rt.revertTo(u.id);
    assert.deepEqual([r.ok, r.error], [false, 'git missing']);
    assert.equal(rt.getState().messages.length, 2);
  });

  it('turns a transport exception into a failed result', async () => {
    const rt = new ChatRuntime({ transport: transport(async () => { throw new Error('offline'); }) });
    await rt.send('x');
    const u = rt.getState().messages.find((m) => m.role === 'user')!;
    const r = await rt.revertTo(u.id);
    assert.deepEqual([r.ok, r.error], [false, 'offline']);
    assert.equal(rt.getState().messages.length, 2);
  });
});

describe('revert: real harness through the real bridge', () => {
  it('announces the checkpoint, then reverts files and messages via revertHarnessRun', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-e2e-'));
    fs.writeFileSync(path.join(dir, 'a.txt'), 'before');
    const agent = createAgent({ workspacePath: dir, checkpoints: true, apiKey: 'x', baseUrl: 'http://127.0.0.1:9' });
    const bridge = createHarnessBridge({ agent: agent as never, messageId: 'm1' });
    const seen: ChatStreamEvent[] = [];
    agent.onAny((e) => void seen.push(...bridge.map(e as never)));

    await agent.run('edit a', { sessionId: 's', runId: 'run_e2e' });
    fs.writeFileSync(path.join(dir, 'a.txt'), 'after');

    const announced = seen.find((e) => e.type === 'checkpoint:created');
    assert.deepEqual(announced, { type: 'checkpoint:created', runId: 'run_e2e', messageId: 'm1' });

    const preview = await revertHarnessRun(agent as never, { runId: 'run_e2e', dryRun: true });
    assert.deepEqual(preview.changes.modified, ['a.txt']);
    const done = await revertHarnessRun(agent as never, { runId: 'run_e2e' });
    assert.equal(done.ok, true);
    assert.equal(done.task, 'edit a');
    assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'before');
    assert.equal(agent.store.listMessages('s').length, 0);
    bridge.dispose();
  });
});

describe('revert: wire format', () => {
  it('the normalized passthrough parser keeps checkpoint:created (a hand-made list would drop it)', () => {
    const line = JSON.stringify({ type: 'checkpoint:created', runId: 'run_1', messageId: 'm' });
    assert.deepEqual(createNormalizedStreamParser().parseLine(line), [
      { type: 'checkpoint:created', runId: 'run_1', messageId: 'm' },
    ]);
    assert.deepEqual(new StreamParser().parseLine(line), [], 'an unregistered type is skipped silently');
  });

  it('parses a raw harness checkpoint.created, and ignores one without a run id', () => {
    const parser = new StreamParser();
    for (const [type, fn] of Object.entries(createAgentEventParsers({ messageId: 'm1' }))) parser.register(type, fn);
    assert.deepEqual(parser.parseLine(JSON.stringify({ type: 'checkpoint.created', runId: 'run_7' })), [
      { type: 'checkpoint:created', messageId: 'm1', runId: 'run_7' },
    ]);
    assert.deepEqual(parser.parseLine(JSON.stringify({ type: 'checkpoint.created' })), []);
  });
});

describe('revert: persistence', () => {
  it('re-saves the user message once it is linked to its run, so reload keeps the control', async () => {
    const saved: ChatMessage[] = [];
    const seed = { id: 'old', role: 'user', status: 'complete', content: 'seed', parts: [], createdAt: '' } as ChatMessage;
    const store = {
      getMessages: async () => [seed],
      saveMessage: async (m: ChatMessage) => void saved.push(structuredClone(m)),
    } as unknown as ChatStore;
    const rt = new ChatRuntime({ transport: transport(async () => ok()), store, conversationId: 'c1' });
    await rt.initialize();
    await rt.send('hello');
    const user = saved.filter((m) => m.role === 'user' && m.content === 'hello');
    assert.equal(user.length >= 2, true, 'saved at send, and again after linking');
    assert.equal(user[user.length - 1]!.metadata?.checkpointRunId, 'run_1');
  });
});
