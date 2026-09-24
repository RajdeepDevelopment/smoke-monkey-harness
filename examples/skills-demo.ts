/**
 * Skills demo — discover + use a SKILL.md just-in-time.
 *
 * Runs the agent with a real working tree, a skillsDir pointing at
 * examples/skills, and a task whose only correct approach is: inspect the tree,
 * list_skills, load "commit-message" with use_skill, then draft the message
 * following the skill. Proves the discover → load → apply loop with the
 * NVIDIA Hosted NIM model.
 *
 *   NVIDIA_API_KEY=nvapi-... npm run demo:skills
 */
import { createAgent } from '../src/index.js';

const agent = createAgent({
  provider: 'nvidia',
  model: process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
  apiKey: process.env.NVIDIA_API_KEY,
  workspacePath: process.cwd(),
  skillsDir: 'examples/skills',
  autoApprove: true,
});

agent.on('tool.completed', (e) => {
  console.log('[tool]', (e.data as { toolCallId: string }).toolCallId, String((e.data as { result?: { summary?: string; output?: string } }).result?.summary || '').slice(0, 120));
});

const result = await agent.run(
  'Inspect the current git changes in this repo and draft a commit message for them using the commit-message skill.',
);
console.log('\n-- run finished:', result.status, `(steps ${(result.messages.filter((m) => m.role === 'assistant' && m.toolCalls?.length).length)}, model ${result.model})`);
console.log('\nSkills registered on agent:', agent.skills.all().map((s) => s.id).join(', '));