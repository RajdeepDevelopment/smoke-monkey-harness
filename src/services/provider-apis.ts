/**
 * Direct cloud LLM providers (OpenAI-compatible `/chat/completions`).
 *
 * Each provider resolves a Bearer key from conventional env vars (via
 * `envKey`) and posts to a native endpoint — no proxy required. Providers
 * here stream by default; the harness consumes the SSE stream and surfaces
 * reasoning/tool-calls exactly like the first-party endpoints.
 *
 * Add a provider here, to `envKey` in `src/keys.ts`, to `PROVIDER_CAPS` in
 * `src/services/run-context.ts`, and to the streaming set + guide docs.
 */
export const PROVIDER_ENDPOINTS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  zai: 'https://api.z.ai/api/paas/v4/chat/completions',
  moonshot: 'https://api.moonshot.ai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  cohere: 'https://api.cohere.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  together: 'https://api.together.xyz/v1/chat/completions',
  fireworks: 'https://api.fireworks.ai/inference/v1/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
};

/**
 * Conventional env var names per provider, tried in order. A provider may
 * list several (e.g. `QWEN_API_KEY` then the Alibaba DashScope legacy name).
 * An explicit `userKey` always wins; `LLM_API_KEY` is a last resort.
 */
export const PROVIDER_KEYS: Record<string, string[]> = {
  deepseek: ['DEEPSEEK_API_KEY'],
  qwen: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'],
  zai: ['ZAI_API_KEY'],
  moonshot: ['MOONSHOT_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  cohere: ['COHERE_API_KEY'],
  groq: ['GROQ_API_KEY'],
  together: ['TOGETHER_API_KEY'],
  fireworks: ['FIREWORKS_API_KEY'],
  cerebras: ['CEREBRAS_API_KEY'],
};

/** First configured env key for a provider, else undefined. */
export function providerEnvKey(provider: string): string | undefined {
  for (const name of PROVIDER_KEYS[provider] ?? []) {
    if (process.env[name]) return process.env[name];
  }
  return process.env.LLM_API_KEY;
}