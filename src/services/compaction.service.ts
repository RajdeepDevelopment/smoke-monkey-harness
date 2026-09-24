import { Logger } from '../logger.js';
import { KeyResolver } from '../keys.js';
import { LLMMessage, ContextSnapshot, estimateTokens, resolveTokenBudget } from './run-context.js';

export interface CompactRunContextResult {
  summary: string;
  tokensSaved: number;
  /** The messages to keep (recent tail, cut at a pair-safe boundary). */
  kept: LLMMessage[];
  /**
   * Index into the caller's message array marking the first KEPT message.
   * The caller maps this onto persisted-row coverage (leading system/snapshot
   * entries are synthetic and must not be counted as rows).
   */
  cutIndex: number;
}

export interface CompactionDeps {
  /** Resolves the model API key (same resolver the LLM client uses). */
  getApiKey: KeyResolver;
  /** Persists a visible checkpoint marker so the transcript stays transparent. */
  appendCheckpoint: (sessionId: string, summary: string) => Promise<void>;
}

/**
 * Context compaction for the harness. `compactRunContext` compacts the LIVE
 * in-memory run conversation: old turns are replaced by a model-written summary
 * in every subsequent LLM call of the run. Pure with respect to the caller's
 * message array — it returns the kept tail; the runner rewrites its context.
 */
export class ContextCompactionService {
  private readonly logger = new Logger(ContextCompactionService.name);

  constructor(private readonly deps: CompactionDeps) {}

  async compactRunContext(opts: {
    sessionId: string;
    messages: LLMMessage[];
    provider?: string;
    model?: string;
    userId?: string;
  }): Promise<CompactRunContextResult | null> {
    const { sessionId, messages, provider, model, userId } = opts;

    const estimated = estimateTokens(messages);
    if (estimated <= resolveTokenBudget(provider, model) * COMPACTION_THRESHOLD) {
      return null;
    }
    if (messages.length < KEEP_RECENT_MESSAGES + 4) return null;

    const cut = findSafeCutIndex(messages, KEEP_RECENT_MESSAGES);
    if (cut <= 1) return null; // nothing safely compactable

    const toCompact = messages.slice(1, cut); // skip leading system prompt
    const kept = [...messages.slice(0, 1), ...messages.slice(cut)];

    this.logger.log(`Compacting run context for ${sessionId}: ~${estimated} tokens → summarizing ${toCompact.length} messages`);

    const summary = await this.summarizeMessages(
      toCompact.map((m) => ({
        role: m.role,
        content: m.content ?? '',
        toolNames: (m.tool_calls || []).map((tc) => tc.function.name),
      })),
      provider,
      model,
      userId,
    );

    await this.deps.appendCheckpoint(sessionId, summary);

    const compactedChars = toCompact.reduce(
      (sum, m) =>
        sum +
        (m.content?.length ?? 0) +
        (m.tool_calls ? m.tool_calls.reduce((s, tc) => s + tc.function.arguments.length, 0) : 0),
      0,
    );

    return {
      summary,
      tokensSaved: Math.ceil(compactedChars / CHARS_PER_TOKEN),
      kept,
      cutIndex: cut,
    };
  }

  private async summarizeMessages(
    messages: Array<{ role: string; content: string; toolNames?: string[] }>,
    provider?: string,
    model?: string,
    userId?: string,
  ): Promise<string> {
    const conversation = messages
      .map((m) => {
        const role = m.role.toUpperCase();
        let content = m.content;
        if (m.toolNames && m.toolNames.length > 0) {
          content += `\n${m.toolNames.map((n) => `[Called: ${n}]`).join(' ')}`;
        }
        return `${role}: ${content.slice(0, 1000)}`;
      })
      .join('\n\n');

    const prompt = `You are a conversation summarizer. Create a structured summary of the following coding conversation. Focus on:

1. **Objective**: What the user asked for
2. **Files explored**: Which files were read/mentioned
3. **Files changed**: What was modified
4. **Key findings**: Root causes, bugs found, patterns identified
5. **Current state**: Where the work stopped, what was completed vs pending
6. **Important discoveries**: Any gotchas, constraints, or requirements
7. **Next steps**: What should happen next

Be concise but preserve critical details. A developer reading this summary should be able to continue the work without re-reading the full conversation.

CONVERSATION TO SUMMARIZE:
${conversation}

SUMMARY:`;

    try {
      const baseUrl = process.env.LLM_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const modelName = model || process.env.AGENT_MODEL || 'qwen3:8b';

      let url = baseUrl;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const userKey = await this.deps.getApiKey(provider || 'ollama', userId);

      if (provider === 'nvidia') {
        const nvidiaKey = userKey || process.env.NVIDIA_API_KEY || '';
        if (nvidiaKey) headers['Authorization'] = `Bearer ${nvidiaKey}`;
        url = `https://integrate.api.nvidia.com/v1/chat/completions`;
      } else if (provider === 'openai') {
        const openaiKey = userKey || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '';
        if (openaiKey) headers['Authorization'] = `Bearer ${openaiKey}`;
        url = `https://api.openai.com/v1/chat/completions`;
      } else if (provider === 'openrouter') {
        const orKey = userKey || process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY || '';
        if (orKey) headers['Authorization'] = `Bearer ${orKey}`;
        url = `https://openrouter.ai/api/v1/chat/completions`;
      } else if (provider === 'xai') {
        const xaiKey = userKey || process.env.XAI_API_KEY || '';
        if (xaiKey) headers['Authorization'] = `Bearer ${xaiKey}`;
        url = `https://api.x.ai/v1/chat/completions`;
      } else if (provider === 'gemini') {
        const geminiKey = userKey || process.env.GEMINI_API_KEY || '';
        if (geminiKey) headers['Authorization'] = `Bearer ${geminiKey}`;
        url = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
      } else if (provider === 'opencode') {
        const ocKey = userKey || process.env.OPENCODE_API_KEY || process.env.LLM_API_KEY || '';
        if (ocKey) headers['Authorization'] = `Bearer ${ocKey}`;
        url = `https://opencode.ai/zen/v1/chat/completions`;
      } else if (provider === 'ollama' || !provider) {
        url = `${baseUrl}/api/chat`;
        const apiKey = userKey || process.env.LLM_API_KEY || '';
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const body: Record<string, unknown> = {
        model: modelName,
        messages: [
          {
            role: 'system',
            content: 'You are a conversation summarizer for a coding agent. Output only the summary, no preamble.',
          },
          { role: 'user', content: prompt },
        ],
        stream: false,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = (await response.json()) as any;

      if (provider === 'ollama' || !provider) {
        return data.message?.content || this.fallbackSummary(messages as any);
      }

      return data.choices?.[0]?.message?.content || this.fallbackSummary(messages as any);
    } catch (err) {
      this.logger.warn(`LLM summary failed, using fallback: ${err}`);
      return this.fallbackSummary(messages as any);
    }
  }

  private fallbackSummary(messages: Array<{ role: string; content: string }>): string {
    const roles = new Set(messages.map((m) => m.role));
    const userMessages = messages.filter((m) => m.role === 'user');
    const lastUserMsg = userMessages[userMessages.length - 1]?.content.slice(0, 500) || 'unknown';

    const fileMentions = new Set<string>();
    for (const msg of messages) {
      const matches = msg.content.match(/(?:read|write|edit|patch)\w*\s+([^\s\n]+)/gi);
      if (matches) {
        for (const match of matches) {
          const file = match.split(/\s+/).pop();
          if (file) fileMentions.add(file);
        }
      }
    }

    return `## Auto-Compressed Summary
- **Participants**: ${Array.from(roles).join(', ')}
- **Messages compressed**: ${messages.length}
- **Files mentioned**: ${fileMentions.size > 0 ? Array.from(fileMentions).join(', ') : 'none detected'}
- **Last request**: ${lastUserMsg}
- **Compression**: Automatic (context window > 70% full)`;
  }
}

export const CHARS_PER_TOKEN = 4;
const KEEP_RECENT_MESSAGES = 10;
const COMPACTION_THRESHOLD = 0.7;

/**
 * Returns an index `i` such that slicing [i..] keeps at least `keep` messages
 * and never separates an assistant tool_calls message from its tool results.
 * Walks BACKWARD from the desired cut to the nearest safe boundary.
 */
export function findSafeCutIndex(messages: LLMMessage[], keep: number): number {
  let cut = Math.max(1, messages.length - keep);
  while (cut > 1 && isUnsafeCut(messages, cut)) cut--;
  return cut;
}

/** A cut at `i` is unsafe if it orphans tool results or their assistant call. */
function isUnsafeCut(messages: LLMMessage[], i: number): boolean {
  if (messages[i]?.role === 'tool') return true;
  const prev = messages[i - 1];
  if (prev?.role === 'assistant' && prev.tool_calls?.length) return true;
  return false;
}

// Re-export the snapshot merge helper used by the runner.
export function mergeSnapshot(prev: ContextSnapshot, summary: string, cutIndex: number): ContextSnapshot {
  return {
    task: prev.task,
    summary: prev.summary ? `${prev.summary}\n\n---\n\n${summary}` : summary,
    coveredMessages: Math.max(prev.coveredMessages || 0, cutIndex),
    filesRead: prev.filesRead || [],
    filesModified: prev.filesModified || [],
    decisions: prev.decisions || [],
    errors: prev.errors || [],
    plan: prev.plan || [],
    activeSubContexts: prev.activeSubContexts || [],
    activeContexts: prev.activeContexts || [],
  };
}