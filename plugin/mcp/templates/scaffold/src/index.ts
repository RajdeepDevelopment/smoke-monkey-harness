/**
 * {{AGENT_NAME}} — a looping AI agent built on @smoke-monkey/harness.
 *
 *   npm install
 *   export NVIDIA_API_KEY=nvapi-...
 *   npm run dev -- "write a README for this repo"
 *
 * Swap the provider/model for any tool-capable LLM (openai, openrouter, xai,
 * gemini, ollama, ...). This file is your entry point — wire UI events,
 * load mcp servers, register skills/sub-contexts, then run().
 */
import { createAgent } from '@smoke-monkey/harness';

function promptUser(question: string): Promise<string> {
  // Point this at your UI — a chat input, a form, a RPC call, anywhere the
  // human can answer. Kept as a plain terminal prompt here so the scaffold runs.
  return Promise.resolve(`(placeholder answer for: ${question})`);
}

async function main() {
  const task = process.argv.slice(2).join(' ') || 'Say hello and list the current directory.';

  const agent = createAgent({
    provider: process.env.PROVIDER ?? 'nvidia',
    model: process.env.MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
    apiKey: process.env.NVIDIA_API_KEY ?? process.env.LLM_API_KEY,
    workspacePath: process.cwd(),
    autoApprove: true, // remove for production and route permission.required to your UI

    // Register your own domain guidance (activatable with context_manage):
    // subContexts: [
    //   { id: 'team_rules', title: 'Team rules', summary: 'Repo conventions.',
    //     content: 'All public APIs are typed; no `any`.' },
    // ],
    //
    // Load SKILL.md folders (Claude Code / Codex / opencode format) just-in-time:
    // skillsDir: ['skills'],
    //
    // Add MCP servers (stdio or streamable-HTTP):
    // mcp: [{ id: 'github', name: 'github', description: 'GitHub API',
    //         url: 'https://api.githubcopilot.com/mcp/', headers: { authorization: 'Bearer ' + process.env.GITHUB_TOKEN } }],
  });

  // Route interactive pauses to your UI. With autoApprove: true, only ask_user pauses.
  agent.on('ask_user.required', (e) => {
    agent.respond((e.data as { toolCallId: string }).toolCallId, promptUser((e.data as { payload?: { question?: string } }).payload?.question ?? ''));
  });
  agent.on('permission.required', (e) => {
    agent.resolvePermission((e.data as { toolCallId: string }).toolCallId, 'allow');
  });
  agent.on('mcp.approval_required', (e) => {
    agent.resolveMcpDecision((e.data as { toolCallId: string }).toolCallId, { action: 'enable', names: (e.data as { payload?: { recommendedToEnableIds?: string[] } }).payload?.recommendedToEnableIds ?? [] });
  });

  agent.onAny((e) => {
    if (e.type === 'tool.completed' || e.type === 'tool.failed') {
      const toolCallId = (e.data as { toolCallId?: string }).toolCallId ?? '';
      console.log(`[tool] ${toolCallId} ${e.type.slice(5)}`);
    }
  });

  const result = await agent.run(task);
  console.log(`\n-- run ${result.status} ------------------------------------------------------------------`);
  console.log(result.messages.map((m) => m.content || '').filter(Boolean).at(-1) ?? '(no output)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});