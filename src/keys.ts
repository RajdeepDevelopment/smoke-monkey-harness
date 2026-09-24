/**
 * API-key resolution for provider calls. The harness never stores keys — the
 * caller owns the key store (env, vault, per-user DB) and resolves on demand.
 */
export type KeyResolver = (
  provider: string,
  userId?: string,
) => Promise<string | undefined> | string | undefined;

/** Resolves from environment variables using conventional names per provider. */
export function envKey(provider: string): string | undefined {
  switch (provider) {
    case 'openai':
      return process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY;
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY ?? process.env.LLM_API_KEY;
    case 'nvidia':
      return process.env.NVIDIA_API_KEY;
    case 'xai':
      return process.env.XAI_API_KEY;
    case 'gemini':
      return process.env.GEMINI_API_KEY;
    case 'opencode':
      return process.env.OPENCODE_API_KEY ?? process.env.LLM_API_KEY;
    case 'omniroute':
      return process.env.OMNIROUTE_API_KEY || 'omniroute';
    default:
      return process.env.LLM_API_KEY;
  }
}