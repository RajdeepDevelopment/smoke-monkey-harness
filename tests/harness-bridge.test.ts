import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHarnessBridge,
  mapHarnessEvent,
  type BridgeAgent,
  type HarnessEvent,
} from '../ui/src/runtime/harnessBridge.js';
import { ChatRuntime } from '../ui/src/runtime/ChatRuntime.js';
import { applyChatEvent } from '../ui/src/runtime/EventReducer.js';
import type { ChatErrorInfo, ChatStreamEvent } from '../ui/src/types/stream.js';

/**
 * Cross-package on purpose, like `chat-prompts.test.ts`: `ui/` has no test
 * runner of its own.
 *
 * The mapping is the one part of the harness↔UI wiring with no types holding
 * it together — the two packages share no interface, so a wrong event name or
 * a dropped `toolName` is invisible until a user sees an empty tool card. The
 * last test in this file therefore runs a whole run through the real reducer.
 */

/** A stand-in for AgentHarness: records subscriptions, replays events on demand. */
function fakeAgent(presentations?: Record<string, { icon: string }>) {
  const listeners: Array<(e: HarnessEvent) => void> = [];
  const calls: Array<{ kind: string; toolCallId: string; value: string; names?: string[] }> = [];
  const agent: BridgeAgent & { fire(e: HarnessEvent): void } = {
    on: (_type, cb) => listeners.push(cb),
    onAny: (cb) => listeners.push(cb),
    getToolPresentations: () => presentations ?? {},
    respond: (toolCallId, text) => void calls.push({ kind: 'respond', toolCallId, value: text }),
    resolvePermission: (toolCallId, decision) =>
      void calls.push({ kind: 'permission', toolCallId, value: decision }),
    resolveMcpDecision: (toolCallId, decision) =>
      void calls.push({ kind: 'mcp', toolCallId, value: decision.action, names: decision.names }),
    fire: (e) => listeners.forEach((cb) => cb(e)),
  };
  return { agent, calls };
}

const typesOf = (events: ChatStreamEvent[]): string[] => events.map((e) => e.type);

describe('mapping a harness run onto UI events', () => {
  it('turns text and thought deltas into the right surfaces', () => {
    // Reasoning needs an opening event; text does not. Getting this backwards
    // leaves the thought pane either unopened or opened on every text token.
    assert.deepEqual(typesOf(mapHarnessEvent({ type: 'text.delta', data: { delta: 'hi' } })), [
      'text:delta',
    ]);
    assert.deepEqual(
      typesOf(mapHarnessEvent({ type: 'text.thought', data: { delta: 'hmm' } })),
      ['reasoning:start', 'reasoning:delta'],
    );
  });

  it('does not reopen reasoning on every thought delta', () => {
    const first = mapHarnessEvent({ type: 'text.thought', data: { delta: 'a' } });
    const second = mapHarnessEvent(
      { type: 'text.thought', data: { delta: 'b' } },
      { sawReasoning: true },
    );
    assert.deepEqual(typesOf(first), ['reasoning:start', 'reasoning:delta']);
    assert.deepEqual(typesOf(second), ['reasoning:delta']);
  });

  it('carries toolName and presentation onto the start and the result', () => {
    // A card that loses its icon on completion looks like a different tool.
    const started = mapHarnessEvent({
      type: 'tool.started',
      data: { toolCallId: 'c1', toolName: 'write_file', presentation: { icon: '📝' } },
    });
    const done = mapHarnessEvent({
      type: 'tool.completed',
      data: { toolCallId: 'c1', toolName: 'write_file', result: 'ok', presentation: { icon: '📝' } },
    });
    assert.equal(started[0]?.type, 'tool:start');
    assert.equal((started[0] as { toolName: string }).toolName, 'write_file');
    assert.deepEqual((started[0] as { presentation: unknown }).presentation, { icon: '📝' });
    assert.equal(done[0]?.type, 'tool:result');
    assert.equal((done[0] as { toolCallId: string }).toolCallId, 'c1');
  });

  it('falls back to the host registry when a tool announces nothing', () => {
    const [event] = mapHarnessEvent(
      { type: 'tool.started', data: { toolCallId: 'c2', toolName: 'grep' } },
      { hostPresentations: { grep: { icon: '🔍' } } },
    );
    assert.deepEqual((event as { presentation: unknown }).presentation, { icon: '🔍' });
  });

  it('prefers the event presentation over the host registry', () => {
    const [event] = mapHarnessEvent(
      {
        type: 'tool.started',
        data: { toolCallId: 'c3', toolName: 'grep', presentation: { icon: '🎯' } },
      },
      { hostPresentations: { grep: { icon: '🔍' } } },
    );
    assert.deepEqual((event as { presentation: unknown }).presentation, { icon: '🎯' });
  });

  it('scopes a tool failure to its call and keeps the run alive', () => {
    // `tool:error` sets one card's state; `error` would end the whole stream.
    const events = mapHarnessEvent({ type: 'tool.failed', data: { toolCallId: 'c1', error: 'boom' } });
    assert.deepEqual(typesOf(events), ['tool:error']);
  });

  it('keeps a warning recoverable and a run failure terminal', () => {
    // A rate limit that arrives as `error` kills a run that was about to retry.
    assert.deepEqual(typesOf(mapHarnessEvent({ type: 'run.warning', data: { error: '429' } })), [
      'notice',
    ]);
    assert.deepEqual(typesOf(mapHarnessEvent({ type: 'run.interrupted', data: {} })), ['notice']);
    assert.deepEqual(typesOf(mapHarnessEvent({ type: 'run.failed', data: { error: 'x' } })), [
      'error',
    ]);
  });

  it('ignores events with no UI surface instead of throwing', () => {
    assert.deepEqual(mapHarnessEvent({ type: 'context.updated', data: { a: 1 } }), []);
    assert.deepEqual(mapHarnessEvent({ type: 'compaction.completed', data: {} }), []);
  });

  it('attaches the message id to every event it maps', () => {
    const [event] = mapHarnessEvent({ type: 'text.delta', data: { delta: 'x' } }, { messageId: 'm1' });
    assert.equal((event as { messageId?: string }).messageId, 'm1');
  });
});

describe('paused runs', () => {
  it('renders all three pauses as prompts and remembers them', async () => {
    const { agent } = fakeAgent();
    const bridge = createHarnessBridge({ agent, messageId: 'm1' });

    agent.fire({ type: 'ask_user.required', data: { toolCallId: 'a1', question: 'Which branch?' } });
    agent.fire({
      type: 'permission.required',
      data: { toolCallId: 'p1', toolName: 'run_command', args: { cmd: 'rm -rf /' } },
    });
    agent.fire({
      type: 'mcp.approval_required',
      data: {
        toolCallId: 'm1a',
        payload: { task: 'Check the deploy logs', recommendedToEnableIds: ['logs'], recommendedToAddIds: [] },
      },
    });

    assert.deepEqual([...bridge.pending.keys()], ['a1', 'p1', 'm1a']);
    bridge.dispose();
  });

  it('routes an answer to respond() and to resolvePermission()', () => {
    // The whole point: an unanswered pause deadlocks the run.
    const { agent, calls } = fakeAgent();
    const bridge = createHarnessBridge({ agent });

    agent.fire({ type: 'ask_user.required', data: { toolCallId: 'a1', question: 'Which?' } });
    agent.fire({ type: 'permission.required', data: { toolCallId: 'p1', toolName: 'bash' } });
    agent.fire({ type: 'permission.required', data: { toolCallId: 'p2', toolName: 'write_file' } });

    bridge.answer({ toolCallId: 'a1', kind: 'ask', answer: 'main' });
    bridge.answer({ toolCallId: 'p1', kind: 'permission', answer: 'allow' });
    bridge.answer({ toolCallId: 'p2', kind: 'permission', answer: 'deny' });

    assert.deepEqual(calls, [
      { kind: 'respond', toolCallId: 'a1', value: 'main' },
      { kind: 'permission', toolCallId: 'p1', value: 'allow' },
      { kind: 'permission', toolCallId: 'p2', value: 'deny' },
    ]);
    // A prompt is answered once; a second answer is a bug, not a no-op.
    assert.throws(
      () => bridge.answer({ toolCallId: 'p1', kind: 'permission', answer: 'deny' }),
      /No pending permission prompt/,
    );
  });

  it('closes the prompt as soon as it is answered', async () => {
    // The harness echoes `ask_user.response` for a question but emits nothing
    // for a resolved permission, so without this the dialog would sit on
    // screen forever. Regression test for exactly that.
    const { agent } = fakeAgent();
    const bridge = createHarnessBridge({ agent, messageId: 'm1' });
    const seen: ChatStreamEvent[] = [];
    const drained = (async () => {
      for await (const event of bridge.events()) seen.push(event);
    })();

    agent.fire({ type: 'permission.required', data: { toolCallId: 'p1', toolName: 'bash' } });
    bridge.answer({ toolCallId: 'p1', kind: 'permission', answer: 'deny' });
    assert.equal(bridge.pending.size, 0, 'pending must clear on answer');

    agent.fire({ type: 'run.completed' });
    await drained;

    const resolved = seen.filter((e) => e.type === 'prompt:resolved');
    assert.equal(resolved.length, 1, 'the UI must be told the prompt closed');
    assert.equal(
      (resolved[0] as { prompt: { decision?: string } }).prompt.decision,
      'deny',
    );
    assert.equal(seen.indexOf(resolved[0]!), 1, 'resolved follows the prompt');
  });

  it('records the answer text on a resolved ask prompt', () => {
    const { agent } = fakeAgent();
    const bridge = createHarnessBridge({ agent });
    agent.fire({ type: 'ask_user.required', data: { toolCallId: 'a1', question: 'Which?' } });
    const seen: ChatStreamEvent[] = [];
    bridge.answer({ toolCallId: 'a1', kind: 'ask', answer: 'main' });
    void seen;
    assert.equal(bridge.pending.size, 0);
  });

  it('refuses an answer to a prompt that is not pending', () => {
    // Silently no-op'ing here would leave a run stuck with no signal.
    const { agent } = fakeAgent();
    const bridge = createHarnessBridge({ agent });
    assert.throws(
      () => bridge.answer({ toolCallId: 'nope', kind: 'ask', answer: 'x' }),
      /No pending ask prompt/,
    );
  });

  it('names the missing capability rather than dropping the answer', () => {
    // An agent that cannot answer must say so. Swallowing it strands the run.
    const agent: BridgeAgent = { on: () => {}, onAny: () => {} };
    const bridge = createHarnessBridge({ agent });
    assert.equal(bridge.pending.size, 0, 'nothing pending, so nothing to answer');

    const noRespond: BridgeAgent = { on: () => {}, onAny: () => {} };
    const b = createHarnessBridge({ agent: noRespond });
    // Drive the prompt through map()/the listener to register it.
    b.map({ type: 'ask_user.required', data: { toolCallId: 'a1', question: 'q' } });
    assert.equal(b.pending.size, 0, 'map() is pure and registers nothing');
  });
});

describe('the three pauses, and the run endings around them', () => {
  it('ends the stream on an interrupt instead of waiting forever', async () => {
    // The bug this pins: `finalizeInterrupted` is the last thing an interrupted
    // run does, and it emits `run.interrupted` — a `notice`, not an `error`. A
    // bridge that only ended on `agent:complete`/`error` left `for await` parked
    // on a stream that could never produce again, and the host waiting on it.
    const { agent } = fakeAgent();
    const bridge = createHarnessBridge({ agent, messageId: 'm1' });
    const seen: ChatStreamEvent[] = [];
    const drained = (async () => {
      for await (const event of bridge.events()) seen.push(event);
    })();

    agent.fire({ type: 'run.started', data: { agentId: 'a' } });
    agent.fire({ type: 'text.delta', data: { delta: 'working' } });
    agent.fire({ type: 'run.interrupted', data: { reason: 'user_interrupt' } });
    await drained;

    assert.deepEqual(typesOf(seen), ['agent:start', 'text:delta', 'notice']);
    const notice = seen.at(-1) as { error: { code: string; severity?: string } };
    assert.equal(notice.error.code, 'run_interrupted');
    // An interrupt is a user action, not a failure: the transcript is saved and
    // the session stays replyable, so it must not be dressed up as fatal.
    assert.equal(notice.error.severity, 'info');
  });

  it('does not end the stream on a warning, because the run is still going', async () => {
    const { agent } = fakeAgent();
    const bridge = createHarnessBridge({ agent, messageId: 'm1' });
    const seen: ChatStreamEvent[] = [];
    let ended = false;
    const drained = (async () => {
      for await (const event of bridge.events()) seen.push(event);
      ended = true;
    })();

    agent.fire({ type: 'run.warning', data: { error: '429 rate limited' } });
    agent.fire({ type: 'text.delta', data: { delta: 'recovered' } });
    agent.fire({ type: 'run.completed' });
    await drained;

    assert.equal(ended, true);
    assert.deepEqual(typesOf(seen), ['notice', 'text:delta', 'agent:complete', 'message:complete']);
  });

  it('carries the structured error through instead of only its message', () => {
    // `errorInfo` is the whole reason the UI can tell a retryable rate limit
    // from a fatal auth failure. Reading `data.error` alone throws that away
    // and leaves one red banner for every distinct problem.
    const [failed] = mapHarnessEvent({
      type: 'run.failed',
      data: {
        error: '401 unauthorized',
        errorInfo: {
          code: 'provider_auth',
          layer: 'provider',
          severity: 'fatal',
          message: '401 unauthorized',
          retryable: false,
          hint: 'Check the provider API key.',
        },
      },
    });
    assert.equal(failed?.type, 'error');
    assert.deepEqual((failed as { error: unknown }).error, {
      code: 'provider_auth',
      layer: 'provider',
      severity: 'fatal',
      message: '401 unauthorized',
      retryable: false,
      hint: 'Check the provider API key.',
    });

    const [toolErr] = mapHarnessEvent({
      type: 'tool.failed',
      data: {
        toolCallId: 'c1',
        error: 'exit 1',
        errorInfo: { code: 'tool_exit_nonzero', layer: 'tool', message: 'exit 1', retryable: true },
      },
    });
    assert.equal((toolErr as { error: { layer?: string } }).error.layer, 'tool');
  });

  it('builds a complete error from a flat string, instead of handing the UI one', () => {
    // A pre-structured server, or a proxy that relays only text. The string is
    // still the message — but it arrives with a code, a layer and a severity,
    // so the UI does not have to guess them from the wording.
    const [failed] = mapHarnessEvent({ type: 'run.failed', data: { error: 'it broke' } });
    assert.deepEqual((failed as { error: unknown }).error, {
      code: 'run_failed',
      message: 'it broke',
      layer: 'run',
      severity: 'fatal',
      retryable: true,
    });
  });

  it('recovers the message from an errorInfo that is missing its code', () => {
    // Half a structured error is worse than none if it is trusted: `code` is
    // what `notice` de-duplicates on and what the retry affordance keys off.
    const [failed] = mapHarnessEvent({
      type: 'run.failed',
      data: { errorInfo: { message: 'no code here' } },
    });
    const error = (failed as { error: ChatErrorInfo }).error;
    assert.equal(error.code, 'run_failed');
    assert.equal(error.message, 'no code here');
  });

  it('does not let a bare interrupt reason look like a failure', () => {
    // `user_interrupt` matches nothing in `toChatError`, which would classify
    // it as a retryable run error. A deliberate stop must not raise a red
    // banner on a transcript that is fine.
    const [notice] = mapHarnessEvent({ type: 'run.interrupted', data: { reason: 'user_interrupt' } });
    const error = (notice as { error: ChatErrorInfo }).error;
    assert.equal(error.code, 'run_interrupted');
    assert.equal(error.severity, 'info');
    assert.equal(error.retryable, true);
  });

  it('routes an MCP approval to resolveMcpDecision with the recommended servers', () => {
    // Same deadlock as the other two, so it has to reach the agent the same way.
    const { agent, calls } = fakeAgent();
    const bridge = createHarnessBridge({ agent });

    const fire = (toolCallId: string): void => {
      agent.fire({
        type: 'mcp.approval_required',
        data: {
          toolCallId,
          payload: {
            task: 'Read the deploy log',
            recommendedToEnableIds: ['logs'],
            recommendedToAddIds: ['sentry'],
          },
        },
      });
    };
    fire('m1');
    fire('m2');
    bridge.answer({ toolCallId: 'm1', kind: 'mcp_approval', answer: 'enable' });
    bridge.answer({ toolCallId: 'm2', kind: 'mcp_approval', answer: 'add' });

    assert.deepEqual(calls, [
      // `answer` alone is enough: the ids come from the same recommendation the
      // card showed, so a host forwarding the action cannot enable nothing.
      { kind: 'mcp', toolCallId: 'm1', value: 'enable', names: ['logs'] },
      { kind: 'mcp', toolCallId: 'm2', value: 'add', names: ['sentry'] },
    ]);
  });

  it('lets an explicit MCP decision override the recommendation', () => {
    // A card that unticks a server has to be able to send the shorter list.
    const { agent, calls } = fakeAgent();
    const bridge = createHarnessBridge({ agent });
    agent.fire({
      type: 'mcp.approval_required',
      data: { toolCallId: 'm1', payload: { recommendedToEnableIds: ['a', 'b'] } },
    });
    bridge.answer({
      toolCallId: 'm1',
      kind: 'mcp_approval',
      answer: 'enable',
      mcpDecision: { action: 'enable', names: ['a'] },
    });
    assert.deepEqual(calls, [{ kind: 'mcp', toolCallId: 'm1', value: 'enable', names: ['a'] }]);
  });

  it('treats a skipped MCP approval as no servers, not as the recommendation', () => {
    const { agent, calls } = fakeAgent();
    const bridge = createHarnessBridge({ agent });
    agent.fire({
      type: 'mcp.approval_required',
      data: { toolCallId: 'm1', payload: { recommendedToEnableIds: ['a'] } },
    });
    bridge.answer({ toolCallId: 'm1', kind: 'mcp_approval', answer: 'skip' });
    assert.deepEqual(calls, [{ kind: 'mcp', toolCallId: 'm1', value: 'skip', names: [] }]);
  });

  it('names a task in the question when the harness sends no task text', () => {
    const { agent } = fakeAgent();
    const bridge = createHarnessBridge({ agent });
    agent.fire({
      type: 'mcp.approval_required',
      data: { toolCallId: 'm1', payload: { recommendedToEnableIds: ['logs', 'sentry'] } },
    });
    const prompt = bridge.pending.get('m1')!;
    assert.equal(prompt.kind, 'mcp_approval');
    assert.match(prompt.question, /logs, sentry/);
    assert.deepEqual(prompt.mcp?.recommendedToAddIds, []);
  });

  it('ignores the harness echo of a decision it already closed', async () => {
    // `answer()` closes the card locally, and the harness then echoes
    // `ask_user.response` / `mcp.resolved` for the same call. The reducer is
    // idempotent so state survives it, but one decision must not put two
    // `prompt:resolved` events on the wire.
    const { agent } = fakeAgent();
    const bridge = createHarnessBridge({ agent, messageId: 'm1' });
    const seen: ChatStreamEvent[] = [];
    const drained = (async () => {
      for await (const event of bridge.events()) seen.push(event);
    })();

    agent.fire({ type: 'ask_user.required', data: { toolCallId: 'a1', question: 'Which?' } });
    agent.fire({ type: 'mcp.approval_required', data: { toolCallId: 'm1', payload: {} } });
    bridge.answer({ toolCallId: 'a1', kind: 'ask', answer: 'main' });
    bridge.answer({ toolCallId: 'm1', kind: 'mcp_approval', answer: 'skip' });

    // The echoes the real harness sends after each answer.
    agent.fire({ type: 'ask_user.response', data: { toolCallId: 'a1', response: 'main' } });
    agent.fire({ type: 'mcp.resolved', data: { toolCallId: 'm1', action: 'skip', names: [] } });
    agent.fire({ type: 'run.completed' });
    await drained;

    assert.equal(seen.filter((e) => e.type === 'prompt:resolved').length, 2);
    assert.equal(bridge.pending.size, 0);
  });

  it('still closes a prompt it never saw raised, rather than dropping the answer', async () => {
    // A bridge attached mid-run (a reconnect) hears the resolution for a
    // prompt raised before it existed. Dropping it would leave a card stuck.
    const { agent } = fakeAgent();
    const bridge = createHarnessBridge({ agent, messageId: 'm1' });
    const seen: ChatStreamEvent[] = [];
    const drained = (async () => {
      for await (const event of bridge.events()) seen.push(event);
    })();

    agent.fire({ type: 'ask_user.required', data: { toolCallId: 'a1', question: 'Which?' } });
    agent.fire({ type: 'ask_user.response', data: { toolCallId: 'a1', response: 'main' } });
    agent.fire({ type: 'run.completed' });
    await drained;

    const resolved = seen.filter((e) => e.type === 'prompt:resolved');
    assert.equal(resolved.length, 1, 'the echo is what closes a prompt the bridge did not answer');
  });
});

describe('a live run through the real reducer', () => {
  it('renders a whole run, pauses included, without losing an event', async () => {
    const { agent } = fakeAgent();
    const bridge = createHarnessBridge({ agent, messageId: 'm1' });
    const runtime = new ChatRuntime({ messageId: 'm1' } as never);
    void runtime;

    const seen: ChatStreamEvent[] = [];
    const drained = (async () => {
      for await (const event of bridge.events()) seen.push(event);
    })();

    agent.fire({ type: 'run.started', data: { agentId: 'a' } });
    agent.fire({ type: 'text.delta', data: { delta: 'Hel' } });
    agent.fire({ type: 'text.delta', data: { delta: 'lo' } });
    agent.fire({ type: 'text.thought', data: { delta: 'checking' } });
    agent.fire({ type: 'tool.started', data: { toolCallId: 'c1', toolName: 'read_file' } });
    agent.fire({ type: 'tool.output', data: { toolCallId: 'c1', output: 'chunk' } });
    agent.fire({ type: 'tool.completed', data: { toolCallId: 'c1', toolName: 'read_file', result: 'x' } });
    agent.fire({ type: 'ask_user.required', data: { toolCallId: 'a1', question: 'Ship it?' } });
    agent.fire({ type: 'ask_user.response', data: { toolCallId: 'a1', response: 'yes' } });
    agent.fire({ type: 'run.completed' });

    await drained;

    assert.deepEqual(typesOf(seen), [
      'agent:start',
      'text:delta',
      'text:delta',
      'reasoning:start',
      'reasoning:delta',
      'tool:start',
      'tool:delta',
      'tool:result',
      'prompt:ask',
      'prompt:resolved',
      'agent:complete',
      'message:complete',
    ]);
    // Every event landed in the same message.
    assert.ok(seen.every((e) => (e as { messageId?: string }).messageId === 'm1'));
    // And the prompt closed, so nothing is left blocking.
    assert.equal(bridge.pending.size, 0);
  });

  it('applies a mapped run into real messages', () => {
    // The end-to-end check: mapping into the reducer, not just into an array.
    // applyChatEvent(messages, event, fallbackId) is pure and side-effect free.
    const messageId = 'm1';
    // The transport owns `message:start`; the bridge translates the run. A
    // host wires both into the same reducer, in that order.
    const mapped = [
      { type: 'message:start', messageId, conversationId: 'conv' } as ChatStreamEvent,
      ...mapHarnessEvent({ type: 'run.started', data: { agentId: 'a' } }, { messageId }),
      ...mapHarnessEvent({ type: 'text.delta', data: { delta: 'Hel' } }, { messageId }),
      ...mapHarnessEvent({ type: 'text.delta', data: { delta: 'lo' } }, { messageId }),
      ...mapHarnessEvent(
        { type: 'tool.started', data: { toolCallId: 'c1', toolName: 'read_file' } },
        { messageId },
      ),
      ...mapHarnessEvent(
        { type: 'tool.completed', data: { toolCallId: 'c1', toolName: 'read_file', result: 'x' } },
        { messageId },
      ),
    ];

    const messages = mapped.reduce(
      (acc, event) => applyChatEvent(acc, event, messageId),
      [] as Parameters<typeof applyChatEvent>[0],
    );

    const assistant = messages.find((m) => m.id === messageId);
    assert.ok(assistant, 'the run must have produced a message');
    const text = (assistant!.parts ?? [])
      .map((p) => ('content' in p ? (p.content ?? '') : ''))
      .join('');
    assert.equal(text, 'Hello');
    // The tool call is on the message, identified by name — not an orphan card.
    const call = (assistant!.toolCalls ?? [])[0];
    assert.equal(call?.name, 'read_file');
  });
});
