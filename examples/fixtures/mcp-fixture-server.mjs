/**
 * Minimal MCP stdio fixture server (JSON-RPC 2.0 lines over stdin/stdout).
 * Exposes real tools so the harness MCP client can be tested end-to-end
 * without network access or npm installs.
 *
 *   Tools:
 *     - echo({ message })      → { echoed: message }
 *     - add({ a, b })          → { sum: a + b }
 *     - list_files({ path })   → fake directory listing
 *
 * Run directly:
 *   node examples/fixtures/mcp-fixture-server.mjs
 * (It talks JSON-RPC over stdio — run it as a child from the harness config.)
 */
import * as readline from 'node:readline';
import * as fs from 'node:fs';

const toolDefs = [
  {
    name: 'echo',
    description: 'Echo the given message back unchanged — proves the server is alive.',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string', description: 'Message to echo.' } },
      required: ['message'],
    },
  },
  {
    name: 'add',
    description: 'Add two numbers and return the sum.',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First addend.' },
        b: { type: 'number', description: 'Second addend.' },
      },
      required: ['a', 'b'],
    },
  },
  {
    name: 'list_files',
    description: 'List the files in a directory on the local machine.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Directory to list.' } },
      required: ['path'],
    },
  },
];

function renderTools(list) {
  return list
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n');
}

async function handleCall(name, args) {
  switch (name) {
    case 'echo': {
      const message = String(args.message ?? '');
      return { content: [{ type: 'text', text: message ? `echo: ${message}` : '(no message)' }], isError: false };
    }
    case 'add': {
      const a = Number(args.a ?? 0);
      const b = Number(args.b ?? 0);
      return { content: [{ type: 'text', text: `sum: ${a + b}` }], isError: false };
    }
    case 'list_files': {
      const p = String(args.path ?? '.');
      let entries = [];
      try {
        entries = fs.readdirSync(p, { withFileTypes: true });
      } catch (e) {
        return { content: [{ type: 'text', text: `error listing ${p}: ${e.message}` }], isError: true };
      }
      const lines = entries.map((d) => (d.isDirectory() ? `- ${d.name}/` : `- ${d.name}`));
      return { content: [{ type: 'text', text: `${p}:\n${lines.join('\n') || '(empty)'}` }], isError: false };
    }
    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', async (rawLine) => {
  const line = rawLine.trim();
  if (!line) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (!msg || typeof msg !== 'object') return;
  if (msg.id == null) {
    // Notification — ignore.
    return;
  }
  const respond = (payload) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...payload }) + '\n');

  if (msg.method === 'initialize') {
    respond({
      result: {
        protocolVersion: msg.params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mcp-fixture-server', version: '0.0.1' },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') {
    return;
  }
  if (msg.method === 'tools/list') {
    respond({ result: { tools: toolDefs } });
    return;
  }
  if (msg.method === 'tools/call') {
    try {
      const result = await handleCall(msg.params?.name, msg.params?.arguments ?? {});
      respond({ result });
    } catch (e) {
      respond({ result: { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true } });
    }
    return;
  }
  respond({ error: { code: -32601, message: `Method not found: ${msg.method}` } });
});

process.stdout.write(''); // ensure stream is writable