import { createId } from '../lib/id';
import type { ChatErrorInfo, ChatStreamEvent, ConnectionStatus } from '../types/stream';
import type { ChatPromptResponse, ChatRequest, ChatTransport } from '../types/transport';
import type { ChatPromptOption } from '../types/prompt';
import type { ToolPresentation } from '../types/tools';

export interface SyntheticStreamOptions {
  /** Delay in ms between event batches. */
  tickMs?: number;
  /** If set, generate events for this many steps before the reply. */
  agentSteps?: string[];
  /** Include a demo web search tool call before the final answer. */
  includeToolCall?: boolean;
  /** Include a synthesized chart artifact (bar chart of fantasy data). */
  includeChart?: boolean;
  /** Markdown body of the answer. */
  answer?: string;
  /** Start status emitted before the message. */
  onConnect?: boolean;
  /**
   * Non-terminal failures to surface before the answer, so a component test or
   * a demo can exercise every error level without a server.
   */
  notices?: ChatErrorInfo[];
  /** Emit a failing tool call before the successful one. */
  failingTool?: { toolCallId: string; toolName: string; error: ChatErrorInfo };
  /**
   * Terminal failure. When set, the stream ends with an `error` event instead
   * of `message:complete`.
   */
  failWith?: ChatErrorInfo;
  /**
   * Ask the user something and wait for the answer, the way a real run does.
   *
   * The run genuinely pauses here: the generator suspends until `respond()` is
   * called, which is the whole point — a fixture that resolved the prompt by
   * itself would not exercise the deadlock this exists to prevent.
   */
  askUser?: {
    toolCallId: string;
    question: string;
    options?: ChatPromptOption[];
    multiple?: boolean;
  };
  /** Emit a permission request and wait for allow/deny, same as `askUser`. */
  requestPermission?: { toolCallId: string; toolName: string; input?: unknown };
  /** Called with the answer once `respond()` resolves the prompt. */
  onPromptAnswered?: (answer: string) => void;
  /**
   * Custom tools to stream instead of the built-in web search, each carrying
   * the presentation a Node host declared for it.
   */
  customTools?: Array<{
    toolCallId: string;
    toolName: string;
    presentation?: ToolPresentation;
    input: Record<string, unknown>;
    result: unknown;
  }>;
}

const DEMO_ANSWER =
  'Sure — here’s a quick synthesis of what I found.\n\n' +
  '1. **Shadow DOM scoping** keeps component styles isolated.\n' +
  '2. **CSS containment** (`contain: content`) is your first cheap win.\n' +
  '3. For large virtualized grids, prefer `content-visibility: auto`.\n\n' +
  '> All recommendations verified against the current baseline.\n\n' +
  '| Technique | Effort | Impact |\n' +
  '| --- | --- | --- |\n' +
  '| contain: content | Low | Medium |\n' +
  '| content-visibility: auto | Low | High |\n' +
  '| CSS layers | Medium | High |';

/**
 * Deterministic offline transport — streams a canned answer (with optional
 * agent steps, a tool call, sources, reasoning and a chart) exactly the way a
 * real backend would. Perfect for UI demos and component tests without a server.
 */
export class SyntheticTransport implements ChatTransport {
  /** toolCallId -> the resolver waiting on it. */
  private readonly pending = new Map<string, (answer: string) => void>();

  constructor(private readonly options: SyntheticStreamOptions = {}) {}

  /**
   * Answer the prompt the run is paused on, resuming the stream.
   *
   * Answers for an unknown prompt are ignored rather than thrown: a double
   * click, or an answer that races the run finishing, should not surface as an
   * error in the UI.
   */
  respond(response: ChatPromptResponse): void {
    const resolve = this.pending.get(response.toolCallId);
    if (!resolve) return;
    this.pending.delete(response.toolCallId);
    resolve(response.answer);
  }

  private waitForAnswer(toolCallId: string): Promise<string> {
    return new Promise<string>((resolve) => {
      this.pending.set(toolCallId, resolve);
    });
  }

  async *send(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const messageId = createId('msg');
    const tick = () => delay(this.options.tickMs ?? 40);
    const status: ConnectionStatus = 'connected';

    if (this.options.onConnect ?? true) {
      yield { type: 'connection:status', status };
    }

    yield { type: 'message:start', messageId, conversationId: request.conversationId, model: request.model ?? 'smoke-monkey-demo' };
    await tick();

    if (this.options.agentSteps?.length) {
      yield { type: 'agent:start', messageId };
      for (const title of this.options.agentSteps) {
        await tick();
        yield { type: 'agent:step', messageId, stepId: title, title, status: 'running' };
        await tick();
        yield { type: 'agent:step', messageId, stepId: title, title, status: 'complete' };
      }
      yield { type: 'agent:complete', messageId };
      await tick();
    }

    yield { type: 'reasoning:start', messageId };
    const reasoning = 'Scanning rendered HTML for paint-time bottlenecks…';
    for (const char of reasoning) {
      yield { type: 'reasoning:delta', messageId, delta: char };
    }
    await tick();

    for (const notice of this.options.notices ?? []) {
      await tick();
      yield { type: 'notice', messageId, error: notice };
    }

    if (this.options.askUser) {
      const { toolCallId, question, options, multiple } = this.options.askUser;
      yield {
        type: 'prompt:ask',
        messageId,
        prompt: { kind: 'ask', toolCallId, question, options, multiple },
      };
      // Suspend exactly like a real run: nothing further is emitted until the
      // transport answers. A fixture that auto-answered would hide the bug.
      const answer = await this.waitForAnswer(toolCallId);
      this.options.onPromptAnswered?.(answer);
      await tick();
    }

    if (this.options.requestPermission) {
      const { toolCallId, toolName, input } = this.options.requestPermission;
      yield {
        type: 'prompt:permission',
        messageId,
        prompt: { kind: 'permission', toolCallId, question: `Allow ${toolName} to run?`, toolName, input },
      };
      const decision = await this.waitForAnswer(toolCallId);
      this.options.onPromptAnswered?.(decision);
      await tick();
    }

    if (this.options.failingTool) {
      const { toolCallId, toolName, error } = this.options.failingTool;
      yield { type: 'tool:start', messageId, toolCallId, toolName, input: { path: '/etc/hosts' } };
      await tick();
      yield { type: 'tool:error', messageId, toolCallId, error };
      await tick();
    }

    for (const tool of this.options.customTools ?? []) {
      yield {
        type: 'tool:start',
        messageId,
        toolCallId: tool.toolCallId,
        toolName: tool.toolName,
        input: tool.input,
        ...(tool.presentation ? { presentation: tool.presentation } : {}),
      };
      await tick();
      yield {
        type: 'tool:result',
        messageId,
        toolCallId: tool.toolCallId,
        result: tool.result,
      };
      await tick();
    }

    if (this.options.includeToolCall ?? true) {
      yield {
        type: 'tool:start',
        messageId,
        toolCallId: 't_1',
        toolName: 'web_search',
        input: { query: 'css rendering performance best practices' },
      };
      for (const char of '{"query":"…","results":42}') {
        yield { type: 'tool:delta', messageId, toolCallId: 't_1', delta: char };
      }
      yield {
        type: 'tool:result',
        messageId,
        toolCallId: 't_1',
        result: { results: 42, top: ['Shadow DOM', 'contain: content'] },
      };
      await tick();
    }

    if (this.options.includeChart ?? true) {
      yield {
        type: 'artifact',
        messageId,
        artifact: {
          type: 'chart',
          chartType: 'bar',
          title: 'Rendering cost by technique',
          data: [
            { name: 'Baseline', value: 34 },
            { name: 'contain', value: 52 },
            { name: 'visibility', value: 71 },
            { name: 'layers', value: 88 },
          ],
          config: { xKey: 'name', yKeys: ['value'], colors: ['#8b5cf6', '#22d3ee'] },
        },
      };
      await tick();
    }

    yield { type: 'source', messageId, source: { id: 'src_1', title: 'Using CSS containment', url: 'https://web.dev/content-visibility', type: 'web' } };
    yield { type: 'source', messageId, source: { id: 'src_2', title: 'Shadow DOM styling', url: 'https://developer.mozilla.org/docs/Web/API/Web_Components/Using_shadow_DOM', type: 'web' } };

    if (this.options.failWith) {
      yield { type: 'error', messageId, error: this.options.failWith };
      return;
    }

    const answer = this.options.answer ?? DEMO_ANSWER;
    for (const char of answer) {
      if (request.signal?.aborted) return;
      yield { type: 'text:delta', messageId, delta: char };
    }

    yield {
      type: 'usage',
      messageId,
      usage: {
        inputTokens: 214,
        outputTokens: answer.length,
        totalTokens: 214 + answer.length,
        model: request.model,
      },
    };
    yield { type: 'message:complete', messageId };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}