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

const pkgVersion: string = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

/**
 * Feature key -> the guide tool that serves it. Single source of truth: the
 * expected-name check, the tools/list check, and the per-guide call check all
 * read this, so a renamed or newly-wired guide cannot drift between them.
 * Every file in plugin/mcp/features/ MUST have an entry here — a file without
 * one means the server cannot reach it, which fails here rather than at runtime.
 */
const GUIDES: Record<string, string> = {
  subcontexts: 'harness_guide_subcontexts_activation_and_switching',
  skills: 'harness_guide_skills_skill_md_discovery',
  mcp: 'harness_guide_mcp_servers_and_discovery',
  providers: 'harness_guide_providers_models_and_api_keys',
  tools: 'harness_guide_tools_custom_tool_implementation',
  loop: 'harness_guide_loop_phases_guards_and_compaction',
  permissions: 'harness_guide_permissions_the_three_pauses',
  storage: 'harness_guide_storage_sessions_runs_messages',
  events: 'harness_guide_events_streaming_and_ui_wiring',
  ui: 'harness_guide_ui_bridge_and_components',
  errors: 'harness_guide_errors_validation_and_pauses',
};

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

  // The manifests and the serverInfo a client sees MUST agree with package.json.
  // They drifted once already (all reporting 1.2.0 against a 1.2.1 package), so
  // a version bump that skips them is now a fixture failure, not a silent lie in
  // harness_status.
  if (init.result?.serverInfo?.version !== pkgVersion) {
    throw new Error(`serverInfo ${init.result?.serverInfo?.version} != package.json ${pkgVersion}`);
  }
  for (const rel of [
    'plugin/plugin.json',
    'plugin/.claude-plugin/plugin.json',
    'plugin/.codex-plugin/plugin.json',
    '.agents/plugins/marketplace.json',
  ]) {
    const v = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')).version;
    if (v !== pkgVersion) throw new Error(`${rel} version ${v} != package.json ${pkgVersion}`);
  }
  console.log(`  version coherence ok — ${pkgVersion} across package, 4 manifests, serverInfo`);

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
    ...Object.values(GUIDES),
    'harness_skills_by_category',
    'harness_skill_content',
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

  // harness_guide_<feature>_<detail> deep dives
  // Every file in features/ must be reachable and non-empty, so a guide cannot
  // ship unregistered. The list is explicit rather than read off the server so
  // that adding a file without wiring it up fails here instead of at runtime.
  const featuresDir = path.join(root, 'plugin', 'mcp', 'features');
  const featureFiles = fs.readdirSync(featuresDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
  const unwired = featureFiles.filter((f) => !(f in GUIDES));
  if (unwired.length > 0) {
    throw new Error(`feature file(s) with no guide tool: ${unwired.join(', ')}`);
  }
  for (const [feature, tool] of Object.entries(GUIDES)) {
    const res = await call('tools/call', { name: tool, arguments: {} });
    const text = res.result?.content?.[0]?.text ?? '';
    if (res.result?.isError || text.length < 200 || !text.startsWith('# Feature guide')) {
      throw new Error(`feature guide ${feature} (${tool}) failed or empty`);
    }
  }
  const listed = await call('tools/list', {});
  const toolNames = (listed.result?.tools ?? []).map((t: { name: string }) => t.name);
  for (const [feature, tool] of Object.entries(GUIDES)) {
    if (!toolNames.includes(tool)) {
      throw new Error(`${tool} (${feature}) missing from tools/list`);
    }
  }
  // The rename is a public contract: a stale short name must not survive.
  for (const stale of ['harness_guide_tools', 'harness_guide_mcp', 'harness_guide_ui', 'harness_guide_errors']) {
    if (toolNames.includes(stale)) throw new Error(`stale guide name still registered: ${stale}`);
  }
  console.log(`  harness_guide_<feature>_<detail> ok (${Object.keys(GUIDES).length} deep dives, all listed, no stale names)`);

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

  // harness_skills_by_category — category-wise bundled agent skills
  const allSkills = await call('tools/call', { name: 'harness_skills_by_category', arguments: {} });
  const allSkillsText = allSkills.result?.content?.[0]?.text ?? '';
  if (!/25 of 25/.test(allSkillsText) || !allSkillsText.includes('test-driven-development')) {
    throw new Error('skills list missing all 25');
  }
  const backend = await call('tools/call', { name: 'harness_skills_by_category', arguments: { category: 'agent-skills-backend' } });
  const backendText = backend.result?.content?.[0]?.text ?? '';
  if (!backendText.includes('Agent Skills · Backend') || !backendText.includes('api-and-interface-design')) {
    throw new Error('skills category filter failed');
  }
  const badCat = await call('tools/call', { name: 'harness_skills_by_category', arguments: { category: 'nope' } });
  if (!badCat.result?.isError) throw new Error('skills unknown category should error');
  console.log('  harness_skills_by_category ok (all 25 + category filter + unknown guard)');

  // harness_skill_content — full SKILL.md load
  const skill = await call('tools/call', { name: 'harness_skill_content', arguments: { skill: 'test-driven-development' } });
  const skillText = skill.result?.content?.[0]?.text ?? '';
  if (!skillText.includes('red-green') && !skillText.includes('Test')) throw new Error('skill content missing workflow');
  const skillUnknown = await call('tools/call', { name: 'harness_skill_content', arguments: { skill: 'does-not-exist' } });
  if (!skillUnknown.result?.isError) throw new Error('skill unknown should error');
  console.log('  harness_skill_content ok (full SKILL.md + unknown guard)');

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
  // Accept either the scoped or the legacy unscoped package name: the scaffold
  // ships the scoped one, but the unscoped package must keep working.
  if (!/from '@smoke-monkey\/harness'|from 'smoke-monkey-harness'/.test(idx)) throw new Error('scaffold src missing import');
  const scaffoldDep = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8')).dependencies ?? {};
  const depName = Object.keys(scaffoldDep).find((d) => d.endsWith('smoke-monkey-harness') || d === '@smoke-monkey/harness');
  if (!depName) throw new Error('scaffold package.json is missing the harness dependency');
  // The import and the dependency must name the same package, or the generated
  // project installs one and imports the other.
  const imported = /from '(@smoke-monkey\/harness|smoke-monkey-harness)'/.exec(idx)?.[1];
  if (imported !== depName) throw new Error(`scaffold mismatch: imports ${imported} but depends on ${depName}`);
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
  if (portable.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json') throw new Error('portable manifest must declare the agent-plugins $schema');
  if (portable.name !== 'smoke-monkey-harness' || 'skills' in portable || 'mcpServers' in portable || 'interface' in portable) {
    throw new Error('portable manifest must be strict agent-plugins (skills/mcpServers/interface live in sibling per-host manifests)');
  }
  const mcp = JSON.parse(fs.readFileSync(path.join(pluginPkg, '.mcp.json'), 'utf8'));
  if (!mcp.mcpServers?.['smoke-monkey-harness']?.args?.[0]?.includes('CLAUDE_PLUGIN_ROOT')) throw new Error('.mcp.json should use ${CLAUDE_PLUGIN_ROOT}');
  const marketplace = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  if (marketplace.plugins?.[0]?.source !== './plugin') throw new Error('repo marketplace should point at ./plugin');

  // universal skill copies must be byte-identical to the package source
  const collect = (dir: string): Record<string, string> => {
    const out: Record<string, string> = {};
    const walk = (d: string, rel = ''): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const relp = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(path.join(d, e.name), relp);
        else out[relp] = fs.readFileSync(path.join(d, e.name), 'utf8');
      }
    };
    walk(dir);
    return out;
  };
  const srcFiles = collect(path.join(pluginPkg, 'skills', 'smoke-monkey-harness'));
  for (const dst of [
    path.join(root, '.agents', 'skills', 'smoke-monkey-harness'),
    path.join(root, '.opencode', 'skills', 'smoke-monkey-harness'),
    path.join(root, '.github', 'skills', 'smoke-monkey-harness'),
    path.join(root, '.agents', 'plugins', 'smoke-monkey-harness', 'skills', 'smoke-monkey-harness'),
  ]) {
    if (JSON.stringify(collect(dst)) !== JSON.stringify(srcFiles)) throw new Error(`skill copy differs: ${dst}`);
  }

  // Antigravity workspace plugin (plugin.json + mcp_config.json + skills)
  const ag = path.join(root, '.agents', 'plugins', 'smoke-monkey-harness');
  for (const rel of ['plugin.json', 'mcp_config.json', 'skills/smoke-monkey-harness/SKILL.md', 'skills/smoke-monkey-harness/references/api.md']) {
    if (!fs.existsSync(path.join(ag, rel))) throw new Error(`antigravity plugin missing ${rel}`);
  }
  const agManifest = JSON.parse(fs.readFileSync(path.join(ag, 'plugin.json'), 'utf8'));
  if (agManifest.$schema !== 'https://antigravity.google/schemas/v1/plugin.json' || agManifest.name !== 'smoke-monkey-harness') throw new Error('antigravity plugin.json invalid');
  const agMcp = JSON.parse(fs.readFileSync(path.join(ag, 'mcp_config.json'), 'utf8'));
  if (!agMcp.mcpServers?.['smoke-monkey-harness']?.args?.[0]?.includes('plugin/mcp/server.mjs')) throw new Error('antigravity mcp_config.json must reference the server');
  if (!fs.existsSync(path.join(root, '.github', 'skills', 'smoke-monkey-harness', 'SKILL.md'))) throw new Error('copilot project skill missing');
  console.log('  plugin package ok (strict portable manifest + ${CLAUDE_PLUGIN_ROOT} .mcp.json + repo marketplace)');
  console.log('  per-host distribution ok (antigravity plugin + copilot .github/skills + identical skill copies)');

  console.log('\nPLUGIN MCP OK');
  process.exit(0);
} catch (err) {
  child.kill();
  console.error('\nPLUGIN MCP FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
}