import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentLoop, type AgentLoopDeps } from '../src/services/agent-loop.js';
import { AgentHookRunner, type AfterToolCallContext, type AgentHooks } from '../src/services/agent-hooks.js';
import { AgentEventEmitter } from '../src/services/agent-event.emitter.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import type { RunContext } from '../src/services/run-context.js';
import type { LLMResponse } from '../src/services/llm-client.js';

/**
 * A blocked tool call has to tell the hook two separate things: that it failed,
 * and that it failed *by policy* rather than by crashing.
 *
 * Those two facts travelled as two adjacent optional object parameters, and the
 * call sites that passed `{ blocked: true }` put it in the wrong slot. Nothing
 * complained: `ToolHookOutcome` also has a `blocked` field, so the literal
 * satisfied both parameter types. The real outcome silently kept
 * `error: undefined` and `blocked: false` — the exact opposite of the truth, and
 * invisible until an audit/UI consumer read the outcome. So assert on the
 * observable hook payload, not on internals.
 */

const TOOL_CALL = {
  id: 'call_1',
  function: { name: 'read_file', arguments: JSON.stringify({ path: 'secret.txt' }) },
};

/** One tool call, then a plain final answer, so the loop can terminate. */
function scriptedLLM(): () => Promise<LLMResponse> {
  let turn = 0;
  return async () => {
    turn += 1;
    return turn === 1
      ? { content: null, tool_calls: [TOOL_CALL] }
      : { content: 'All done.', tool_calls: [] };
  };
}

function stubContext(): RunContext {
  return {
    sessionId: 's1',
    runId: 'r1',
    userId: 'u1',
    workspacePath: '/tmp/ws',
    projectDir: '/tmp/ws',
    agentId: 'a1',
    task: 'read the file',
    readOnlyQuery: true,
    phase: 'explore',
    exposedTools: new Set(['read_file']),
    messages: [],
    contextManager: { activeCount: 0, activeIds: [], maxActive: 0 },
    abortController: new AbortController(),
    observations: [],
    lastToolCalls: [],
    filesRead: new Set<string>(),
    filesModified: new Set<string>(),
    plan: null,
    currentStep: 0,
    inputTokens: 0,
    outputTokens: 0,
    hardStopReason: null,
  } as unknown as RunContext;
}

function deps(over: Partial<AgentLoopDeps>): AgentLoopDeps {
  const noop = async () => {};
  return {
    toolRegistry: new ToolRegistry(),
    eventEmitter: new AgentEventEmitter(),
    permissionService: { evaluate: async () => ({ effect: 'allow' } as never) },
    runService: {
      incrementStep: async () => 1,
      updateStatus: noop,
      updateTokens: noop,
      saveAgentState: noop,
    } as never,
    sessionService: { updateStatus: noop, updateTokens: noop } as never,
    messageService: { create: async () => ({ id: 'm1' }) } as never,
    compactionService: {} as never,
    createRunContext: async () => stubContext(),
    buildLLMMessages: () => [],
    appendAssistantMessage: async () => ({ id: 'm1', role: 'assistant', content: '' }) as never,
    appendToolResult: noop,
    appendSystemNote: noop,
    persistContext: noop,
    compactToolOutput: async (_w, _r, _c, out) => out,
    callLLMWithRetry: scriptedLLM() as never,
    maybeCompact: noop,
    waitForUserResponse: async () => 'yes',
    waitForPermission: async () => ({ effect: 'allow' }) as never,
    waitForMcpDecision: async () => ({ effect: 'allow' }) as never,
    persistToolStatus: noop,
    ...over,
  } as AgentLoopDeps;
}

async function runWithHook(config: AgentHooks): Promise<AfterToolCallContext[]> {
  const seen: AfterToolCallContext[] = [];
  const loop = new AgentLoop(
    deps({
      hooks: new AgentHookRunner({
        ...config,
        afterToolCall: (ctx: AfterToolCallContext) => {
          seen.push(ctx);
        },
      }),
    }),
  );
  await loop.execute({
    sessionId: 's1',
    runId: 'r1',
    userId: 'u1',
    message: 'read the file',
    workspacePath: '/tmp/ws',
    agentId: 'a1',
    abortController: new AbortController(),
  } as never);
  return seen;
}

describe('a call blocked by a beforeToolCall hook', () => {
  it('reaches the hook as blocked, with the reason attached', async () => {
    const seen = await runWithHook(
      {
        beforeToolCall: () => ({ block: true, reason: 'reads are not allowed here' }),
      },
    );

    assert.equal(seen.length, 1, 'afterToolCall must fire exactly once');
    const call = seen[0]!;
    // The two facts are the whole point of the fix.
    assert.equal(call.blocked, true, 'a policy block is not a crash');
    assert.ok(call.error, 'the outcome must carry an error, not just a flag');
    assert.match(call.error.message, /reads are not allowed here/);
    assert.equal(call.toolName, 'read_file');
  });

  it('does not call an unknown tool a policy block', async () => {
    const seen = await runWithHook({
      beforeToolCall: () => undefined,
    });

    // `read_file` is exposed but not registered. That is a soft "no such tool"
    // result the model can recover from, not a policy decision, so `blocked`
    // must stay false. Conflating the two would make a blocked-call audit
    // report phantom denials.
    assert.equal(seen.length, 1);
    const call = seen[0]!;
    assert.equal(call.blocked, false);
    assert.match(String(call.result?.output), /Unknown tool: read_file/);
  });
});
