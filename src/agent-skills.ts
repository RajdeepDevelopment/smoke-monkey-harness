/**
 * Bundled Agent Skills — category-wise exposure of the skills shipped in
 * `plugin/agent-skills/skills` (the 25 production-engineering skills from
 * addyosmani/agent-skills) as loadable SKILL.md `Skill` objects.
 *
 * The bundled MCP server (`agent-skills-backend`, `-frontend`, `-devops`,
 * `-qa` stock entries) serves these over MCP. This module lets the library
 * consume the SAME bundled SKILL.md folders directly as skills, filtered by
 * category/domain — so a run can pull e.g. just the backend skill set into a
 * `SkillRegistry` without spawning an MCP process.
 *
 * Single source of truth: `plugin/agent-skills/catalog.json` (phases/domains/
 * aliases) is shared by the bundled server and this module, so the category
 * mapping can never drift from what the MCP server reports.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  loadSkillsFromDir,
  SkillRegistry,
  type Skill,
} from './skills.js';

/** A category maps to a stock-entry id plus the catalog domain it covers. */
export interface AgentSkillCategory {
  /** Stock MCP entry id, e.g. `agent-skills-backend`. */
  id: string;
  /** Catalog domain this category covers (`backend`|`frontend`|`devops`|`qa`). */
  domain: string;
  /** Human display label. */
  label: string;
  /** One-line description (mirrors the stock entry). */
  description: string;
}

/**
 * The four category-wise skill sets, mirroring the `agent-skills-*` entries in
 * the stock MCP catalog (see src/mcp.ts). `data` and `meta` skills exist in
 * the catalog but aren't exposed as stock activation categories.
 */
export const AGENT_SKILL_CATEGORIES: AgentSkillCategory[] = [
  {
    id: 'agent-skills-backend',
    domain: 'backend',
    label: 'Agent Skills · Backend',
    description:
      'Bundled backend engineering skills (API design, TDD, security, performance) as loadable SKILL.md skills.',
  },
  {
    id: 'agent-skills-frontend',
    domain: 'frontend',
    label: 'Agent Skills · Frontend',
    description:
      'Bundled frontend engineering skills (UI engineering, accessibility, browser testing) as loadable SKILL.md skills.',
  },
  {
    id: 'agent-skills-devops',
    domain: 'devops',
    label: 'Agent Skills · DevOps',
    description:
      'Bundled DevOps skills (CI/CD, observability, git workflow, shipping) as loadable SKILL.md skills.',
  },
  {
    id: 'agent-skills-qa',
    domain: 'qa',
    label: 'Agent Skills · QA',
    description:
      'Bundled QA skills (test-driven development, debugging, verification) as loadable SKILL.md skills.',
  },
];

export interface AgentSkillsCatalog {
  version: number;
  phases: Record<string, string>;
  domains: Record<string, string[]>;
  aliases: Record<string, string[]>;
}

export interface LoadAgentSkillsOptions {
  /** Filter to a single category (stock id, e.g. `agent-skills-backend`) or raw domain. */
  category?: string;
  /** Explicit skills dir override (tests / custom layouts). */
  skillsDir?: string;
  /** Explicit catalog path override (tests / custom layouts). */
  catalogPath?: string;
}

/** Domain represented by a category id / raw domain string. */
export function categoryToDomain(category: string): string | undefined {
  const c = category.trim().toLowerCase();
  const exact = AGENT_SKILL_CATEGORIES.find((x) => x.id === c);
  if (exact) return exact.domain;
  return c;
}

/**
 * Absolute path of the bundled `plugin/agent-skills/skills` directory.
 * Resolved through the package `exports` subpath so it works in both ESM and
 * CJS builds and in dev/link checkouts (same technique as the stock MCP
 * bundled-server resolver in src/mcp.ts).
 */
export function resolveBundledAgentSkillsDir(): string {
  const requireCwd = createRequire(join(process.cwd(), '__smoke_monkey_resolve__.js'));
  const server = requireCwd.resolve('smoke-monkey-harness/plugin/agent-skills/mcp/server.mjs');
  return join(dirname(server), '..', 'skills');
}

/** Reads the shared `plugin/agent-skills/catalog.json` (phases/domains/aliases). */
export function loadAgentSkillCatalog(options: LoadAgentSkillsOptions = {}): AgentSkillsCatalog {
  const catalogPath =
    options.catalogPath ?? join(resolveBundledAgentSkillsDir(), '..', 'catalog.json');
  return JSON.parse(readFileSync(catalogPath, 'utf8')) as AgentSkillsCatalog;
}

/**
 * Loads the bundled agent-skills folder as `Skill[]`, tagging each skill with
 * its catalog `domains` and lifecycle `phase`. When `category` is passed the
 * list is filtered to skills serving that category's domain.
 *
 * Domain-only skills (e.g. the `meta` skill `using-agent-skills`) match by
 * domain like everything else; categories are the four stock domains above.
 */
export function loadAgentSkills(options: LoadAgentSkillsOptions = {}): Skill[] {
  const skillsDir = options.skillsDir ?? resolveBundledAgentSkillsDir();
  const catalog = loadAgentSkillCatalog(options);
  let skills = loadSkillsFromDir(skillsDir);

  const filter = options.category
    ? categoryToDomain(options.category)
    : undefined;
  if (filter) {
    skills = skills.filter((s) =>
      (catalog.domains[s.id] ?? []).includes(filter)
    );
  }

  return skills.map((s) => ({
    ...s,
    domains: catalog.domains[s.id] ?? [],
    phase: catalog.phases[s.id] ?? 'build',
  }));
}

/**
 * Builds a `SkillRegistry` from the bundled agent-skills, optionally filtered
 * to one category (e.g. `agent-skills-backend`) or a raw domain.
 */
export function buildAgentSkillRegistry(options: LoadAgentSkillsOptions = {}): SkillRegistry {
  const registry = new SkillRegistry();
  for (const skill of loadAgentSkills(options)) registry.add(skill);
  return registry;
}

/** All four categories (`AGENT_SKILL_CATEGORIES`), labels + ids for docs/tests. */
export function agentSkillCategories(): AgentSkillCategory[] {
  return AGENT_SKILL_CATEGORIES.map((c) => ({ ...c }));
}