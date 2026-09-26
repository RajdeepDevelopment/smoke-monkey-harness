#!/usr/bin/env node
/**
 * Smoke Monkey — Agent Skills MCP server (bundle of addyosmani/agent-skills).
 *
 * A dependency-free stdio JSON-RPC MCP server (newline-delimited) that exposes
 * the 25 production-engineering skills bundled in server/agent-skills/skills
 * as tools, so the SM agent can browse, fetch and apply them by workflow phase
 * (define / plan / build / verify / review / ship) or by domain
 * (backend / frontend / devops / data).
 *
 * Tools exposed:
 *   list_skills            — list every skill (+ description, phase, domain)
 *   get_skill              — full SKILL.md content for one skill
 *   recommend_skills       — best skill(s) for a task (keyword coverage)
 *   get_reference          — a reference checklist (definition-of-done, etc.)
 *   using_agent_skills     — the meta-skill: phase → skill mapping to apply
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '..', 'skills');
const REFERENCES_DIR = join(__dirname, '..', 'references');

const SERVER_NAME = 'agent-skills';
const SERVER_VERSION = '0.1.0';

// Shared catalog (phases / domains / aliases) — single source of truth also
// used by the library's src/agent-skills.ts for category-wise skill loading.
const CATALOG = JSON.parse(readFileSync(join(__dirname, '..', 'catalog.json'), 'utf8'));

/** Lifecycle phase for each skill (used for category-wise discovery). */
const PHASE = CATALOG.phases;

/** Domains each skill serves (backend / frontend / devops / data / qa). */
const DOMAINS = CATALOG.domains;

/** Common aliases so recommend/list lookups match natural language. */
const ALIASES = CATALOG.aliases;

const PHASE_LABEL = {
  meta: 'Meta',
  define: 'Define',
  plan: 'Plan',
  build: 'Build',
  verify: 'Verify',
  review: 'Review',
  ship: 'Ship',
};

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return { name: '', description: '' };
  const name = /^name:\s*(.+)$/m.exec(m[1])?.[1]?.trim() ?? '';
  const description = /^description:\s*(.+)$/m.exec(m[1])?.[1]?.trim() ?? '';
  return { name, description };
}

function loadSkill(name) {
  const file = join(SKILLS_DIR, name, 'SKILL.md');
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, 'utf8');
  const fm = frontmatter(raw);
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  return {
    name: name,
    title: fm.name || name,
    description: fm.description || '',
    phase: PHASE[name] || 'build',
    phaseLabel: PHASE_LABEL[PHASE[name] || 'build'],
    domains: DOMAINS[name] || [],
    aliases: ALIASES[name] || [],
    content: raw,
    body,
  };
}

function index() {
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => loadSkill(d.name))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

function listReferences() {
  if (!existsSync(REFERENCES_DIR)) return [];
  return readdirSync(REFERENCES_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}

const SKILLS = index();
const SKILL_MAP = new Map(SKILLS.map((s) => [s.name, s]));
const REFS = listReferences();

// --domain=backend|frontend|devops|qa startup flag: when set, list_skills
// defaults to showing only skills matching this domain. get_skill / recommend_skills
// still work across all skills; only list_skills uses the default.
function parseStartupDomain() {
  const raw = process.argv.find((a) => a.startsWith('--domain='));
  return raw ? raw.split('=')[1]?.trim().toLowerCase() || '' : '';
}
const DEFAULT_DOMAIN = parseStartupDomain();

function skillResultText(s) {
  return (
    `${s.name}  [${s.phaseLabel} · ${s.domains.join(',')}${s.aliases.length ? ' · ~' + s.aliases.slice(0, 4).join('|') : ''}]\n` +
    `${s.description}`
  );
}

// ── Tool implementations ─────────────────────────────────────────────────────

function showList(input = {}) {
  const query = (input.query ? String(input.query) : '').trim().toLowerCase();
  const phase = input.phase ? String(input.phase).trim().toLowerCase() : '';
  const domain = (input.domain ? String(input.domain).trim().toLowerCase() : '') || DEFAULT_DOMAIN;
  let list = SKILLS;
  if (phase) list = list.filter((s) => s.phase === phase);
  if (domain) list = list.filter((s) => s.domains.includes(domain));
  if (query) list = list.filter((s) => {
    const hay = [s.name, s.title, s.description, ...s.aliases, ...s.domains, s.phase].join(' ').toLowerCase();
    return hay.includes(query);
  });
  if (list.length === 0) {
    return `No skills matched. Try list_skills (no args) to see all ${SKILLS.length}, then narrow with phase (define|plan|build|verify|review|ship|meta) or domain (backend|frontend|devops|data|qa).`;
  }
  return `Agent Skills (${SKILLS.length} total, showing ${list.length}):\n${list.map((s) => '- ' + skillResultText(s)).join('\n')}\n\nUse get_skill({skill}) to load the full workflow for any skill, or recommend_skills({task}) to pick.`;
}

function showSkill(input = {}) {
  const name = String(input.skill ?? input.name ?? '').trim().toLowerCase();
  if (!name) return 'Error: get_skill requires a "skill" name (use list_skills to see them).';
  const direct = SKILL_MAP.get(name);
  if (direct) return direct.content;
  for (const s of SKILLS) {
    if (s.aliases.some((a) => a === name)) return s.content;
    if (s.title.toLowerCase() === name) return s.content;
  }
  return `Error: unknown skill "${name}". Run list_skills to see all ${SKILLS.length} skills.`;
}

function showRecommend(input = {}) {
  const task = (input.task ? String(input.task) : '').trim().toLowerCase();
  if (!task) return 'Error: recommend_skills requires a "task" string.';
  const tokens = task.split(/[^a-z0-9-]+/).filter((t) => t.length > 2);
  const scored = SKILLS.map((s) => {
    const hay = [s.name, s.title, s.description, ...s.aliases, ...s.domains].join(' ').toLowerCase();
    let hits = 0;
    for (const t of tokens) if (hay.includes(t)) hits++;
    const coverage = tokens.length ? hits / tokens.length : 0;
    return { s, hits, coverage };
  }).filter((r) => r.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.coverage - a.coverage);
  if (scored.length === 0) {
    return `No skill matched "${input.task}". Retry with browser|api|security|tdd|ship|frontend|ui keywords, or call list_skills to browse the catalog.`;
  }
  const best = scored[0];
  return (
    `Best match for "${input.task}": ${best.s.name} [${best.s.phaseLabel}] (${best.hits} keyword hits, ${Math.round(best.coverage * 100)}% coverage).\n` +
    `${best.s.description}\n\n` +
    `Load it with get_skill({ skill: "${best.s.name}" }) and follow the workflow. Also relevant:\n` +
    scored.slice(1, 4).map((r) => `- ${r.s.name} [${r.s.phaseLabel}] (${r.hits})`).join('\n')
  );
}

function showReference(input = {}) {
  const name = String(input.reference ?? input.name ?? '').trim().toLowerCase().replace(/\.md$/, '');
  if (!name) return `Error: get_reference requires a "reference" name. Available: ${REFS.join(', ')}.`;
  const file = join(REFERENCES_DIR, `${name}.md`);
  if (!existsSync(file)) {
    const fuzzy = REFS.find((r) => r.includes(name) || name.includes(r));
    if (fuzzy) return readFileSync(join(REFERENCES_DIR, `${fuzzy}.md`), 'utf8');
    return `Error: unknown reference "${name}". Available: ${REFS.join(', ')}.`;
  }
  return readFileSync(file, 'utf8');
}

function showMeta() {
  const meta = SKILL_MAP.get('using-agent-skills');
  if (meta) return meta.content;
  return 'using-agent-skills skill not found.';
}

const TOOLS = [
  {
    name: 'list_skills',
    description:
      `List the available engineering skills (${SKILLS.length}) bundled from addyosmani/agent-skills, each showing name, lifecycle phase (define/plan/build/verify/review/ship/meta), domains (backend/frontend/devops/data/qa) and search aliases. When a --domain startup flag is set (e.g. --domain=backend), only skills matching that domain are listed by default. Call this FIRST to discover which skill to activate for a task.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional free-text filter matched against name, description, aliases, domains and phase.' },
        phase: { type: 'string', description: 'Optional lifecycle phase filter: define | plan | build | verify | review | ship | meta.' },
        domain: { type: 'string', description: 'Optional domain filter: backend | frontend | devops | data | qa.' },
      },
    },
  },
  {
    name: 'get_skill',
    description:
      `Fetch the FULL workflow for exactly one skill by its canonical name (or an alias, e.g. tdd → test-driven-development). The returned SKILL.md contains the step-by-step Process, anti-rationalization tables and Verification/evidence gates — the agent must follow it verbatim.`,
    inputSchema: {
      type: 'object',
      properties: { skill: { type: 'string', description: 'Canonical skill name (from list_skills) or a recognized alias.' } },
      required: ['skill'],
    },
  },
  {
    name: 'recommend_skills',
    description:
      `Pick the best skill(s) for a task by keyword coverage over names, descriptions, aliases and domains. Use when you are unsure which workflow applies — pass a SHORT task/capability phrase (2-5 keywords), not a full prompt.`,
    inputSchema: {
      type: 'object',
      properties: { task: { type: 'string', description: 'Short capability phrase, e.g. "write backend API with tests and security".' } },
      required: ['task'],
    },
  },
  {
    name: 'get_reference',
    description:
      `Fetch a shared reference checklist loaded on demand: ${REFS.join(', ')}. Pull the ones relevant to the current phase/domain instead of relying on memory.`,
    inputSchema: {
      type: 'object',
      properties: { reference: { type: 'string', description: `Reference name: ${REFS.join(' | ')}` } },
      required: ['reference'],
    },
  },
  {
    name: 'using_agent_skills',
    description:
      `Fetch the using-agent-skills meta-skill: the phase → skill discovery table and shared operating rules. Call when a session starts or when deciding which skill workflow applies, to route the task to the correct lifecycle phase.`,
    inputSchema: { type: 'object', properties: {} },
  },
];

const HANDLERS = {
  list_skills: showList,
  get_skill: showSkill,
  recommend_skills: showRecommend,
  get_reference: showReference,
  using_agent_skills: showMeta,
};

// ── stdio JSON-RPC loop (newline-delimited) ─────────────────────────────────

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function respondError(id, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message } }) + '\n');
}

rl.on('line', (line) => {
  const raw = line.trim();
  if (!raw) return;
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.id === undefined || msg.id === null) return; // notification
  const method = msg.method;

  if (method === 'initialize') {
    respond(msg.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }
  if (method === 'tools/list') {
    respond(msg.id, { tools: TOOLS });
    return;
  }
  if (method === 'tools/call') {
    const name = msg.params?.name;
    const args = msg.params?.arguments ?? {};
    const handler = HANDLERS[name];
    if (!handler) {
      respondError(msg.id, `Unknown tool: ${name}`);
      return;
    }
    try {
      const text = handler(args);
      respond(msg.id, { content: [{ type: 'text', text }] });
    } catch (err) {
      respondError(msg.id, err instanceof Error ? err.message : String(err));
    }
    return;
  }
  respondError(msg.id, `Unsupported method: ${method}`);
});