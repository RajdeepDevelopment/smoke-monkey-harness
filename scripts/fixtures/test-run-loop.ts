import { createAgent } from '../../src/index.js';

// Pre-enabled + pre-activated via defaultSubContexts so the agent only has to
// call the MCP tool directly — isolates the loop<->MCP dispatch end-to-end.
const agent = createAgent({
  provider: 'nvidia',
  model: process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
  apiKey: process.env.NVIDIA_API_KEY,
  workspacePath: process.cwd(),
  mcp: [
    {
      id: 'fixture',
      name: 'fixture-mcp',
      description: 'Local fixture server (echo / add / list_files) for MCP dispatch tests.',
      command: process.execPath,
      args: ['examples/fixtures/mcp-fixture-server.mjs'],
      enabled: true,
    },
  ],
  defaultSubContexts: ['mcp_fixture'],
});

agent.on('permission.required', (e) => agent.resolvePermission(e.data.toolCallId, 'allow'));
agent.on('ask_user.required', (e) => agent.respond(e.data.toolCallId, 'Proceed.'));

console.error('=== phase-start marker ===');

const task =
  process.argv.slice(2).join(' ') ||
  'Call fixture-mcp__echo with message "hello world" and then write a file echo-result.txt containing the echoed text. ' +
  'This is an editing task — finish_task only after the file exists on disk.';

console.log(`\n> ${task}\n`);
const started = Date.now();
const result = await agent.run(task);
console.log(`\n-- run finished: ${result.status} (steps ${result.agentState?.currentStep ?? '?'}, ${((Date.now() - started) / 1000).toFixed(1)}s) --`);
console.log('agents:', JSON.stringify(agent.listMcpServers(), null, 2));
try {
  const { readFileSync } = await import('node:fs');
  const out = readFileSync('echo-result.txt', 'utf8');
  console.log('echo-result.txt ->', JSON.stringify(out));
} catch {
  console.log('echo-result.txt -> not created');
}