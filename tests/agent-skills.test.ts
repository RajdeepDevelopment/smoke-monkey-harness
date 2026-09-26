import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_SKILL_CATEGORIES,
  agentSkillCategories,
  categoryToDomain,
  resolveBundledAgentSkillsDir,
  loadAgentSkillCatalog,
  loadAgentSkills,
  buildAgentSkillRegistry,
} from '../src/agent-skills.js';
import { existsSync, readdirSync } from 'node:fs';

test('AGENT_SKILL_CATEGORIES: four stock categories with ids + domains', () => {
  assert.deepEqual(
    AGENT_SKILL_CATEGORIES.map((c) => [c.id, c.domain]),
    [
      ['agent-skills-backend', 'backend'],
      ['agent-skills-frontend', 'frontend'],
      ['agent-skills-devops', 'devops'],
      ['agent-skills-qa', 'qa'],
    ],
  );
  assert.equal(agentSkillCategories().length, 4);
});

test('categoryToDomain: resolves stock ids and raw domains', () => {
  assert.equal(categoryToDomain('agent-skills-backend'), 'backend');
  assert.equal(categoryToDomain('frontend'), 'frontend');
  assert.equal(categoryToDomain('qa'), 'qa');
});

test('resolveBundledAgentSkillsDir: points at the bundled 25-skill folder', () => {
  const dir = resolveBundledAgentSkillsDir();
  assert.match(dir, /plugin[\\/]agent-skills[\\/]skills$/);
  assert.ok(existsSync(dir), 'bundled skills dir exists');
  const names = readdirSync(dir);
  assert.equal(names.length, 25);
  assert.ok(names.includes('test-driven-development'));
});

test('loadAgentSkillCatalog: shared catalog has phases/domains/aliases', () => {
  const catalog = loadAgentSkillCatalog();
  assert.equal(catalog.version, 1);
  assert.equal(Object.keys(catalog.phases).length, 25);
  assert.equal(Object.keys(catalog.domains).length, 25);
  assert.equal(Object.keys(catalog.aliases).length, 18);
});

test('loadAgentSkills: loads all 25 bundled skills with metadata', () => {
  const skills = loadAgentSkills();
  assert.equal(skills.length, 25);
  const tdd = skills.find((s) => s.id === 'test-driven-development');
  assert.ok(tdd);
  assert.match(tdd.content, /Test[ -]Driven/);
  assert.deepEqual(tdd.domains, ['backend', 'frontend', 'qa']);
  assert.equal(tdd.phase, 'build');
  const allHaveDomains = skills.every((s) => Array.isArray(s.domains) && s.domains.length > 0);
  assert.ok(allHaveDomains, 'every skill has a domains array');
});

test('loadAgentSkills: category filter returns only that domain set', () => {
  const backend = loadAgentSkills({ category: 'agent-skills-backend' });
  assert.ok(backend.length > 0 && backend.length < 25);
  for (const s of backend) {
    assert.ok(s.domains.includes('backend'), `${s.id} should serve backend`);
  }
  assert.ok(backend.some((s) => s.id === 'api-and-interface-design'));
  assert.ok(backend.some((s) => s.id === 'test-driven-development'));

  const qa = loadAgentSkills({ category: 'qa' });
  assert.ok(qa.length > 0 && qa.length < 25);
  for (const s of qa) assert.ok(s.domains.includes('qa'));

  // devops-only skill is exclusive to the devops category
  const devops = loadAgentSkills({ category: 'devops' });
  assert.ok(devops.some((s) => s.id === 'ci-cd-and-automation'));
  assert.ok(backend.every((s) => s.id !== 'ci-cd-and-automation'));
});

test('buildAgentSkillRegistry: category registry loads and de-dupes', () => {
  const registry = buildAgentSkillRegistry({ category: 'agent-skills-frontend' });
  assert.equal(registry.count, loadAgentSkills({ category: 'frontend' }).length);
  assert.ok(registry.get('frontend-ui-engineering'));
  assert.equal(registry.get('api-and-interface-design'), undefined);
});

test('loadAgentSkills: honor explicit skillsDir override', () => {
  const dir = resolveBundledAgentSkillsDir();
  const skills = loadAgentSkills({ skillsDir: dir });
  assert.equal(skills.length, 25);
});