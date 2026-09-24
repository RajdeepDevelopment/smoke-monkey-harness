/**
 * Basic usage — run an agent against NVIDIA Hosted NIM (or any OpenAI-compatible provider).
 *
 *   NVIDIA_API_KEY=nvapi-... npm run example
 *
 * The model needs tool support (e.g. nvidia/nemotron-3-super-120b-a12b).
 * To use local Ollama instead:
 *   createAgent({ provider: 'ollama', model: 'qwen3:8b', workspacePath })   // no key needed
 */
import { createAgent } from '../src/index.js';

const agent = createAgent({
  provider: 'nvidia',
  model: process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
  apiKey: process.env.NVIDIA_API_KEY,
  workspacePath: process.cwd(),
});

agent.on('permission.required', (e) => {
  console.log(`\n[permission] ${e.data.toolName} ${JSON.stringify(e.data.args).slice(0, 120)}`);
  agent.resolvePermission(e.data.toolCallId, 'allow');
});

agent.on('ask_user.required', (e) => {
  console.log(`\n[ask_user] ${e.data.question}`);
  agent.respond(e.data.toolCallId, 'Do what makes sense. Proceed.');
});

agent.on('tool.completed', (e) => {
  const r = e.data.result as { success?: boolean } | undefined;
  const flag = r?.success === false ? 'FAIL' : 'ok';
  console.log(`[tool] ${flag} ${e.data.toolName} (${e.data.toolCallId.slice(0, 8)})`);
});

const task = process.argv.slice(2).join(' ') || 'List the files in this project and summarize what the codebase does.';

console.log(`\n> ${task}\n`);
const result = await agent.run(task);

console.log(`\n-- run finished: ${result.status} (steps ${result.agentState?.currentStep ?? '?'}) --`);
console.log(`tokens: ${result.agentState?.tokenUsage.input ?? result.messages.length} messages`);