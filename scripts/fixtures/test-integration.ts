import { McpManager, SubContextManager, ToolRegistry } from '../../src/index.js';
import { resolveToolDefinitions } from '../../src/services/tool-library.js';
import { createEmptySnapshot } from '../../src/services/run-context.js';

const mcp = new McpManager([
  {
    id: 'fixture',
    name: 'fixture-mcp',
    description: 'Local fixture server',
    command: process.execPath,
    args: ['examples/fixtures/mcp-fixture-server.mjs'],
    enabled: true,
  },
]);

const manager = new SubContextManager();
manager.registerMcpServer('mcp_fixture', 'fixture-mcp', 'Local fixture server');

const registry = new ToolRegistry();
registry.register({ name: 'context_manage', description: 'manage contexts', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ output: 'ok' }) });

let defs = await resolveToolDefinitions(registry, new Set(), 'explore', mcp, manager);
const echo = defs.find((d) => d.name === 'fixture-mcp__echo');
if (echo) throw new Error('MCP tool exposed while mcp_fixture inactive (should be hidden)');
console.log('ok: MCP tool hidden while sub-context inactive');

manager.setActive(['mcp_fixture']);
defs = await resolveToolDefinitions(registry, new Set(), 'explore', mcp, manager);
const echoActive = defs.find((d) => d.name === 'fixture-mcp__echo');
if (!echoActive) throw new Error('MCP tool missing while mcp_fixture ACTIVE');
console.log('ok: exposed as', echoActive.name, '—', JSON.stringify(Object.keys(echoActive.parameters ?? {})));

const viaLoopName = 'fixture-mcp__add';
const handle = await mcp.activateServer('fixture');
const res = await handle.callTool('add', { a: 20, b: 22 });
if (!String(res.content?.[0]?.text).includes('42')) throw new Error('callTool did not sum to 42');
console.log('ok: callTool add(20,22) ->', JSON.stringify(res.content?.[0]?.text));

// Custom sub-contexts register into the shared catalog.
mcp.closeAll();