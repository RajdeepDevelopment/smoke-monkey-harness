/**
 * Offline verification of the universal agent installer (plugin/install.sh):
 *   - `--list` prints the supported-agent table (reads plugin/agents.json)
 *   - home install lands the skill in every agent's global skill dir
 *   - `--local` also installs project skill dirs + writes .mcp.json (claude/codex),
 *     .agents/mcp_config.json (antigravity), opencode.json
 *   - `--agent <id>` installs only for the selected agent
 *   - unknown agent id exits non-zero
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const installer = path.join(root, 'plugin', 'install.sh');

const run = (cwd: string, env: NodeJS.ProcessEnv, args: string[]) =>
  execFileSync('bash', [installer, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });

const HOME_T = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-install-home-'));
const CWD_T = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-install-cwd-'));
const env = { HOME: HOME_T };
const file = (...p: string[]) => path.join(CWD_T, ...p);

try {
  // --list includes a few representative ids from the registry.
  const list = run(root, {}, ['--list']);
  for (const id of [
    'claude-code',
    'codex',
    'opencode',
    'cursor',
    'windsurf',
    'goose',
    'gemini-cli',
  ]) {
    if (!list.includes(id)) throw new Error(`--list missing agent "${id}"`);
  }
  console.log('  list ok — registry rendered');

  // Home install → skill present in ~/.agents/skills and a couple per-agent homes.
  run(root, env, []);
  for (const sub of [
    '.agents/skills/smoke-monkey-harness/SKILL.md',
    '.cursor/skills/smoke-monkey-harness/SKILL.md',
    '.codeium/windsurf/skills/smoke-monkey-harness/SKILL.md',
  ]) {
    if (!fs.existsSync(path.join(HOME_T, sub))) throw new Error(`home install missing ${sub}`);
  }
  console.log('  home install ok — ~/.agents/skills + per-agent homes');

  // Local install → project skill dirs + MCP wiring.
  run(CWD_T, env, ['--local']);
  for (const sub of [
    '.agents/skills/smoke-monkey-harness/SKILL.md',
    '.claude/skills/smoke-monkey-harness/SKILL.md',
    '.codex/skills/smoke-monkey-harness/SKILL.md',
  ]) {
    if (!fs.existsSync(file(sub))) throw new Error(`local install missing ${sub}`);
  }
  for (const cfg of ['.mcp.json', '.agents/mcp_config.json', 'opencode.json']) {
    if (!fs.existsSync(file(cfg))) throw new Error(`local install missing MCP wiring ${cfg}`);
  }
  console.log(
    '  local install ok — project skills + .mcp.json + .agents/mcp_config.json + opencode.json'
  );

  // Single-agent install is scoped.
  const single = path.join(CWD_T, 'single-agent');
  fs.mkdirSync(single, { recursive: true });
  run(single, env, ['--agent', 'gemini-cli', '--local']);
  if (
    !fs.existsSync(path.join(CWD_T, 'single-agent', '.agents/skills/smoke-monkey-harness/SKILL.md'))
  ) {
    throw new Error('--agent did not install the selected agent');
  }
  if (
    fs.existsSync(path.join(CWD_T, 'single-agent', '.claude/skills/smoke-monkey-harness/SKILL.md'))
  ) {
    throw new Error("--agent leaked into another agent's dir");
  }
  console.log('  single-agent install ok — scoped to --agent gemini-cli');

  // Unknown agent id must fail.
  let failed = false;
  try {
    run(root, env, ['--agent', 'does-not-exist']);
  } catch {
    failed = true;
  }
  if (!failed) throw new Error('unknown --agent id should exit non-zero');
  console.log('  unknown --agent guard ok');
} finally {
  fs.rmSync(HOME_T, { recursive: true, force: true });
  fs.rmSync(CWD_T, { recursive: true, force: true });
}
