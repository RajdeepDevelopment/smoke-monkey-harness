// basic-agent.ts — the minimal looping agent (read verbatim by harness_read_example)
import { createAgent } from '@smoke-monkey/harness';

const agent = createAgent({
  provider: process.env.PROVIDER ?? 'nvidia',
  model: process.env.MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
  apiKey: process.env.NVIDIA_API_KEY,
  workspacePath: process.cwd(),
  autoApprove: true,
});

const result = await agent.run(process.argv.slice(2).join(' ') || 'List the files in this directory.');
console.log(result.status);
console.log(result.messages.filter((m) => m.content).at(-1)?.content);