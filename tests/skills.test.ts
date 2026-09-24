import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSkillFrontmatter, loadSkillsFromDirs } from '../src/skills.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'smoke-skills-'));
}

test('parseSkillFrontmatter: name/description from frontmatter', () => {
  const { frontmatter, body } = parseSkillFrontmatter(
    '---\nname: refactor-guide\ndescription: How to refactor safely.\n---\n\n# Guide\n\nBody.',
  );
  assert.equal(frontmatter.name, 'refactor-guide');
  assert.equal(frontmatter.description, 'How to refactor safely.');
  assert.match(body, /Body/);
});

test('parseSkillFrontmatter: folded block scalar description is flattened', () => {
  const { frontmatter } = parseSkillFrontmatter(
    '---\ndescription: >-\n  Improve MCP integration\n  and provider config.\n---\n\nBody.',
  );
  assert.equal(
    frontmatter.description,
    'Improve MCP integration and provider config.',
  );
});

test('parseSkillFrontmatter: no frontmatter returns empty map + trimmed body', () => {
  const { frontmatter, body } = parseSkillFrontmatter('  # Plain heading\n');
  assert.deepEqual(frontmatter, {});
  assert.equal(body, '# Plain heading');
});

test('loadSkillsFromDirs discovers SKILL.md folders', () => {
  const root = tempDir();
  try {
    const skillDir = join(root, 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: My Skill\ndescription: Does a thing.\n---\n\n# My Skill\n\nSteps.\n',
    );
    const skills = loadSkillsFromDirs([root]);
    assert.equal(skills.length, 1);
    assert.equal(skills[0].id, 'my-skill');
    assert.equal(skills[0].name, 'My Skill');
    assert.equal(skills[0].description, 'Does a thing.');
    assert.match(skills[0].content, /Steps/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loadSkillsFromDirs tolerates a missing dir', () => {
  const skills = loadSkillsFromDirs([join(tmpdir(), 'does-not-exist-123456')]);
  assert.equal(skills.length, 0);
});