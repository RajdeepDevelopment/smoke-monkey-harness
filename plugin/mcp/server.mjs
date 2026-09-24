/**
 * smoke-monkey-harness MCP server — guides ANY agent (Claude Code, Codex,
 * opencode, ...) to build a new looping agent on smoke-monkey-harness.
 *
 *   Tools:
 *     - harness_guide({ topic? })          → the master instructions (guide.md)
 *     - harness_plan({ goal })             → build a concrete plan for a product goal
 *     - harness_api({ area? })             → authoritative API reference (reference.md)
 *     - harness_guide_<feature>()          → deep per-feature guides: subcontexts,
 *       skills, mcp, providers, tools, loop, permissions, storage, events
 *     - harness_events()                   → the event catalog (UI wiring)
 *     - harness_status()                   → installed library + scaffold facts
 *     - harness_scaffold({ targetDir, name? }) → generate a starter agent project
 *     - harness_examples()                 → list bundled example programs
 *     - harness_read_example({ name })     → read one example verbatim
 *     - harness_verify({ targetDir, build? }) → typecheck/build an existing project
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
import { execFileSync } from 'node:child_process';
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

let cachedRef = null;
function referenceText() {
  if (cachedRef != null) return cachedRef;
  try {
    cachedRef = fs.readFileSync(bundledPath('reference.md'), 'utf8');
  } catch {
    cachedRef = 'Reference file not found.';
  }
  return cachedRef;
}

const FEATURES = {
  subcontexts: 'subcontexts.md',
  skills: 'skills.md',
  mcp: 'mcp.md',
  providers: 'providers.md',
  tools: 'tools.md',
  loop: 'loop.md',
  permissions: 'permissions.md',
  storage: 'storage.md',
  events: 'events.md',
};

const featureCache = new Map();
function featureText(key) {
  const file = FEATURES[key];
  if (!file) return null;
  if (featureCache.has(key)) return featureCache.get(key);
  let text = null;
  try {
    text = fs.readFileSync(bundledPath('features', file), 'utf8');
  } catch {
    text = `Feature guide not found: ${file}`;
  }
  featureCache.set(key, text);
  return text;
}

function referenceAreas() {
  return (referenceText().match(/^## [^—\n]+ (—)/gm) ?? [])
    .map((h) => h.replace(/^##\s*/, '').replace(/\s*(—|–|-).*$/, '').trim())
    .filter(Boolean);
}

function referenceSlice(area) {
  const key = String(area ?? 'all').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const full = referenceText();
  if (!key || key === 'all' || key === 'full' || key === 'reference') return full;
  const areas = referenceAreas();
  const match = areas.find((a) => a.toLowerCase().replace(/[\s_-]+/g, '') === key);
  if (!match) {
    return (
      `Unknown area "${area}". Available areas: ${areas.join(', ')} (or omit for the full reference).\n\n` +
      full
    );
  }
  const re = new RegExp(`^## ${match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n]*\n`, 'm');
  const start = full.search(re);
  if (start === -1) return full;
  const after = start + full.indexOf('\n', start) + 1;
  const next = full.slice(after).search(/^## /m);
  return full.slice(start, next === -1 ? undefined : after + next);
}

function plan(goal) {
  const raw = String(goal ?? '').trim();
  if (!raw) return { content: [{ type: 'text', text: 'error: goal is required' }], isError: true };
  const g = raw;
  const low = g.toLowerCase();
  const has = (...words) => words.some((w) => low.includes(w));

  const agentId = has('research', 'investigate', 'explore', 'understand', 'survey')
    ? { id: 'explore', why: 'the product is research/analysis: minimal mutation, deep investigation.' }
    : has('roadmap', 'plan', 'design', 'architecture', 'blueprint', 'proposal')
      ? { id: 'plan', why: 'the product is planning: no file writes; it produces structured plans.' }
      : has('answer', 'chat', 'qa', 'rag', 'document', 'docs', 'bot', 'question')
        ? { id: 'general', why: 'the product is a chat/Q&A/RAG assistant: generalist tooling and grounded answers.' }
        : { id: 'build', why: 'default: a coding/building agent that acts, verifies, and fixes in a loop.' };

  const hasKey = (name) => Boolean(process.env[name]);
  const provider = hasKey('NVIDIA_API_KEY') ? 'nvidia' : hasKey('OPENAI_API_KEY') ? 'openai' : hasKey('OPENROUTER_API_KEY') ? 'openrouter' : 'nvidia';
  const model = provider === 'nvidia' ? 'nvidia/nemotron-3-super-120b-a12b' : provider === 'openai' ? 'gpt-5' : 'anthropic/claude-3.7-sonnet';
  const apiKeyEnv = provider.toUpperCase() + '_API_KEY';

  const domainNotes = [];
  if (has('web', 'browser', 'playwright', 'page', 'site', 'e2e')) {
    domainNotes.push('- Web/UI product → add a browser MCP server (stockToMcpConfig: Playwright) so the agent can drive and verify real pages.');
  }
  if (has('database', 'db', 'sql', 'postgres', 'fetch', 'query', 'data')) {
    domainNotes.push('- Data product → add a database MCP server (stockToMcpConfig: Postgres/SQLite) so the agent reads/writes real records.');
  }
  if (has('github', 'repositor', 'pull request', 'pr', 'ci', 'merge')) {
    domainNotes.push('- GitHub automation → add GitHub MCP (stockToMcpConfig) for repo/PR/issue workflow.');
  }
  if (has('coding', 'code', 'refactor', 'bug', 'feature', 'lane', 'editor')) {
    domainNotes.push('- Coding agent → keep filesystem+terminal+git groups, drop a repo-rules subContext and a commit-message skill into skillsDir.');
  }
  if (has('image', 'vision', 'screenshot', 'ui')) {
    domainNotes.push('- Visual work → prefer a vision-capable model and route screenshots to tool.output for UI verification.');
  }
  if (has('email', 'slack', 'notify', 'notification')) {
    domainNotes.push('- External actions → add that service\'s MCP server (stockToMcpConfig) instead of rolling your own client.');
  }

  return {
    content: [{
      type: 'text',
      text:
        `BUILD PLAN — product: ${g}\n\n` +
        `1) Scaffold\n   - Use harness_scaffold({ targetDir: "<abs>/<product>", name: "<product>" }) to materialise the project.\n` +
        `   - Read examples first if useful (harness_examples / harness_read_example).\n\n` +
        `2) Configure\n   - provider: ${provider} (key via $${apiKeyEnv}); model: ${model}\n` +
        `   - agentId: ${agentId.id} — ${agentId.why}\n` +
        `   - tools: filesystem, terminal, search, git, agent (+ skills/mcp tools automatically)\n\n` +
        `3) Wire the three pauses in src/index.ts\n   - permission.required → resolvePermission\n   - ask_user.required → respond\n   - mcp.approval_required → resolveMcpDecision\n   (the scaffold ships this wiring already — just point the UI hooks at your app)\n\n` +
        `4) Make it a real product\n${domainNotes.length ? domainNotes.join('\n') + '\n' : '   - none required for this goal.\n'}` +
        `   - Custom needs → build your own ToolDefinition[] (inputSchema + execute) or a subContext.\n` +
        `   - Domain playbooks → SKILL.md folders in skillsDir (used just-in-time via list_skills/use_skill).\n\n` +
        `5) Verify (do not skip)\n   - harness_verify({ targetDir }) — runs npm run typecheck; then run a SMALL task:\n     PROVIDER=${provider} MODEL="${model}" ${apiKeyEnv}=npx tsx src/index.ts "a small first task"\n   - Gate: result.status === "completed" and the output in result.messages.\n\n` +
        `6) Ship\n   - Subscribe the UI to stream: text.delta, tool.started/completed, run.started/completed, permission/ask_user pauses.\n   - Pass a store + sessionId to resume sessions; guard budget via resolveTokenBudget; keep loop guards on.\n\n` +
        `Dig deeper anytime with harness_api({ area }) or harness_guide({ topic: "..." }).`,
    }],
    isError: false,
  };
}

function verify(targetDir, build) {
  const raw = String(targetDir ?? '').trim();
  const dir = raw ? path.resolve(raw) : '';
  if (!raw || !dir) return { content: [{ type: 'text', text: 'error: targetDir is required' }], isError: true };
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    return { content: [{ type: 'text', text: `error: ${dir} has no package.json — scaffold the project first.` }], isError: true };
  }
  const lines = [`Verifying ${dir}`];
  const steps = ['typecheck', 'build', 'dev'].filter((s) => (s === 'build' && build) || s === 'typecheck');
  const run = (script) => {
    try {
      const out = execFileSync('npm', ['run', script], { cwd: dir, encoding: 'utf8', timeout: 300000 });
      lines.push(`\n[${script} ✓]\n${String(out).trim().split('\n').slice(-3).join('\n')}`);
      return true;
    } catch (e) {
      const detail = String(e?.stdout ?? '').trim().split('\n').slice(-6).join('\n') || String(e?.message ?? e);
      lines.push(`\n[${script} ✗]\n${detail}`);
      return false;
    }
  };
  const ok = steps.map(run).every(Boolean);
  if (steps.length === 0) lines.push('(nothing to run — pass build:true to also typecheck+build)');
  lines.push(`\nVERDICT: ${ok ? 'PASS — project is sound.' : 'FAIL — fix the errors above, then re-run harness_verify.'}`);
  return { content: [{ type: 'text', text: lines.join('\n') }], isError: !ok };
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
  lines.push(`guide length: ${guideText().length} chars (reference: ${referenceText().length} chars, features: ${Object.keys(FEATURES).length})`);
  lines.push(`tools: harness_guide · harness_plan · harness_api · harness_events · harness_status · harness_scaffold · harness_verify · harness_examples · harness_read_example · harness_guide_${Object.keys(FEATURES).join(' · harness_guide_')}`);
  lines.push('usage hint: harness_guide → harness_plan({goal}) → harness_scaffold({targetDir}) → harness_verify({targetDir}).');
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

const FEATURE_TOOL_DEFS = Object.entries(FEATURES).map(([key, file]) => ({
  name: `harness_guide_${key}`,
  description:
    `Deep feature guide — ${key}: ` +
    {
      subcontexts: 'on-demand guidance blocks, context_manage actions, built-in catalog, custom contexts, defaultSubContexts.',
      skills: 'SKILL.md format, discovery (skills/skillsDir/default dirs), list_skills/use_skill just-in-time loading.',
      mcp: 'McpServerConfig (stdio vs streamable-HTTP), lazy activation, id__tool naming, approval flow, stock catalog.',
      providers: 'provider list, env keys, base URLs, streaming, tool-capable model selection, key resolver.',
      tools: 'ToolDefinition shape, built-in factories, groups, read-only/mutation annotations, custom tools.',
      loop: 'phases explore→plan→edit→verify→recover→complete, automatic guards, compaction, budgets.',
      permissions: 'the three pauses (permission/ask_user/mcp approval) and how to resolve each, autoApprove.',
      storage: 'Storage interface, MemoryStore, sessions/runs/messages, resume with sessionId + store.',
      events: 'event catalog with payloads and reference UI wiring (streaming chat, tool cards, pause dialogs).',
    }[key],
  inputSchema: { type: 'object', properties: {} },
}));

const toolDefs = [
  ...FEATURE_TOOL_DEFS,
  {
    name: 'harness_guide',
    description:
      'Return the master instructions for building a looping AI agent on smoke-monkey-harness: ' +
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
    name: 'harness_plan',
    description:
      'Turn a PRODUCT GOAL into a concrete build plan: scaffold step, provider/model defaults, agentId, tools, ' +
      'domain MCP/search sub-context recommendations, per-pause wiring, verification gate, and ship steps. ' +
      'Call after harness_guide and before harness_scaffold.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'What you are building, e.g. "a coding agent that fixes TypeScript lint errors on push".' },
      },
      required: ['goal'],
    },
  },
  {
    name: 'harness_api',
    description:
      'Return the authoritative API reference for writing agents on the library: createAgent options, the agent ' +
      'surface (run/respond/resolvePermission/resolveMcpDecision), event catalog, tool factories + groups, ' +
      'providers, sub-contexts, skills, MCP config, loop/guards, permissions. Slice with area=' +
      '(options|surface|events|tools|providers|subcontexts|skills|mcp|loop|permissions|all). Default: full reference.',
    inputSchema: {
      type: 'object',
      properties: {
        area: { type: 'string', description: 'One of: options, surface, events, tools, providers, subcontexts, skills, mcp, loop, permissions. Omit for the full reference.' },
      },
    },
  },
  {
    name: 'harness_events',
    description:
      'Return the complete agent event catalog with payload notes (run lifecycle, steps, phases, text/tools, ' +
      'the three pauses, context, compaction). Use this to wire a real UI/logging layer to the agent.',
    inputSchema: { type: 'object', properties: {} },
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
    name: 'harness_verify',
    description:
      'Verify an existing agent project: runs `npm run typecheck` in targetDir (pass build:true to also run ' +
      '`npm run build`). Returns PASS/FAIL with the tail of the output. Call after editing/scaffolding to close the loop.',
    inputSchema: {
      type: 'object',
      properties: {
        targetDir: { type: 'string', description: 'Absolute path of the project to verify (must contain package.json).' },
        build: { type: 'boolean', description: 'Optional: also run npm run typecheck + npm run build.' },
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
        serverInfo: { name: 'smoke-monkey-harness', version: '1.0.4' },
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
        case 'harness_plan':
          result = plan(args.goal);
          break;
        case 'harness_api':
          result = { content: [{ type: 'text', text: referenceSlice(args.area) }], isError: false };
          break;
        case 'harness_events':
          result = {
            content: [{
              type: 'text',
              text:
                'Agent event catalog (subscribe via agent.on(type, fn) or agent.onAny(fn); payload via e.data).\n\n' +
                referenceSlice('events'),
            }],
            isError: false,
          };
          break;
        case 'harness_status':
          result = { content: [{ type: 'text', text: statusText() }], isError: false };
          break;
        case 'harness_verify':
          result = verify(args.targetDir, args.build);
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
        default: {
          const feature = name.startsWith('harness_guide_') ? name.slice('harness_guide_'.length) : null;
          if (feature && FEATURES[feature]) {
            result = { content: [{ type: 'text', text: featureText(feature) }], isError: false };
            break;
          }
          result = { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
        }
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