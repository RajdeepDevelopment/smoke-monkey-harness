import type { ChatStreamEvent } from '../types/stream';
import type { ChatRequest, ChatTransport } from '../types/transport';
import { StreamParser } from '../runtime/StreamParser';
import { toChatError } from '../types/stream';
import { readSSELines } from '../lib/sse';

export interface FetchTransportOptions {
  /** Endpoint to POST to. */
  url: string;
  /** Static or dynamic headers (useful for auth tokens). */
  headers?:
    | Record<string, string>
    | (() => Record<string, string>)
    | (() => Promise<Record<string, string>>);
  /** Defaults to POST. */
  method?: string;
  credentials?: RequestCredentials;
  /**
   * Maps raw SSE `data:` payloads to normalized events. Use `StreamParser`
   * with `.register(...)` for each provider type, or a custom function.
   */
  parser:
    | StreamParser
    | ((payload: unknown, request: ChatRequest) => ChatStreamEvent | ChatStreamEvent[] | null);
  /** Serializes the request to the provider's expected JSON body. */
  body?: (request: ChatRequest) => unknown;
  /** Injectable fetch (testing, Node 18+ polyfills). */
  fetch?: typeof fetch;
}

/**
 * Generic SSE `fetch` transport. Posts the normalized `ChatRequest` and turns
 * the `text/event-stream` response into `ChatStreamEvent`s via the parser.
 * Honours `request.signal` (abort = stop streaming).
 */
export class FetchTransport implements ChatTransport {
  private readonly streamParser: StreamParser | null;

  constructor(private readonly options: FetchTransportOptions) {
    this.streamParser = this.options.parser instanceof StreamParser ? this.options.parser : null;
  }

  async *send(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const headers: Record<string, string> = await resolveHeaders(this.options.headers ?? {});
    const body = this.options.body ? this.options.body(request) : defaultBody(request);
    const doFetch = this.options.fetch ?? fetch;

    let response: Response;
    try {
      response = await doFetch(this.options.url, {
        method: this.options.method ?? 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
        credentials: this.options.credentials,
        signal: request.signal,
      });
    } catch (err) {
      if (isAbortError(err)) return;
      yield { type: 'error', error: toChatError(messageOf(err)) };
      return;
    }

    if (!response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch {
        /* ignore body read failure */
      }
      yield {
        type: 'error',
        error: {
          code: `http_${response.status}`,
          message: `Request failed (${response.status}${detail ? `: ${detail.slice(0, 120)}` : ''})`,
          retryable: response.status >= 500,
        },
      };
      return;
    }

    if (!response.body) {
      yield {
        type: 'error',
        error: { code: 'no_stream', message: 'Response had no body stream', retryable: false },
      };
      return;
    }

    for await (const line of readSSELines(response.body)) {
      if (request.signal?.aborted) return;
      const events = this.parse(line, request);
      for (const event of events) yield event;
    }
  }

  private parse(line: string, request: ChatRequest): ChatStreamEvent[] {
    if (this.streamParser) return this.streamParser.parseLine(line);
    const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
    if (!payload || payload === '[DONE]') return [];
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      return [];
    }
    const result = (this.options.parser as (p: unknown, r: ChatRequest) => ChatStreamEvent | ChatStreamEvent[] | null)(json, request);
    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  }
}

function defaultBody(request: ChatRequest): Record<string, unknown> {
  return {
    conversationId: request.conversationId,
    model: request.model,
    system: request.system,
    text: request.text,
    messages: request.messages,
    options: request.options,
  };
}

function resolveHeaders(input: FetchTransportOptions['headers']): Promise<Record<string, string>> {
  if (typeof input === 'function') return Promise.resolve().then(() => input());
  return Promise.resolve(input ?? {});
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}