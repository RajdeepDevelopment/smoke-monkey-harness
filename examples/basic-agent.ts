/**
 * Basic usage — run an agent against a local Ollama instance (no API key).
 *
 *   npm run example
 *
 * Or swap the provider for any supported cloud:
 *   createAgent({ provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet',
 *                 apiKey: process.env.OPENROUTER_API_KEY, workspacePath })
 */
import { createAgent } from '../src/index.js';

const agent = createAgent({
  provider: 'ollama',
  model: process.env.OLLAMA_MODEL || 'qwen3:8b',
  apiKey: process.env.OLLAMA_API_KEY,
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