/**
 * smoke-monkey-harness MCP server — guides ANY agent (Claude Code, Codex,
 * opencode, ...) to build a new looping agent on @smoke-monkey/harness.
 *
 *   Tools:
 *     - harness_guide({ topic? })          → the master instructions (guide.md)
 *     - harness_status()                   → installed library + scaffold facts
 *     - harness_scaffold({ targetDir, name? }) → generate a starter agent project
 *     - harness_examples()                 → list bundled example programs
 *     - harness_read_example({ name })     → read one example verbatim
 *
 * Dependency-free: the harness itself is optional (the guide + scaffold come
 * from this repo's plugin/ tree). Talks JSON-RPC 2.0 lines over stdio, so it
 * works wherever MCP stdio servers work.
 *
 * Run directly:
 *   node plugin/mcp/server.mjs
 */
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function bundledPath(...parts) {
  return path.join(__dirname, ...parts);
}

let cachedGuide = null;
function guideText() {
  if (cachedGuide != null) return cachedGuide;
  try {
    cachedGuide = fs.readFileSync(bundledPath('guide.md'), 'utf8');
  } catch {
    cachedGuide = 'Guide file not found.';
  }
  return cachedGuide;
}

function statusText() {
  const lines = ['smoke-monkey-harness MCP server (build-an-agent plugin)'];
  const pkgJson = bundledPath('../../package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
    lines.push(`base library: ${pkg.name} ${pkg.version}`);
  } catch {
    /* running outside the checkout — ignore */
  }
  lines.push(`guide length: ${guideText().length} chars`);
  lines.push('tools: harness_guide · harness_status · harness_scaffold · harness_examples · harness_read_example');
  lines.push('usage hint: call harness_guide first, then harness_scaffold({targetDir}) to build an agent.');
  return lines.join('\n');
}

function exampleNames() {
  const dir = bundledPath('templates', 'examples');
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .sort();
  } catch {
    return [];
  }
}

function readExample(name) {
  const safe = path.basename(String(name || ''));
  if (!safe) return { content: [{ type: 'text', text: 'error: name is required' }], isError: true };
  const p = bundledPath('templates', 'examples', safe);
  try {
    const text = fs.readFileSync(p, 'utf8');
    return { content: [{ type: 'text', text: `--- ${safe} ---\n${text}` }], isError: false };
  } catch {
    return {
      content: [{ type: 'text', text: `error: unknown example "${safe}". Available: ${exampleNames().join(', ') || '(none)'}` }],
      isError: true,
    };
  }
}

function scaffold(targetDir, name) {
  const tpl = bundledPath('templates', 'scaffold');
  const raw = String(targetDir ?? '').trim();
  const out = raw ? path.resolve(raw) : '';
  if (!raw || !out) return { content: [{ type: 'text', text: 'error: targetDir is required' }], isError: true };
  const pkgName = (String(name || '').trim() || path.basename(out) || 'my-agent')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'my-agent';

  const created = [];
  const replaceTokens = (text) => text.replace(/\{\{AGENT_NAME\}\}/g, pkgName);

  const copyTree = (from, to) => {
    if (!fs.existsSync(from)) return;
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name);
      if (entry.isDirectory()) {
        copyTree(src, dst);
      } else {
        const raw = fs.readFileSync(src, 'utf8');
        fs.writeFileSync(dst, replaceTokens(raw));
        created.push(path.relative(out, dst));
      }
    }
  };

  try {
    fs.mkdirSync(out, { recursive: true });
    copyTree(tpl, out);
    // Do not overwrite an existing .mcp.json if the target already has one.
    const mcpPath = path.join(out, '.mcp.json');
    if (!fs.existsSync(mcpPath)) {
      fs.writeFileSync(mcpPath, JSON.stringify(mcpSnippet(), null, 2) + '\n');
      created.push('.mcp.json');
    }
  } catch (e) {
    return { content: [{ type: 'text', text: `error scaffolding ${out}: ${e.message}` }], isError: true };
  }

  return {
    content: [{
      type: 'text',
      text:
        `Scaffolded agent "${pkgName}" at ${out}\n\n${created.map((f) => `- ${f}`).join('\n')}\n\n` +
        'Next: cd into it, `npm install`, set NVIDIA_API_KEY (or your provider key), then `npm run dev -- "your task"`.',
    }],
    isError: false,
  };
}

function mcpSnippet() {
  return {
    mcpServers: {
      'smoke-monkey-harness': {
        command: process.execPath,
        args: [bundledPath('server.mjs')],
      },
    },
  };
}

const toolDefs = [
  {
    name: 'harness_guide',
    description:
      'Return the master instructions for building a looping AI agent on @smoke-monkey/harness: ' +
      'the mental model, quickstart code, options, tools, sub-contexts, skills, MCP, and events. ' +
      'READ THIS FIRST. topic is optional free-text to ask a specific question about the library.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Optional: a specific question or area to focus on.' },
      },
    },
  },
  {
    name: 'harness_status',
    description:
      'Report the installed library version and the server capabilities (no args). Use to confirm the plugin works.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'harness_scaffold',
    description:
      'Generate a complete starter project for a new looping AI agent (package.json, tsconfig, src/index.ts entry point, sample skill, README, .mcp.json) into targetDir. Call this when the task is to BUILD a new agent.',
    inputSchema: {
      type: 'object',
      properties: {
        targetDir: { type: 'string', description: 'Absolute path where the project is created (created if missing).' },
        name: { type: 'string', description: 'Optional package/project name (defaults to the targetDir basename).' },
      },
      required: ['targetDir'],
    },
  },
  {
    name: 'harness_examples',
    description: 'List the bundled example agent programs (basic-agent, skills-agent, mcp-agent).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'harness_read_example',
    description: 'Return one bundled example verbatim so it can be studied or adapted.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Example filename, e.g. basic-agent.ts (from harness_examples).' },
      },
      required: ['name'],
    },
  },
];

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
  if (msg.id == null) return; // notification

  const respond = (payload) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...payload }) + '\n');

  if (msg.method === 'initialize') {
    respond({
      result: {
        protocolVersion: msg.params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'smoke-monkey-harness', version: '0.1.0' },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'ping') {
    respond({ result: {} });
    return;
  }
  if (msg.method === 'tools/list') {
    respond({ result: { tools: toolDefs } });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params?.name;
    const args = msg.params?.arguments ?? {};
    try {
      let result;
      switch (name) {
        case 'harness_guide': {
          const topic = String(args.topic ?? '').trim();
          const text = guideText();
          result = {
            content: [{
              type: 'text',
              text: topic
                ? `Topic: ${topic}\n\nNOTE: the guide is topical; search it for the relevant section.\n\n${text}`
                : text,
            }],
            isError: false,
          };
          break;
        }
        case 'harness_status':
          result = { content: [{ type: 'text', text: statusText() }], isError: false };
          break;
        case 'harness_scaffold':
          result = scaffold(args.targetDir, args.name);
          break;
        case 'harness_examples': {
          const names = exampleNames();
          result = {
            content: [{
              type: 'text',
              text: names.length
                ? `Bundled examples (${names.length}):\n${names.map((n) => `- ${n}`).join('\n')}\n\nRead one with harness_read_example({ name: "<file>.ts" }).`
                : 'No bundled examples found.',
            }],
            isError: false,
          };
          break;
        }
        case 'harness_read_example':
          result = readExample(args.name);
          break;
        default:
          result = { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
      respond({ result });
    } catch (e) {
      respond({ result: { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true } });
    }
    return;
  }
  respond({ error: { code: -32601, message: `Method not found: ${msg.method}` } });
});

process.stdout.write(''); // ensure the stream is writable