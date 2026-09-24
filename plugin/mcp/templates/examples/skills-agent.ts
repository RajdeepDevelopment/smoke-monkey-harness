// skills-agent.ts — just-in-time SKILL.md usage
// Point skillsDir at a folder of SKILL.md bundles. The model browses with
// list_skills and loads what it needs with use_skill — nothing is in context
// until used. Compatible with Claude Code / Codex / opencode skill folders.
import { createAgent } from 'smoke-monkey-harness';

const agent = createAgent({
  provider: process.env.PROVIDER ?? 'nvidia',
  model: process.env.MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
  apiKey: process.env.NVIDIA_API_KEY,
  workspacePath: process.cwd(),
  skillsDir: process.env.SKILLS_DIR ?? 'skills', // e.g. .opencode/skills
  autoApprove: true,
});

console.log('registered skills:', agent.skills.all().map((s) => s.id).join(', '));

const result = await agent.run(
  'Follow the repo conventions to sum up the recent work — load any applicable skill first.',
);
console.log(result.status);