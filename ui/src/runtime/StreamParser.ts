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

/**
 * Every normalized event type. The `satisfies` + `Missing` pair makes adding a
 * type to `ChatStreamEvent` without listing it here a COMPILE error, so a new
 * event can never be silently dropped by `createNormalizedStreamParser`.
 */
const NORMALIZED_EVENT_TYPES = [
  'message:start', 'text:delta', 'reasoning:start', 'reasoning:delta',
  'tool:start', 'tool:delta', 'tool:result', 'tool:error',
  'prompt:ask', 'prompt:permission', 'prompt:mcp_approval', 'prompt:resolved',
  'artifact', 'source', 'usage',
  'agent:start', 'agent:step', 'agent:complete',
  'todos:updated', 'context:updated', 'checkpoint:created',
  'connection:status', 'message:complete', 'notice', 'error',
] as const satisfies readonly ChatStreamEvent['type'][];

type MissingEventTypes = Exclude<ChatStreamEvent['type'], (typeof NORMALIZED_EVENT_TYPES)[number]>;
const _allEventTypesListed: [MissingEventTypes] extends [never] ? true : never = true;
void _allEventTypesListed;

/**
 * A `StreamParser` that passes already-normalized `ChatStreamEvent`s straight
 * through — what a host wants when its server forwards `createHarnessBridge`
 * output unchanged. Unlike a hand-written list it covers every event type, so
 * run-level ones such as `checkpoint:created` (which enables the revert
 * control) are never silently skipped.
 */
export function createNormalizedStreamParser(): StreamParser {
  const parser = new StreamParser();
  for (const type of NORMALIZED_EVENT_TYPES) {
    parser.register(type, (data) => data as ChatStreamEvent);
  }
  return parser;
}
