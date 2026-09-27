import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentHookRunner,
  type AfterModelCallContext,
  type AfterToolCallContext,
  type AgentHooks,
  type BeforeModelCallContext,
  type BeforeToolCallContext,
} from '../src/services/agent-hooks.js';

const RUN = { sessionId: 's1', runId: 'r1', userId: 'u1', workspacePath: '/ws' };
const MODEL_CTX: BeforeModelCallContext = {
  ...RUN,
  step: 0,
  provider: 'openai',
  model: 'gpt-5',
  messages: [{ role: 'user', content: 'hi' }],
  tools: [{ name: 'read_file', description: 'read', parameters: {} }],
};
const TOOL_CTX: BeforeToolCallContext = {
  ...RUN,
  toolCallId: 'tc1',
  toolName: 'write_file',
  input: { path: 'a.ts', content: 'x' },
};

// ── no hooks configured ──────────────────────────────────────────────────────

test('runner without hooks allows everything', async () => {
  const runner = new AgentHookRunner();
  assert.equal(runner.hasHooks, false);

  const model = await runner.beforeModelCall(MODEL_CTX);
  assert.equal(model.action, 'allow');
  assert.deepEqual((model as { value: { messages: unknown[] } }).value.messages, MODEL_CTX.messages);

  const tool = await runner.beforeToolCall(TOOL_CTX);
  assert.equal(tool.action, 'allow');
  assert.deepEqual((tool as { value: Record<string, unknown> }).value, TOOL_CTX.input);

  // after-hooks are safe no-ops
  await runner.afterModelCall({ ...RUN, step: 0, durationMs: 1 });
  await runner.afterToolCall({ ...RUN, toolCallId: 'tc1', toolName: 'write_file', input: {}, durationMs: 1, blocked: false });
});

// ── pass-through observability ───────────────────────────────────────────────

test('hooks observe model calls and see the payload that was sent', async () => {
  const seen: BeforeModelCallContext[] = [];
  const after: AfterModelCallContext[] = [];
  const runner = new AgentHookRunner({
    beforeModelCall: (ctx) => {
      seen.push(ctx);
    },
    afterModelCall: (ctx) => {
      after.push(ctx);
    },
  });

  await runner.beforeModelCall(MODEL_CTX);
  await runner.afterModelCall({ ...RUN, step: 0, response: { content: 'ok' } as never, durationMs: 42, usage: { prompt_tokens: 10, completion_tokens: 5 } });

  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0]!.messages, MODEL_CTX.messages);
  assert.equal(seen[0]!.model, 'gpt-5');
  assert.equal(after[0]!.durationMs, 42);
  assert.equal(after[0]!.usage?.prompt_tokens, 10);
});

test('afterModelCall fires for failed attempts and carries the error', async () => {
  const after: AfterModelCallContext[] = [];
  const runner = new AgentHookRunner({ afterModelCall: (ctx) => void after.push(ctx) });

  const boom = new Error('429 rate limited');
  await runner.afterModelCall({ ...RUN, step: 3, error: boom, durationMs: 7 });

  assert.equal(after[0]!.error, boom);
  assert.equal(after[0]!.response, undefined);
});

test('hooks observe tool calls, including duration and outcome', async () => {
  const before: BeforeToolCallContext[] = [];
  const after: AfterToolCallContext[] = [];
  const runner = new AgentHookRunner({
    beforeToolCall: (ctx) => void before.push(ctx),
    afterToolCall: (ctx) => void after.push(ctx),
  });

  await runner.beforeToolCall(TOOL_CTX);
  await runner.afterToolCall({
    ...RUN,
    toolCallId: 'tc1',
    toolName: 'write_file',
    input: { path: 'a.ts' },
    result: { success: true, output: 'wrote' },
    durationMs: 12,
    blocked: false,
  });

  assert.equal(before[0]!.toolName, 'write_file');
  assert.deepEqual(before[0]!.input, TOOL_CTX.input);
  assert.equal(after[0]!.result?.success, true);
  assert.equal(after[0]!.blocked, false);
});

// ── rewriting payloads ───────────────────────────────────────────────────────

test('beforeModelCall can replace the outgoing messages and tools', async () => {
  const replacement = [{ role: 'user', content: 'rewritten' }];
  const tools = [{ name: 'only_tool', description: 'd', parameters: {} }];
  const runner = new AgentHookRunner({
    beforeModelCall: () => ({ messages: replacement, tools }),
  });

  const out = await runner.beforeModelCall(MODEL_CTX);
  assert.equal(out.action, 'allow');
  const value = (out as { value: { messages: unknown[]; tools: unknown[] } }).value;
  assert.deepEqual(value.messages, replacement);
  assert.deepEqual(value.tools, tools);
});

test('beforeToolCall can rewrite the tool arguments', async () => {
  const runner = new AgentHookRunner({
    beforeToolCall: (ctx) => ({ input: { ...ctx.input, content: 'sanitized' } }),
  });

  const out = await runner.beforeToolCall(TOOL_CTX);
  assert.equal(out.action, 'allow');
  assert.equal((out as { value: Record<string, unknown> }).value.content, 'sanitized');
});

// ── blocking ─────────────────────────────────────────────────────────────────

test('beforeToolCall can deny a call with a reason', async () => {
  const runner = new AgentHookRunner({
    beforeToolCall: () => ({ block: true, reason: 'writes are disabled in CI' }),
  });

  const out = await runner.beforeToolCall(TOOL_CTX);
  assert.equal(out.action, 'block');
  assert.equal((out as { reason: string }).reason, 'writes are disabled in CI');
});

test('beforeModelCall can block, and supplies a default reason', async () => {
  const runner = new AgentHookRunner({ beforeModelCall: () => ({ block: true }) });
  const out = await runner.beforeModelCall(MODEL_CTX);
  assert.equal(out.action, 'block');
  assert.match((out as { reason: string }).reason, /beforeModelCall/);
});

// ── failure policy ───────────────────────────────────────────────────────────

test('a throwing beforeToolCall fails CLOSED (authorization must not fail open)', async () => {
  const runner = new AgentHookRunner({
    beforeToolCall: () => {
      throw new Error('authz service unreachable');
    },
  });

  const out = await runner.beforeToolCall(TOOL_CTX);
  assert.equal(out.action, 'block');
  assert.match((out as { reason: string }).reason, /authz service unreachable/);
});

test('a throwing beforeModelCall fails CLOSED', async () => {
  const runner = new AgentHookRunner({
    beforeModelCall: () => {
      throw new Error('policy engine down');
    },
  });
  const out = await runner.beforeModelCall(MODEL_CTX);
  assert.equal(out.action, 'block');
  assert.match((out as { reason: string }).reason, /policy engine down/);
});

test('a throwing after-hook is swallowed — the work already happened', async () => {
  const runner = new AgentHookRunner({
    afterModelCall: () => {
      throw new Error('metrics sink down');
    },
    afterToolCall: () => {
      throw new Error('tracer down');
    },
  });

  await runner.afterModelCall({ ...RUN, step: 0, durationMs: 1 });
  await runner.afterToolCall({ ...RUN, toolCallId: 'tc1', toolName: 'x', input: {}, durationMs: 1, blocked: false });
});

// ── async + ordering ─────────────────────────────────────────────────────────

test('hooks may be async, and run before -> after', async () => {
  const order: string[] = [];
  const hooks: AgentHooks = {
    beforeToolCall: async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('first');
    },
    afterToolCall: async () => {
      order.push('after');
    },
  };
  const runner = new AgentHookRunner(hooks);

  await runner.beforeToolCall(TOOL_CTX);
  await runner.afterToolCall({ ...RUN, toolCallId: 'tc1', toolName: 'x', input: {}, durationMs: 1, blocked: false });

  assert.deepEqual(order, ['first', 'after']);
});
