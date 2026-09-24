/**
 * Plugin demo — another agent uses the smoke-monkey-harness MCP server to
 * build a new looping agent on this library.
 *
 * The harness agent connects to plugin/mcp/server.mjs as an MCP server; told to
 * build an agent, it reads harness_guide and calls harness_scaffold to
 * materialise a starter project. Run from the repo root so relative paths work:
 *
 *   NVIDIA_API_KEY=nvapi-... npm run demo:plugin
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createAgent } from '../src/index.js';

const targetDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'smh-agent-')), 'demo-agent');
console.log('target ->', targetDir);

const agent = createAgent({
  provider: 'nvidia',
  model: process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
  apiKey: process.env.NVIDIA_API_KEY,
  workspacePath: process.cwd(),
  autoApprove: true,
  mcp: [
    {
      id: 'smh-plugin',
      name: 'smoke-monkey-harness',
      description: 'Build-an-agent plugin for @smoke-monkey/harness (guide + scaffold).',
      command: process.execPath,
      args: [path.join(process.cwd(), 'plugin', 'mcp', 'server.mjs')],
      enabled: true,
    },
  ],
  defaultSubContexts: ['mcp_smh-plugin'],
});

agent.onAny((e) => {
  if (e.type === 'tool.completed') {
    const data = e.data as { toolCallId?: string; result?: { summary?: string | undefined } };
    console.log('[tool]', data.toolCallId, `(${String(data.result?.summary ?? '').slice(0, 80)})`);
  }
});

const result = await agent.run(
  `Build me a new looping AI agent project at ${targetDir} following the smoke-monkey-harness guide. ` +
    'Use the harness_scaffold tool to create it, then verify the scaffolded files exist on disk.',
);
console.log('\n-- run finished:', result.status);

const files = fs.existsSync(targetDir) ? fs.readdirSync(targetDir) : [];
console.log('scaffolded at', targetDir, '->', files.length ? files.join(', ') : '(no files)');
if (files.includes('src') && fs.existsSync(path.join(targetDir, 'src', 'index.ts'))) {
  console.log('src/index.ts present — agent built a new agent end-to-end.');
}