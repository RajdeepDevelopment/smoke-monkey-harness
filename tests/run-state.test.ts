import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createAgent, getTodoWriteTool, allSubContextIds, AgentEventEmitter } from '../src/index.js';
import { ChatRuntime } from '../ui/src/runtime/ChatRuntime.js';
import type { ChatStreamEvent } from '../ui/src/types/stream.js';
import type { ChatTransport } from '../ui/src/types/transport.js';

const workspace = () => fs.mkdtempSync(path.join(os.tmpdir(), 'smh-state-'));
const dead = { apiKey: 'x', baseUrl: 'http://127.0.0.1:9' } as const;

/**
 * The status rail's task list and sub-contexts are run-level state. They must
 * outlive a run: a user typing the next message, a page refresh, or a reconnect
 * must not make them disappear — only the agent closing them may.
 */
describe('run state (todos + sub-contexts) outlives a run', () => {
  const todos = [
    { content: 'write tests', status: 'in_progress', priority: 'high' },
    { content: 'ship it', status: 'pending', priority: 'medium' },
  ];

  it('remembers the agent\'s task list and reports it via getRunState()', () => {
    const agent = createAgent({ workspacePath: workspace(), ...dead });
    agent.store.ensureSession('s', {});
    agent.events.emitTodoUpdated('s', 'r1', todos);
    assert.deepEqual(agent.getRunState('s').todos.map((t) => t.content), ['write tests', 'ship it']);
    assert.equal(agent.getRunState('unknown-session').todos.length, 0);
  });

  it('re-emits the task list and the open sub-contexts when the next run starts', async () => {
    const agent = createAgent({ workspacePath: workspace(), ...dead });
    agent.store.ensureSession('s', {});
    const ctxId = allSubContextIds()[0]!;
    agent.store.setSessionSnapshot('s', {
      ...(agent.store.getSession('s')!.snapshot as object | undefined),
      task: '', summary: null, coveredMessages: 0, filesRead: [], filesModified: [], decisions: [], errors: [], plan: [],
      activeSubContexts: [ctxId], activeContexts: [{ id: ctxId, title: ctxId }],
    } as never);
    agent.events.emitTodoUpdated('s', 'r1', todos);

    const seen: Array<{ type: string; data: Record<string, unknown> }> = [];
    agent.onAny((e) => void seen.push({ type: e.type, data: e.data }));
    await agent.run('next message', { sessionId: 's', runId: 'r2' });

    const t = seen.find((e) => e.type === 'todo.updated' && Array.isArray(e.data.todos) && (e.data.todos as unknown[]).length === 2);
    assert.ok(t, 'todo.updated is re-emitted at the start of the next run');
    const c = seen.find((e) => e.type === 'context.updated');
    assert.ok(c, 'context.updated is re-emitted at the start of the next run');
    assert.deepEqual((c!.data.active as Array<{ id: string }>).map((a) => a.id), [ctxId]);
  });

  it('a run that does not touch them leaves them in place', async () => {
    const agent = createAgent({ workspacePath: workspace(), ...dead });
    agent.store.ensureSession('s', {});
    agent.events.emitTodoUpdated('s', 'r1', todos);
    await agent.run('one', { sessionId: 's', runId: 'r2' });
    await agent.run('two', { sessionId: 's', runId: 'r3' });
    assert.equal(agent.getRunState('s').todos.length, 2, 'two runs later the list is still there');
  });

  it('an explicit clear is announced, so the UI does not keep a stale list', async () => {
    const events = new AgentEventEmitter();
    const seen: unknown[][] = [];
    events.on('todo.updated', (e) => void seen.push(e.data.todos as unknown[]));
    const result = await getTodoWriteTool().execute({ todos: [] }, { eventEmitter: events, sessionId: 's', runId: 'r' } as never);
    assert.match(JSON.stringify(result), /cleared/i);
    assert.deepEqual(seen, [[]]);
  });
});

describe('UI runtime keeps the rail across messages', () => {
  it('does not reset todos or contexts when the user sends the next message', async () => {
    let turn = 0;
    const transport: ChatTransport = {
      async *send(): AsyncGenerator<ChatStreamEvent> {
        turn += 1;
        yield { type: 'message:start', messageId: `a${turn}` };
        if (turn === 1) {
          yield { type: 'todos:updated', todos: [{ content: 'step one', status: 'in_progress' }] };
          yield { type: 'context:updated', active: [{ id: 'debugging', title: 'Debugging' }], count: 1, maxActive: 10 };
        }
        yield { type: 'message:complete', messageId: `a${turn}` };
      },
    };
    const rt = new ChatRuntime({ transport });
    await rt.send('first');
    assert.equal(rt.getState().todos.length, 1);
    await rt.send('second');
    await rt.send('third');
    assert.equal(rt.getState().todos.length, 1, 'todos survive later turns');
    assert.equal(rt.getState().contexts?.active.length, 1, 'sub-contexts survive later turns');
  });
});

describe('revert rewinds the rail', () => {
  it('resets todos and contexts to the state the session went back to', async () => {
    const transport: ChatTransport = {
      async *send(): AsyncGenerator<ChatStreamEvent> {
        yield { type: 'checkpoint:created', runId: 'run_1' };
        yield { type: 'message:start', messageId: 'a1' };
        yield { type: 'todos:updated', todos: [{ content: 'from the undone run', status: 'in_progress' }] };
        yield { type: 'context:updated', active: [{ id: 'x', title: 'X' }], count: 1, maxActive: 10 };
        yield { type: 'message:complete', messageId: 'a1' };
      },
      revert: async () => ({
        ok: true, runId: 'run_1', changes: { added: [], modified: [], deleted: [] },
        filesReverted: true, messagesReverted: true,
        state: { todos: [], contexts: { active: [], count: 0, maxActive: 10 } },
      }),
    };
    const rt = new ChatRuntime({ transport });
    await rt.send('go');
    assert.equal(rt.getState().todos.length, 1);
    const user = rt.getState().messages.find((m) => m.role === 'user')!;
    await rt.revertTo(user.id);
    assert.equal(rt.getState().todos.length, 0, 'the undone run\'s task list is gone');
    assert.equal(rt.getState().contexts, null, 'and its sub-contexts');
  });
});
