import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialPhase,
  nextPhaseOnCall,
  nextPhaseOnResult,
  phaseDirective,
  resolveTokenBudget,
  estimateTokens,
  classifyTaskGroups,
} from '../src/services/run-context.js';

test('initialPhase starts in understand', () => {
  assert.equal(initialPhase(), 'understand');
});

test('nextPhaseOnCall: reading during understand promotes to explore', () => {
  assert.equal(nextPhaseOnCall('understand', 'read_file'), 'explore');
  assert.equal(nextPhaseOnCall('understand', 'glob'), 'explore');
});

test('nextPhaseOnCall: todo_write during understand enters plan', () => {
  assert.equal(nextPhaseOnCall('understand', 'todo_write'), 'plan');
});

test('nextPhaseOnCall: file mutation jumps straight to edit', () => {
  for (const tool of ['write_file', 'edit_file', 'apply_patch', 'delete_file']) {
    assert.equal(nextPhaseOnCall('understand', tool), 'edit', tool);
    assert.equal(nextPhaseOnCall('plan', tool), 'edit', tool);
  }
});

test('nextPhaseOnCall: run_test during edit enters verify', () => {
  assert.equal(nextPhaseOnCall('edit', 'run_test'), 'verify');
});

test('nextPhaseOnCall: recover re-enters edit on a fix attempt', () => {
  assert.equal(nextPhaseOnCall('recover', 'edit_file'), 'edit');
  assert.equal(nextPhaseOnCall('recover', 'run_test'), 'verify');
});

test('nextPhaseOnResult: failed verification demotes to recover', () => {
  assert.equal(nextPhaseOnResult('verify', 'run_test', true), 'recover');
});

test('nextPhaseOnResult: passing verification stays in verify', () => {
  assert.equal(nextPhaseOnResult('verify', 'run_test', false), 'verify');
});

test('phaseDirective returns guidance for active phases, null for complete', () => {
  assert.match(phaseDirective('understand')!, /UNDERSTAND/);
  assert.match(phaseDirective('recover')!, /RECOVER/);
  assert.equal(phaseDirective('complete'), null);
});

test('resolveTokenBudget returns a positive budget for the reference model', () => {
  const budget = resolveTokenBudget('nvidia', 'nvidia/nemotron-3-super-120b-a12b');
  assert.ok(budget > 0);
});

test('estimateTokens is zero for empty messages and grows with content', () => {
  assert.equal(estimateTokens([]), 0);
  const single = estimateTokens([{ role: 'user', content: 'hello world' } as never]);
  assert.ok(single > 0);
});

test('classifyTaskGroups: explore agents stay read-only', () => {
  const groups = classifyTaskGroups('fix anything', 'explore');
  assert.ok(groups.has('exploration'));
  assert.ok(!groups.has('editing'));
});

test('classifyTaskGroups: edit verbs add the editing group', () => {
  const groups = classifyTaskGroups('fix the bug in the parser', 'build');
  assert.ok(groups.has('editing'));
});

test('classifyTaskGroups: casual conversation stays read-only', () => {
  const groups = classifyTaskGroups('hello, how are you today?', 'build');
  assert.ok(!groups.has('editing'));
  assert.ok(groups.has('exploration'));
});