export type ChatSourceType = 'web' | 'document' | 'knowledge' | 'file' | 'database';

/**
 * A retrievable source (RAG chunk, web result, file, knowledge entry).
 * Rendered as a numbered citation list below an assistant message.
 */
export interface ChatSource {
  id: string;
  title: string;
  url?: string;
  domain?: string;
  snippet?: string;
  type: ChatSourceType;
  score?: number;
  metadata?: Record<string, unknown>;
}

export function sourceDomain(source: ChatSource): string {
  if (source.domain) return source.domain;
  if (source.url) {
    try {
      return new URL(source.url).hostname.replace(/^www\./, '');
    } catch {
      return source.url;
    }
  }
  return source.type;
}