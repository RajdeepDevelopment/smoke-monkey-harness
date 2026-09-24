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
  for (const expected of ['harness_guide', 'harness_status', 'harness_scaffold', 'harness_examples', 'harness_read_example']) {
    if (!names.includes(expected)) throw new Error(`missing tool: ${expected}`);
  }
  console.log(`  tools/list ok — ${names.join(', ')}`);

  // harness_guide
  const guide = await call('tools/call', { name: 'harness_guide', arguments: {} });
  const guideText = guide.result?.content?.[0]?.text ?? '';
  if (!guideText.includes('createAgent') || !guideText.includes('workspacePath')) throw new Error('guide missing core content');
  console.log(`  harness_guide ok (${guideText.length} chars, mentions createAgent)`);

  // harness_status
  const status = await call('tools/call', { name: 'harness_status', arguments: {} });
  const statusText = status.result?.content?.[0]?.text ?? '';
  if (!statusText.includes('smoke-monkey-harness')) throw new Error('status missing name');
  console.log(`  harness_status ok (${statusText.split('\n')[0].trim()})`);

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
  console.log('\nPLUGIN MCP OK');
  process.exit(0);
} catch (err) {
  child.kill();
  console.error('\nPLUGIN MCP FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
}