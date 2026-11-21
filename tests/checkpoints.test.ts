import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CheckpointService, createAgent } from '../src/index.js';

function tmpWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-cp-'));
  fs.writeFileSync(path.join(dir, 'a.txt'), 'original A');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'original B');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'keep.ts'), 'export const k = 1;');
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'node_modules', 'pkg.js'), 'ignored');
  return dir;
}

const mutate = (dir: string) => {
  fs.writeFileSync(path.join(dir, 'a.txt'), 'CHANGED');
  fs.rmSync(path.join(dir, 'b.txt'));
  fs.mkdirSync(path.join(dir, 'new', 'deep'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'new', 'deep', 'c.txt'), 'created');
  fs.writeFileSync(path.join(dir, 'node_modules', 'pkg.js'), 'ignored-but-changed');
};

test('CheckpointService restores edits, deletes, and creations', async () => {
  const dir = tmpWorkspace();
  const svc = new CheckpointService(dir);
  const cp = await svc.create({ runId: 'r1', sessionId: 's1', task: 't', messageCount: 0 });
  assert.ok(cp, `unavailable: ${svc.unavailableReason}`);

  mutate(dir);
  const diff = await svc.diff(cp!);
  assert.deepEqual(diff.added, ['new/deep/c.txt']);
  assert.deepEqual(diff.modified, ['a.txt']);
  assert.deepEqual(diff.deleted, ['b.txt']);

  await svc.restore(cp!);
  assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'original A');
  assert.equal(fs.readFileSync(path.join(dir, 'b.txt'), 'utf8'), 'original B');
  assert.equal(fs.existsSync(path.join(dir, 'new')), false, 'empty dirs pruned');
  // ignored dirs are never touched
  assert.equal(fs.readFileSync(path.join(dir, 'node_modules', 'pkg.js'), 'utf8'), 'ignored-but-changed');
  assert.equal((await svc.list()).length, 0);
});

test('revert never touches the real .git of the workspace', async () => {
  const dir = tmpWorkspace();
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  const svc = new CheckpointService(dir);
  const cp = await svc.create({ runId: 'r1', sessionId: 's1', task: 't', messageCount: 0 });
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'tampered');
  await svc.restore(cp!);
  assert.equal(fs.readFileSync(path.join(dir, '.git', 'HEAD'), 'utf8'), 'tampered');
});

test('AgentHarness.revert undoes files and drops messages; off by default', async () => {
  const dir = tmpWorkspace();
  const agent = createAgent({ workspacePath: dir, checkpoints: true, apiKey: 'x', baseUrl: 'http://127.0.0.1:9' });
  const sessionId = 'sess';
  await agent.store.addMessage(sessionId, { role: 'user', content: 'earlier' });
  agent.store.ensureSession(sessionId, {});
  // Run fails fast (no LLM) but the checkpoint + user message are still created.
  const res = await agent.run('change things', { sessionId, runId: 'run_x' });
  assert.ok(res.messages.some((m) => m.content === 'change things'));
  mutate(dir);

  const preview = await agent.previewRevert('run_x');
  assert.equal(preview.ok, true);
  assert.equal(preview.changes.modified.includes('a.txt'), true);
  assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'CHANGED', 'preview changes nothing');

  const out = await agent.revert('run_x');
  assert.equal(out.ok, true);
  assert.equal(out.task, 'change things');
  assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'original A');
  assert.deepEqual(agent.store.listMessages(sessionId).map((m) => m.content), ['earlier']);

  const plain = createAgent({ workspacePath: dir });
  const r = await plain.revert();
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /not enabled/);
});

test('handles spaces, unicode, nested deletes and binary files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-cp-odd-'));
  const weird = path.join(dir, 'my docs', 'résumé \u2713 final.txt');
  fs.mkdirSync(path.dirname(weird), { recursive: true });
  fs.writeFileSync(weird, 'keep me');
  const bin = Buffer.from([0, 255, 1, 254, 0, 7]);
  fs.writeFileSync(path.join(dir, 'blob.bin'), bin);
  fs.mkdirSync(path.join(dir, 'tree', 'a', 'b'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tree', 'a', 'b', 'deep.txt'), 'deep');

  const svc = new CheckpointService(dir);
  const cp = await svc.create({ runId: 'r', sessionId: 's', task: 't', messageCount: 0 });
  assert.ok(cp);

  fs.writeFileSync(weird, 'gone wrong');
  fs.writeFileSync(path.join(dir, 'blob.bin'), Buffer.from([9, 9, 9]));
  fs.rmSync(path.join(dir, 'tree'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'new file ünï.txt'), 'x');

  const diff = await svc.diff(cp!);
  assert.deepEqual(diff.added, ['new file ünï.txt']);
  assert.deepEqual(diff.deleted, ['tree/a/b/deep.txt']);
  assert.deepEqual(diff.modified.sort(), ['blob.bin', 'my docs/résumé \u2713 final.txt'].sort());

  await svc.restore(cp!);
  assert.equal(fs.readFileSync(weird, 'utf8'), 'keep me');
  assert.deepEqual(fs.readFileSync(path.join(dir, 'blob.bin')), bin);
  assert.equal(fs.readFileSync(path.join(dir, 'tree', 'a', 'b', 'deep.txt'), 'utf8'), 'deep');
  assert.equal(fs.existsSync(path.join(dir, 'new file ünï.txt')), false);
});
