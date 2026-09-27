import type { ChatStreamEvent } from '../types/stream';

/**
 * Normalizes raw provider chunks into `ChatStreamEvent` values.
 *
 * A transport feeds raw lines/chunks into `parseLine`; registered parsers map
 * each provider's `type` field onto the normalized event (or events) the
 * runtime understands. Multiple providers can register parsers on the same
 * instance — unknown `type` values are skipped.
 */
export type StreamParserFn = (
  data: unknown
) => ChatStreamEvent | ChatStreamEvent[] | null | undefined;

const DATA_PREFIX = 'data:';
const DONE = '[DONE]';

export class StreamParser {
  private parsers = new Map<string, StreamParserFn>();

  register(eventType: string, parser: StreamParserFn): this {
    this.parsers.set(eventType, parser);
    return this;
  }

  unregister(eventType: string): void {
    this.parsers.delete(eventType);
  }

  has(eventType: string): boolean {
    return this.parsers.has(eventType);
  }

  /** Parse an SSE `data:` line (or any serialized payload) into events. */
  parseLine(raw: string): ChatStreamEvent[] {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith(DATA_PREFIX)) {
      const payload = trimmed.slice(DATA_PREFIX.length).trim();
      if (!payload || payload === DONE) return [];
      return this.parseJSON(payload);
    }
    try {
      return this.parseJSON(trimmed);
    } catch {
      return [];
    }
  }

  /** Parse any object-shaped chunk (already parsed JSON, or a bare event). */
  parseJSON(payload: string): ChatStreamEvent[] {
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      return [];
    }
    if (Array.isArray(json)) {
      return json.flatMap((item) => this.parseObject(item));
    }
    return this.parseObject(json);
  }

  parseObject(json: unknown): ChatStreamEvent[] {
    if (typeof json !== 'object' || json === null) return [];
    const type = (json as { type?: unknown }).type;
    if (typeof type !== 'string') return [];
    const parser = this.parsers.get(type);
    if (!parser) return [];
    const result = parser(json);
    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  }
}