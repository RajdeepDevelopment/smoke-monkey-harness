import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentLoop, type AgentLoopDeps } from '../src/services/agent-loop.js';
import { AgentEventEmitter } from '../src/services/agent-event.emitter.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import type { RunContext } from '../src/services/run-context.js';
import type { LLMResponse } from '../src/services/llm-client.js';
import type { ToolDefinition } from '../src/tools/tool-registry.js';
import { buildSystemPrompt } from '../src/lib/system-prompt.js';

/**
 * The MCP stock search (`inspect_mcp_stock`) is an OPT-IN discovery tool.
 *
 * Two behaviours are locked here:
 *
 *  1. It NEVER pauses the run. It used to auto-pause the moment it surfaced a
 *     recommendation, which meant a read-only listing could hijack every run
 *     with a popup. The only deliberate consent path is `request_mcp_approval`,
 *     which the model calls when IT decides a server is genuinely required.
 *  2. The prompt only teaches the model to search the stock catalog when the
 *     tool is actually exposed. Telling a model to call a tool that is not
 *     registered produces hallucinated calls and stall loops, so the search
 *     doctrine is gated on the same flag that registers the tool.
 */

/** A tool that returns the payload the real stock tool returns. */
function stockLikeTool(name: string): ToolDefinition {
  return {
    name,
    description: `stub ${name}`,
    inputSchema: { type: 'object', properties: { task: { type: 'string' } } },
    annotations: { readOnlyHint: true },
    execute: async () => ({
      success: true,
      output: 'configured server(s): mcp_postgres',
      summary: '1 configured server(s), 1 to enable',
      data: {
        task: 'query postgres',
        servers: [{ id: 'postgres', name: 'postgres', enabled: false }],
        recommendedToEnableIds: ['postgres'],
        recommendedToAddIds: [] as string[],
      },
    }),
  };
}

function scriptedLLM(toolName: string): () => Promise<LLMResponse> {
  let turn = 0;
  return async () => {
    turn += 1;
    return turn === 1
      ? { content: null, tool_calls: [{ id: 'call_1', function: { name: toolName, arguments: '{}' } }] }
      : { content: 'All done.', tool_calls: [] };
  };
}

function stubContext(exposed: string[]): RunContext {
  return {
    sessionId: 's1',
    runId: 'r1',
    userId: 'u1',
    workspacePath: '/tmp/ws',
    projectDir: '/tmp/ws',
    agentId: 'a1',
    task: 'query postgres',
    readOnlyQuery: true,
    phase: 'explore',
    exposedTools: new Set(exposed),
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
    mcpAskedServerIds: new Set<string>(),
  } as unknown as RunContext;
}

/** Runs one tool call through the loop and reports whether it paused. */
async function pauseCountFor(toolName: string): Promise<number> {
  const registry = new ToolRegistry();
  registry.register(stockLikeTool(toolName));

  const eventEmitter = new AgentEventEmitter();
  let approvals = 0;
  eventEmitter.on('mcp.approval_required', () => {
    approvals += 1;
  });

  const noop = async () => {};
  const loop = new AgentLoop({
    toolRegistry: registry,
    eventEmitter,
    permissionService: { evaluate: async () => ({ effect: 'allow' } as never) },
    runService: { incrementStep: async () => 1, updateStatus: noop, updateTokens: noop, saveAgentState: noop } as never,
    sessionService: { updateStatus: noop, updateTokens: noop } as never,
    messageService: { create: async () => ({ id: 'm1' }) } as never,
    compactionService: {} as never,
    createRunContext: async () => stubContext([toolName]),
    buildLLMMessages: () => [],
    appendAssistantMessage: async () => ({ id: 'm1', role: 'assistant', content: '' }) as never,
    appendToolResult: noop,
    appendSystemNote: noop,
    persistContext: noop,
    compactToolOutput: async (_w, _r, _c, out) => out,
    callLLMWithRetry: scriptedLLM(toolName) as never,
    maybeCompact: noop,
    waitForUserResponse: async () => 'yes',
    waitForPermission: async () => ({ effect: 'allow' } as never),
    waitForMcpDecision: async () => ({ action: 'enable', names: ['postgres'] } as never),
    persistToolStatus: noop,
  } as unknown as AgentLoopDeps);

  await loop.execute({
    sessionId: 's1',
    runId: 'r1',
    userId: 'u1',
    message: 'query postgres',
    workspacePath: '/tmp/ws',
    agentId: 'a1',
    abortController: new AbortController(),
  } as never);

  return approvals;
}

describe('MCP stock search is opt-in and never hijacks the run', () => {
  it('does NOT pause when the model inspects the MCP stock', async () => {
    // The tool returns a recommendation, which used to be enough to open a
    // popup and stop the run. A read-only listing must not be able to do that:
    // the model has to decide for itself that a server is needed.
    const approvals = await pauseCountFor('inspect_mcp_stock');
    assert.equal(approvals, 0, 'inspect_mcp_stock must never open the approval pause');
  });

  it('still pauses on an explicit request_mcp_approval', async () => {
    // Removing the stock trigger must not remove the deliberate consent path.
    const approvals = await pauseCountFor('request_mcp_approval');
    assert.equal(approvals, 1, 'request_mcp_approval is the one deliberate consent pause');
  });
});

describe('the stock-search prompt doctrine is gated on the same flag', () => {
  it('teaches the model to search when the tool is exposed', async () => {
    const prompt = await buildSystemPrompt('build', '/tmp/ws', '/tmp/ws', { mcpStockSearch: true });
    assert.match(prompt, /inspect_mcp_stock/, 'search instruction must be present when enabled');
  });

  it('says nothing about searching when the tool is not exposed', async () => {
    const prompt = await buildSystemPrompt('build', '/tmp/ws', '/tmp/ws', {});
    assert.doesNotMatch(
      prompt,
      /inspect_mcp_stock/,
      'a prompt must never instruct a tool the model cannot call',
    );
  });
});
