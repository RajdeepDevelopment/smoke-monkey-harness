// mcp-agent.ts — connect external MCP servers
// Tools surface as <server>__<tool> while the matching mcp_<id> sub-context is
// active. Disabled servers pause for user approval (mcp.approval_required).
import { createAgent } from 'smoke-monkey-harness';

const agent = createAgent({
  provider: process.env.PROVIDER ?? 'nvidia',
  model: process.env.MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
  apiKey: process.env.NVIDIA_API_KEY,
  workspacePath: process.cwd(),
  mcp: [
    {
      id: 'filesystem',
      name: 'fs',
      description: 'Local filesystem tools',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
      enabled: true,
    },
  ],
  autoApprove: true,
});

agent.on('mcp.approval_required', (e) => {
  agent.resolveMcpDecision((e.data as { toolCallId: string }).toolCallId, { action: 'enable', names: [] });
});

const result = await agent.run(process.argv.slice(2).join(' ') || 'Show the to-do file in the workspace.');
console.log(result.status);