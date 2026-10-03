# 02. Quickstart & Provider Configuration

> ⭐️ **Love Smoke Monkey Harness?** Please support the project with a star on [GitHub](https://github.com/RajdeepDevelopment/smoke-monkey-harness)!
> 🌐 **Interactive Simulator:** Test the agent loop and stream live at [smoke-monkey-harness.vercel.app](https://smoke-monkey-harness.vercel.app/)

---


Build your first autonomous agent in under 3 minutes using `@smoke-monkey/harness`. This guide covers installation, LLM provider setup, dynamic API key resolvers, and building a running CLI agent with live streaming.

---

## 1. Installation

Install `@smoke-monkey/harness` via your package manager of choice:

```bash
# Using pnpm (recommended)
pnpm add @smoke-monkey/harness

# Using npm
npm install @smoke-monkey/harness

# Using yarn
yarn add @smoke-monkey/harness
```

### Requirements
- **Node.js**: `>= 18.0.0`
- **TypeScript**: `>= 5.0` (optional, full type definitions ship bundled)
- **Module format**: Supports both **ESM** (`import`) and **CommonJS** (`require`).

---

## 2. Setting Up an LLM Provider

Smoke Monkey standardizes LLM provider communication through an OpenAI-compatible runtime interface.

### The Reference Provider: NVIDIA NIM
The default out-of-the-box provider is **NVIDIA NIM** using the high-performance `nvidia/nemotron-3-super-120b-a12b` model.

Get a free developer API key from [NVIDIA API Catalog](https://integrate.api.nvidia.com) and export it to your environment:

```bash
export NVIDIA_API_KEY="nvapi-..."
```

### Supported Provider Matrix

| Provider | `provider` string | Default Model | Environment Variable | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **NVIDIA** *(Default)* | `'nvidia'` | `nvidia/nemotron-3-super-120b-a12b` | `NVIDIA_API_KEY` | High reasoning & fast tool calling. |
| **OpenAI** | `'openai'` | `gpt-5` | `OPENAI_API_KEY` | Standard OpenAI endpoints. |
| **OpenRouter** | `'openrouter'` | `anthropic/claude-3.7-sonnet` | `OPENROUTER_API_KEY` | Access to 200+ models via one key. |
| **xAI** | `'xai'` | `grok-4.6` | `XAI_API_KEY` | Fast reasoning support. |
| **Google Gemini** | `'gemini'` | `gemini-3-flash` | `GEMINI_API_KEY` | Native Google AI Studio key. |
| **Hugging Face** | `'huggingface'` | `Qwen/Qwen2.5-Coder-32B-Instruct` | `HUGGINGFACE_API_KEY` | Inference Providers router. |
| **Ollama (Local)** | `'ollama'` | `llama3.1:8b` | None required | 100% offline, privacy-first execution. |

> 18+ OpenAI-compatible providers stream out of the box — including **DeepSeek**
> (`deepseek`), **Qwen**/DashScope (`qwen`), **Z.ai GLM** (`zai`), **Moonshot Kimi**
> (`moonshot`), **Mistral**, **Cohere**, **Groq**, **Together**, **Fireworks**, and
> **Cerebras**. See [`docs/providers.md`](../providers.md) for the full matrix.

---

## 3. Dynamic API Key Resolution (Multi-Tenant)

For production services serving multiple users, avoid static environment keys. Pass an asynchronous or synchronous resolver function:

```ts
import { createAgent } from '@smoke-monkey/harness';

const agent = createAgent({
  provider: 'nvidia',
  workspacePath: '/path/to/project',
  // Dynamic resolution based on user ID or organizational tenant
  apiKey: async (provider, userId) => {
    const credentials = await database.getTenantKey(userId, provider);
    return credentials.apiKey;
  },
  userId: 'usr_enterprise_908',
});
```

---

## 4. Your First Autonomous Agent

Create a file named `agent.ts` and run it with `tsx agent.ts`:

```ts
import { createAgent } from '@smoke-monkey/harness';

async function main() {
  // 1. Initialize the agent
  const agent = createAgent({
    provider: 'nvidia',
    model: 'nvidia/nemotron-3-super-120b-a12b',
    workspacePath: process.cwd(),
    autoApprove: true, // Auto-approve read and edit operations for this script
  });

  console.log('🚀 Agent initialized. Running task...\n');

  // 2. Stream tokens in real time
  agent.on('text.delta', (e) => {
    process.stdout.write(e.data.delta);
  });

  // 3. Log tool activity
  agent.on('tool.started', (e) => {
    console.log(`\n⚡ Tool invoked: ${e.data.toolName}`);
  });

  // 4. Execute an autonomous coding task
  const result = await agent.run('Inspect this directory and count the lines of TypeScript code in src/');

  console.log('\n\n✅ Task finished with status:', result.status);
  console.log('Total tokens used:', result.tokens.total);
}

main().catch(console.error);
```

---

## 5. Handling Interactive Pauses in the Terminal

When `autoApprove: false` is set (default), the agent pauses before executing mutating tools or when asking questions:

```ts
import { createAgent } from '@smoke-monkey/harness';
import * as readline from 'readline/promises';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const agent = createAgent({
  workspacePath: process.cwd(),
  autoApprove: false, // Enforce interactive human permissions
});

// Pause 1: Tool Permission Confirmation
agent.on('permission.required', async (e) => {
  const answer = await rl.question(
    `\n⚠️  The agent wants to execute "${e.data.toolName}". Allow? (y/n): `
  );
  await agent.resolvePermission(e.data.toolCallId, answer.trim().toLowerCase() === 'y' ? 'allow' : 'deny');
});

// Pause 2: Clarification Questions
agent.on('ask_user.required', async (e) => {
  const answer = await rl.question(`\n❓ The agent is asking: "${e.data.question}"\nYour answer: `);
  await agent.respond(e.data.toolCallId, answer);
});

// Run a task that requires editing files
await agent.run('Refactor the logger in src/utils/logger.ts');
```

---

## 6. Next Steps

- Understand how the 6-phase state machine prevents infinite loops: [03. The 6-Phase Agent Loop](03-agent-loop.md)
- Learn how to register custom tools and schemas: [04. Tool System](04-tools.md)
- Connect external databases and GitHub via MCP: [06. Model Context Protocol](06-mcp.md)
