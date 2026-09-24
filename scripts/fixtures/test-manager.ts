import { McpManager } from '../../src/index.js';
import { inspect } from 'node:util';

const manager = new McpManager([
  {
    id: 'fixture',
    name: 'fixture-mcp',
    description: 'Local fixture server',
    command: process.execPath,
    args: ['examples/fixtures/mcp-fixture-server.mjs'],
    enabled: false,
  },
  {
    id: 'fixture2',
    name: 'other-mcp',
    description: 'Another local server',
    command: process.execPath,
    args: ['examples/fixtures/mcp-fixture-server.mjs'],
    enabled: true,
  },
]);

console.log('configs:', manager.configs.map((c) => `${c.id}:${c.enabled ? 'on' : 'off'}`).join(', '));

// Activating a disabled server must fail.
try {
  await manager.activateServer('fixture');
  console.log('ERROR: disabled server activated');
} catch (e) {
  console.log('ok: disabled refusal ->', (e as Error).message);
}

// Enable it, then activate + list + call tools.
manager.enable('fixture');
const handle = await manager.activateServer('fixture');
console.log('tools:', handle.tools.map((t) => t.name).join(', '));
const call = await handle.callTool('echo', { message: 'hello from harness' });
console.log('echo result:', JSON.stringify(call.content));
const sum = await handle.callTool('add', { a: 2, b: 3 });
console.log('add result:', JSON.stringify(sum.content));

// Second server should be independently active.
await manager.activateServer('fixture2');
console.log('toolServerMap:', [...manager.toolServerMap.keys()].join(', '));

console.log('describe:', inspect(manager.describe(), { depth: 3 }));

manager.closeAll();
console.log('closed handles:', manager.handles.size);
console.log('MANAGER OK');