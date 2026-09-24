/**
 * MCP + custom sub-context demo.
 *
 * Runs an agent against a local MCP server (examples/fixtures/mcp-fixture-server.mjs)
 * that exposes echo / add / list_files over stdio JSON-RPC. The server is
 * configured but DISABLED, so the agent has to inspect it, request approval,
 * and (after we auto-approve) activate the mcp_fixture sub-context before its
 * tools appear as fixture-mcp__<tool>.
 *
 *   NVIDIA_API_KEY=nvapi-... npm run demo
 *
 * (Provider defaults to NVIDIA Hosted NIM; override with NVIDIA_MODEL. The
 * model needs tool support, e.g. nvidia/nemotron-3-super-120b-a12b.)
 */
import { createAgent } from '../src/index.js';

const agent = createAgent({
  provider: 'nvidia',
  model: process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
  apiKey: process.env.NVIDIA_API_KEY,
  workspacePath: process.cwd(),
  // Start disabled so the request_mcp_approval / enable flow is exercised.
  mcp: [
    {
      id: 'fixture',
      name: 'fixture-mcp',
      description: 'Local fixture server for MCP protocol tests (echo / add / list_files over stdio).',
      command: process.execPath,
      args: ['examples/fixtures/mcp-fixture-server.mjs'],
      enabled: false,
    },
  ],
  // A custom user-owned sub-context, registered at init like the built-ins.
  subContexts: [
    {
      id: 'fixture_guide',
      title: 'Fixture MCP guide',
      summary: 'Everyday arithmetic and echo tests should use the fixture MCP server tools.',
      content:
        'The fixture MCP server (mcp_fixture) exposes echo(message), add(a, b) and list_files(path). ' +
        'Use its tools for simple arithmetic and echo round-trips instead of guessing.',
    },
  ],
});

agent.on('permission.required', (e) => agent.resolvePermission(e.data.toolCallId, 'allow'));
agent.on('ask_user.required', (e) => {
  console.log(`\n[ask_user] ${e.data.question}`);
  agent.respond(e.data.toolCallId, 'Proceed with whatever makes sense.');
});
agent.on('mcp.approval_required', (e) => {
  console.log(`\n[mcp.approval_required] enable ${JSON.stringify(e.data.payload.recommendedToEnableIds)}`);
  agent.resolveMcpDecision(e.data.toolCallId, { action: 'enable', names: e.data.payload.recommendedToEnableIds });
});
agent.on('mcp.resolved', (e) => console.log(`[mcp.resolved] ${e.data.action} ${JSON.stringify(e.data.names)}`));
agent.on('tool.completed', (e) => {
  const r = e.data.result as { output?: string } | undefined;
  console.log(`[tool] ${e.data.toolCallId.slice(0, 8)} ${String(r?.output ?? '').slice(0, 80)}`);
});
agent.on('tool.failed', (e) => console.log(`[tool] FAIL ${e.data.toolName}: ${String(e.data.error).slice(0, 120)}`));

const task =
  process.argv.slice(2).join(' ') ||
  'Use the fixture MCP server to produce a file. Inspect configured servers with inspect_mcp_stock; the fixture server is disabled, so ' +
  'request_mcp_approval to enable mcp_fixture; then activate the mcp_fixture sub-context with context_manage; ' +
  'then call fixture-mcp__echo with message "hello from harness"; finally write the echoed text into a file named echo-result.txt. ' +
  'Create the echo-result.txt file — this is an editing task, finish_task only after the file exists.';

console.log(`\n> ${task}\n`);

const started = Date.now();
const result = await agent.run(task);
console.log(`\n-- run finished: ${result.status} (steps ${result.agentState?.currentStep ?? '?'}, ${((Date.now() - started) / 1000).toFixed(1)}s) --`);
console.log(`\nMCP servers: ${JSON.stringify(agent.listMcpServers(), null, 2)}`);