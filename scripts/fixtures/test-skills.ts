/**
 * Offline verification of the skills pipeline (no LLM):
 *   1. SKILL.md discovery from examples/skills
 *   2. Tool exposure: list_skills registered only when skills exist
 *   3. use_skill pushes the skill body into the run's runtimeInstructions
 */
import { AgentHarness, createAgent } from '../../src/index.js';
import { loadSkillsFromDir, SkillRegistry } from '../../src/index.js';
import { getListSkillsTool, getUseSkillTool } from '../../src/index.js';

const skillsDir = new URL('../../examples/skills/', import.meta.url).pathname;

// 1) Discovery
const discovered = loadSkillsFromDir(skillsDir);
console.log(`discovered ${discovered.length} skill(s): ${discovered.map((s) => s.id).join(', ')}`);
if (discovered.length < 1) throw new Error('expected at least one skill');
const commit = discovered.find((s) => s.id === 'commit-message');
if (!commit) throw new Error('expected commit-message skill');
if (!commit.description.includes('commit')) throw new Error('description missing');
if (!commit.content.includes('Conventional Commits')) throw new Error('content not parsed');
console.log(`  parse ok: "${commit.name}" | ${commit.description.slice(0, 60)}…`);

// 2) Registry + duplicate guard
const reg = new SkillRegistry();
reg.add(commit);
if (reg.add(commit).ok) throw new Error('duplicate should be rejected');
if (reg.count !== 1) throw new Error('count mismatch');
console.log('  registry ok (dup rejected, count =', reg.count + ')');

// 3) Tool exposure through the harness (skillsDir wiring inside createAgent)
const agent = createAgent({
  provider: 'nvidia',
  model: 'test',
  apiKey: 'test',
  workspacePath: '.',
  skillsDir,
  autoApprove: true,
}) as AgentHarness;

const dyn = agent as unknown as { loopDeps?: { toolRegistry?: { getAll(): Array<{ name: string }> } } };
const toolNames = (dyn.loopDeps?.toolRegistry?.getAll() ?? []).map((t) => t.name);
console.log(`registered tools: ${toolNames.join(', ')}`);
if (!toolNames.includes('list_skills') || !toolNames.includes('use_skill')) {
  throw new Error('skill tools missing');
}
if (agent.skills.count !== 1) throw new Error(`expected 1 skill on agent, got ${agent.skills.count}`);

// 4) use_skill injects into runtimeInstructions
const listTool = getListSkillsTool(agent.skills);
const useTool = getUseSkillTool(agent.skills);
const listRes = await listTool.execute({}, {} as never);
if (!/commit-message/.test(listRes.content?.[0]?.text ?? '')) throw new Error('list_skills output missing skill');
const instrs: string[] = [];
const useRes = await useTool.execute({ skillId: 'commit-message' }, { runtimeInstructions: instrs } as never);
if (useRes.isError) throw new Error('use_skill failed');
if (instrs.length !== 1 || !instrs[0].includes('## Skill: Commit Message')) {
  throw new Error('use_skill did not push into runtimeInstructions');
}
console.log('  list_skills + use_skill injection ok');

// 5) Unknown id is a clean error
const bad = await useTool.execute({ skillId: 'nope' }, { runtimeInstructions: instrs } as never);
if (!bad.isError) throw new Error('unknown skill should error');
console.log('\nSKILLS OK');
process.exit(0);