import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChatRuntime } from '../ui/src/runtime/ChatRuntime.js';
import { SyntheticTransport } from '../ui/src/transports/SyntheticTransport.js';
import type { ChatPrompt } from '../ui/src/types/prompt.js';

/**
 * Cross-package on purpose: `ui/` has no test runner, and the bugs these cover
 * are silent ones — a dropped event throws nothing, it just renders an empty
 * bubble, which is exactly the sort of defect that survives a code review.
 */

const parts = (m: { parts?: Array<{ type: string }> } | undefined): string[] =>
  (m?.parts ?? []).map((p) => p.type);

describe('a streamed turn lands in the message it belongs to', () => {
  it('applies every event, not just the first', async () => {
    const runtime = new ChatRuntime({
      transport: new SyntheticTransport({ tickMs: 0, includeToolCall: true }),
    });
    await runtime.send('hi');

    const assistant = runtime.messages.at(-1)!;
    assert.equal(assistant.role, 'assistant');
    // The transport names its own message; the runtime created the placeholder
    // first. If the ids disagree, the reducer finds nothing and drops the rest
    // of the turn with no error at all.
    assert.match(assistant.content, /Shadow DOM/);
    assert.equal(assistant.toolCalls?.[0]?.name, 'web_search');
    for (const expected of ['thinking', 'tool', 'artifact', 'markdown']) {
      assert.ok(
        parts(assistant).includes(expected),
        `expected a ${expected} part, got ${parts(assistant).join(',')}`,
      );
    }
  });

  it('keeps one id for the whole turn, so the finalizer finds it', async () => {
    const runtime = new ChatRuntime({ transport: new SyntheticTransport({ tickMs: 0 }) });
    await runtime.send('hi');
    const assistant = runtime.messages.at(-1)!;
    // A turn left `streaming` is what makes a "Stop" button linger forever.
    assert.equal(assistant.status, 'complete');
    assert.equal(runtime.isStreaming, false);
  });
});

describe('a run that pauses on the user', () => {
  it('suspends instead of resolving on its own, and resumes on respond()', async () => {
    const answered: string[] = [];
    const transport = new SyntheticTransport({
      tickMs: 0,
      includeToolCall: false,
      askUser: { toolCallId: 'ask_1', question: 'Which environment?' },
      onPromptAnswered: (a) => answered.push(a),
    });
    const runtime = new ChatRuntime({ transport });

    const pending = runtime.send('deploy this');
    // Let the stream run up to the question and block on it.
    await new Promise((r) => setTimeout(r, 50));

    const card = runtime.messages.at(-1)!.parts?.find((p) => p.type === 'prompt') as
      | { prompt: ChatPrompt }
      | undefined;
    assert.ok(card, 'expected a prompt part while the run is blocked');
    assert.equal(card!.prompt.status, 'pending');
    assert.equal(card!.prompt.question, 'Which environment?');

    // Still blocked: the generator has not finished, so a caller awaiting
    // `send` must not have been released. This is the deadlock this whole
    // feature exists to prevent.
    let finished = false;
    void pending.then(() => (finished = true));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(finished, false, 'the run resolved without an answer');

    transport.respond({ toolCallId: 'ask_1', kind: 'ask', answer: 'staging' });
    await pending;

    assert.deepEqual(answered, ['staging']);
    assert.equal(runtime.isStreaming, false);
  });

  it('marks the card answered without waiting for the transport', async () => {
    const transport = new SyntheticTransport({
      tickMs: 0,
      includeToolCall: false,
      askUser: { toolCallId: 'ask_1', question: 'Which environment?' },
    });
    const runtime = new ChatRuntime({ transport });
    const done = runtime.send('deploy');
    await new Promise((r) => setTimeout(r, 50));

    // Nothing has been sent yet; the card must already reflect the choice.
    runtime.resolvePrompt('ask_1', 'production');
    const card = runtime.messages.at(-1)!.parts?.find((p) => p.type === 'prompt') as
      | { prompt: ChatPrompt }
      | undefined;
    assert.equal(card!.prompt.status, 'answered');
    assert.equal(card!.prompt.answer, 'production');

    // And it is a no-op the second time, so a late echo cannot flip a settled
    // card back to pending.
    runtime.resolvePrompt('ask_1', 'something else');
    const after = runtime.messages.at(-1)!.parts?.find((p) => p.type === 'prompt') as
      | { prompt: ChatPrompt }
      | undefined;
    assert.equal(after!.prompt.answer, 'production');

    transport.respond({ toolCallId: 'ask_1', kind: 'ask', answer: 'production' });
    await done;
  });

  it('ignores an answer for a prompt that was never asked', async () => {
    // A double click, or an answer racing the end of the run, must not
    // surface as an error in the UI.
    const transport = new SyntheticTransport({ tickMs: 0 });
    assert.doesNotThrow(() =>
      transport.respond({ toolCallId: 'nope', kind: 'ask', answer: 'x' }),
    );
  });

  it('answers only the prompt that was asked when two share a run', async () => {
    const order: string[] = [];
    const transport = new SyntheticTransport({
      tickMs: 0,
      includeToolCall: false,
      askUser: { toolCallId: 'ask_1', question: 'One?' },
      requestPermission: { toolCallId: 'perm_1', toolName: 'write_file' },
      onPromptAnswered: (a) => order.push(a),
    });
    const runtime = new ChatRuntime({ transport });
    const done = runtime.send('go');

    await new Promise((r) => setTimeout(r, 50));
    // The second question cannot exist yet: a real run does not know the answer
    // to the first until it has been given.
    assert.equal(
      runtime.messages.at(-1)!.parts?.filter((p) => p.type === 'prompt').length,
      1,
    );

    // The runtime method the UI calls — the transport deliberately does NOT
    // echo an ack here, so this asserts the UI is self-sufficient rather than
    // dependent on a server round-trip it may never get.
    runtime.resolvePrompt('ask_1', 'staging');
    transport.respond({ toolCallId: 'ask_1', kind: 'ask', answer: 'staging' });
    await new Promise((r) => setTimeout(r, 50));

    const partsNow = runtime.messages.at(-1)!.parts?.filter((p) => p.type === 'prompt') ?? [];
    assert.equal(partsNow.length, 2, 'expected the chained permission prompt');
    const statuses = partsNow.map((p) => (p as { prompt: ChatPrompt }).prompt.status);
    assert.deepEqual(statuses, ['answered', 'pending']);

    runtime.resolvePrompt('perm_1', 'deny');
    transport.respond({ toolCallId: 'perm_1', kind: 'permission', answer: 'deny' });
    await done;
    assert.deepEqual(order, ['staging', 'deny']);
    // The collapsed row shows the answer, not a blank form.
    const final = runtime.messages.at(-1)!.parts?.filter((p) => p.type === 'prompt') ?? [];
    assert.deepEqual(
      final.map((p) => (p as { prompt: ChatPrompt }).prompt.status),
      ['answered', 'answered'],
    );
  });
});
