/**
 * Offline verification of the plugin MCP server (no LLM, no harness):
 *   - initialize + tools/list exposure
 *   - harness_guide / harness_status / harness_examples / harness_read_example
 *   - harness_scaffold materialises a starter project into a temp dir
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const server = path.join(root, 'plugin', 'mcp', 'server.mjs');

const child = spawn(process.execPath, [server], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '';
let nextId = 0;
const pending = new Map<number, (msg: unknown) => void>();

child.stdout.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let idx: number;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg: { id?: number };
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id != null) {
      const resolve = pending.get(msg.id);
      if (resolve) {
        pending.delete(msg.id);
        resolve(msg);
      }
    }
  }
});

function call(method: string, params: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (msg) => resolve(msg));
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    // Safety net so a broken server doesn't hang the test forever.
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }
    }, 15000).unref();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  await new Promise<void>((resolve) => {
    child.once('spawn', () => resolve());
  });
  await sleep(250);

  // initialize
  const init = await call('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  const serverName = init.result?.serverInfo?.name;
  if (serverName !== 'smoke-monkey-harness') throw new Error(`unexpected serverInfo: ${JSON.stringify(init.result)}`);
  console.log('  initialize ok —', `${serverName} @ ${init.result.serverInfo.version}`);

  // tools/list
  const list = await call('tools/list', {});
  const tools: Array<{ name: string }> = list.result?.tools ?? [];
  const names = tools.map((t) => t.name);
  for (const expected of [
    'harness_guide',
    'harness_status',
    'harness_scaffold',
    'harness_verify',
    'harness_examples',
    'harness_read_example',
    'harness_plan',
    'harness_api',
    'harness_events',
    'harness_guide_subcontexts',
    'harness_guide_skills',
    'harness_guide_mcp',
    'harness_guide_providers',
    'harness_guide_tools',
    'harness_guide_loop',
    'harness_guide_permissions',
    'harness_guide_storage',
    'harness_guide_events',
  ]) {
    if (!names.includes(expected)) throw new Error(`missing tool: ${expected}`);
  }
  console.log(`  tools/list ok — ${names.length} tools`);

  // harness_guide
  const guide = await call('tools/call', { name: 'harness_guide', arguments: {} });
  const guideText = guide.result?.content?.[0]?.text ?? '';
  if (!guideText.includes('createAgent') || !guideText.includes('workspacePath')) throw new Error('guide missing core content');
  console.log(`  harness_guide ok (${guideText.length} chars, mentions createAgent)`);

  // harness_plan — product wizard
  const plan = await call('tools/call', { name: 'harness_plan', arguments: { goal: 'a coding agent that fixes lint errors' } });
  const planText = plan.result?.content?.[0]?.text ?? '';
  if (!planText.includes('BUILD PLAN') || !planText.includes('harness_scaffold')) throw new Error('plan missing structure');
  console.log(`  harness_plan ok (${planText.length} chars, has BUILD PLAN)`);

  // harness_api — reference slicing
  const apiProv = await call('tools/call', { name: 'harness_api', arguments: { area: 'providers' } });
  const apiProvText = apiProv.result?.content?.[0]?.text ?? '';
  if (!apiProvText.includes('NVIDIA_API_KEY')) throw new Error('api(providers) missing content');
  const apiBad = await call('tools/call', { name: 'harness_api', arguments: { area: 'nope' } });
  if (!String(apiBad.result?.content?.[0]?.text ?? '').includes('Available areas')) throw new Error('api(unknown) should list areas');
  console.log('  harness_api ok (slice + unknown-area handling)');

  // harness_guide_<feature> deep dives
  for (const f of ['subcontexts', 'skills', 'mcp', 'providers', 'tools', 'loop', 'permissions', 'storage', 'events']) {
    const res = await call('tools/call', { name: `harness_guide_${f}`, arguments: {} });
    const text = res.result?.content?.[0]?.text ?? '';
    if (res.result?.isError || text.length < 200 || !text.startsWith('# Feature guide')) {
      throw new Error(`feature guide ${f} failed or empty`);
    }
  }
  console.log('  harness_guide_<feature> ok (9 deep dives)');

  // harness_events — catalog for UI wiring
  const events = await call('tools/call', { name: 'harness_events', arguments: {} });
  const eventsText = events.result?.content?.[0]?.text ?? '';
  if (!eventsText.includes('text.delta') || !eventsText.includes('tool.completed')) throw new Error('events missing key entries');
  console.log('  harness_events ok');

  // harness_status
  const status = await call('tools/call', { name: 'harness_status', arguments: {} });
  const statusText = status.result?.content?.[0]?.text ?? '';
  if (!statusText.includes('smoke-monkey-harness')) throw new Error('status missing name');
  console.log(`  harness_status ok (${statusText.split('\n')[0].trim()})`);

  // harness_verify — error path (no package.json) is deterministic offline
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-verify-'));
  const verify = await call('tools/call', { name: 'harness_verify', arguments: { targetDir: emptyDir } });
  if (!verify.result?.isError) throw new Error('verify without package.json should error');
  console.log('  harness_verify ok (guards missing package.json)');
  fs.rmSync(emptyDir, { recursive: true, force: true });

  // harness_examples + read
  const ex = await call('tools/call', { name: 'harness_examples', arguments: {} });
  const exText = ex.result?.content?.[0]?.text ?? '';
  if (!exText.includes('basic-agent.ts')) throw new Error('examples missing basic-agent');
  const read = await call('tools/call', { name: 'harness_read_example', arguments: { name: 'basic-agent.ts' } });
  const readText = read.result?.content?.[0]?.text ?? '';
  if (!readText.includes('createAgent')) throw new Error('read_example failed');
  console.log('  harness_examples + harness_read_example ok');

  // harness_scaffold into a temp dir
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-plugin-'));
  const scaffold = await call('tools/call', { name: 'harness_scaffold', arguments: { targetDir: tmp, name: 'my-agent' } });
  const scaffoldText = scaffold.result?.content?.[0]?.text ?? '';
  if (scaffold.result?.isError) throw new Error(`scaffold errored: ${scaffoldText}`);
  for (const rel of ['package.json', 'tsconfig.json', 'src/index.ts', 'src/skills/example/SKILL.md', 'README.md', '.mcp.json']) {
    const p = path.join(tmp, rel);
    if (!fs.existsSync(p)) throw new Error(`scaffold missing ${rel}`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
  if (pkg.name !== 'my-agent') throw new Error(`scaffold name substitution failed: ${pkg.name}`);
  const idx = fs.readFileSync(path.join(tmp, 'src/index.ts'), 'utf8');
  if (!idx.includes('@smoke-monkey/harness')) throw new Error('scaffold src missing import');
  console.log(`  harness_scaffold ok into ${tmp} (package ${pkg.name}, .mcp.json present)`);
  fs.rmSync(tmp, { recursive: true, force: true });

  // unknown tool errors cleanly
  const bad = await call('tools/call', { name: 'nope', arguments: {} });
  if (!bad.result?.isError) throw new Error('unknown tool should error');
  console.log('  unknown tool handled');

  child.kill();

  // plugin package + native manifests (plugin/ is the plugin root)
  const pluginPkg = path.join(root, 'plugin');
  for (const rel of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'plugin.json', '.mcp.json', 'skills/smoke-monkey-harness/SKILL.md', 'mcp/server.mjs']) {
    if (!fs.existsSync(path.join(pluginPkg, rel))) throw new Error(`plugin package missing ${rel}`);
  }
  const claude = JSON.parse(fs.readFileSync(path.join(pluginPkg, '.claude-plugin', 'plugin.json'), 'utf8'));
  if (claude.name !== 'smoke-monkey-harness' || claude.skills !== './skills' || claude.mcpServers !== './.mcp.json') throw new Error('claude manifest invalid');
  const codex = JSON.parse(fs.readFileSync(path.join(pluginPkg, '.codex-plugin', 'plugin.json'), 'utf8'));
  if (codex.name !== 'smoke-monkey-harness' || !codex.interface?.defaultPrompt?.length) throw new Error('codex manifest invalid');
  const portable = JSON.parse(fs.readFileSync(path.join(pluginPkg, 'plugin.json'), 'utf8'));
  if (portable.name !== 'smoke-monkey-harness' || portable.skills !== './skills') throw new Error('portable manifest invalid');
  const mcp = JSON.parse(fs.readFileSync(path.join(pluginPkg, '.mcp.json'), 'utf8'));
  if (!mcp.mcpServers?.['smoke-monkey-harness']?.args?.[0]?.includes('CLAUDE_PLUGIN_ROOT')) throw new Error('.mcp.json should use ${CLAUDE_PLUGIN_ROOT}');
  const marketplace = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  if (marketplace.plugins?.[0]?.source !== './plugin') throw new Error('repo marketplace should point at ./plugin');
  console.log('  plugin package ok (claude/codex manifests + ${CLAUDE_PLUGIN_ROOT} .mcp.json + repo marketplace)');

  console.log('\nPLUGIN MCP OK');
  process.exit(0);
} catch (err) {
  child.kill();
  console.error('\nPLUGIN MCP FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
}