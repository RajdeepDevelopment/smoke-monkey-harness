import type { ChatMessage, MessagePart } from '../types/message';
import type { ChatStreamEvent } from '../types/stream';
import { toChatError } from '../types/stream';
import type { ToolCall } from '../types/tool';
import type { ChatArtifact } from '../types/artifact';
import type { ChatPrompt } from '../types/prompt';

/**
 * Pure reducer: folds a normalized `ChatStreamEvent` into a `ChatMessage[]`.
 * Kept side-effect free so it is testable outside React and transport-agnostic.
 *
 * Events without an explicit `messageId` target the stream owner (fallback).
 */
export function applyChatEvent(
  messages: ChatMessage[],
  event: ChatStreamEvent,
  fallbackId: string
): ChatMessage[] {
  switch (event.type) {
    case 'connection:status':
      return messages;

    case 'message:start': {
      const target = findOrCreate(messages, event.messageId, fallbackId);

      // The placeholder for this turn may already exist; adopt metadata.
      if (target.id === event.messageId) {
        const next = { ...target, status: 'streaming' as const };
        if (event.conversationId) next.conversationId = event.conversationId;
        if (event.model) next.model = event.model;
        return replace(messages, next);
      }
      const created = {
        ...emptyAssistant(event.messageId, target.conversationId),
        model: event.model,
        conversationId: event.conversationId,
      };
      return [...messages, created];
    }

    case 'text:delta': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target || target.role !== 'assistant') return messages;
      const parts = appendOrMerge(
        target.parts,
        { type: 'markdown' as const, content: event.delta },
        (p) => p.type === 'markdown'
      );
      return replace(messages, withParts(target, parts));
    }

    case 'reasoning:start': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target || target.role !== 'assistant') return messages;
      if (target.parts.some((p) => p.type === 'thinking')) return messages;
      return replace(messages, withParts(target, [...target.parts, { type: 'thinking', content: '' }]));
    }

    case 'reasoning:delta': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target || target.role !== 'assistant') return messages;
      const idx = target.parts.findLastIndex((p) => p.type === 'thinking');
      const parts: MessagePart[] =
        idx === -1
          ? [...target.parts, { type: 'thinking', content: event.delta }]
          : target.parts.map((p, i): MessagePart =>
              i === idx && p.type === 'thinking'
                ? { ...p, content: p.content + event.delta }
                : p
            );
      return replace(messages, withParts(target, parts));
    }

    case 'tool:start': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target) return messages;
      const { toolCallId, toolName, input, presentation } = event;
      const existing = target.toolCalls?.find((t) => t.id === toolCallId);
      const call: ToolCall =
        existing ?? {
          id: toolCallId,
          name: toolName,
          status: 'pending',
          startedAt: new Date().toISOString(),
        };
      const updated: ToolCall = {
        ...call,
        status: 'running',
        input: input ?? call.input,
        // A live call's declared icon wins over anything already on the call.
        ...(presentation ? { presentation } : {}),
      };
      return withTool(messages, target, updated, toolName);
    }

    case 'tool:delta': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target) return messages;
      const updated = deriveTool(target, event.toolCallId, (t) => {
        const next = { ...t };
        if (typeof event.delta === 'string') {
          next.output =
            typeof next.output === 'string' ? next.output + event.delta : event.delta;
        } else {
          next.output = event.delta;
        }
        return next;
      });
      return updated ? withTool(messages, target, updated) : messages;
    }

    // A tool-scoped failure: mark the call and attach the structured error so
    // the tool card can render it. The run itself keeps going.
    case 'tool:error': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target) return messages;
      const error = toChatError(event.error, { layer: 'tool', severity: 'error', retryable: true });
      const updated = deriveTool(target, event.toolCallId, (t) => {
        const completedAt = new Date().toISOString();
        const started = t.startedAt ? new Date(t.startedAt).getTime() : null;
        return {
          ...t,
          status: error.severity === 'info' ? ('cancelled' as const) : ('error' as const),
          error,
          completedAt,
          durationMs: started ? Math.max(1, Date.now() - started) : t.durationMs,
        };
      });
      return updated ? withTool(messages, target, updated) : messages;
    }

    case 'tool:result': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target) return messages;
      const updated = deriveTool(target, event.toolCallId, (t) => {
        const completedAt = new Date().toISOString();
        const started = t.startedAt ? new Date(t.startedAt).getTime() : null;
        return {
          ...t,
          status: 'success' as const,
          output: event.result ?? t.output,
          completedAt,
          durationMs: started ? Math.max(1, Date.now() - started) : t.durationMs,
        };
      });
      return updated ? withTool(messages, target, updated) : messages;
    }

    case 'artifact': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target) return messages;
      const artifacts = target.artifacts ?? [];
      const exists = artifacts.some((a) => duplicateKey(a) === duplicateKey(event.artifact));
      if (exists) return messages;
      return replace(
        messages,
        withParts(target, [...target.parts, { type: 'artifact', artifact: event.artifact }])
      );
    }

    case 'source': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target) return messages;
      const sources = target.sources ?? [];
      if (sources.some((s) => s.id === event.source.id)) return messages;
      const nextSources = [...sources, event.source];
      if (target.sources) {
        return replace(messages, { ...target, sources: nextSources });
      }
      return replace(messages, { ...target, sources: nextSources });
    }

    case 'usage': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target) return messages;
      return replace(messages, { ...target, usage: event.usage });
    }

    case 'agent:start': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target) return messages;
      return replace(messages, { ...target, agentSteps: [] });
    }

    case 'agent:step': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target) return messages;
      const steps = [...(target.agentSteps ?? [])];
      const idx = steps.findIndex((s) => s.stepId === event.stepId);
      if (idx === -1) {
        steps.push({
          stepId: event.stepId ?? `step-${steps.length + 1}`,
          title: event.title,
          status: event.status,
          startedAt: new Date().toISOString(),
        });
      } else {
        steps[idx] = { ...steps[idx]!, title: event.title, status: event.status };
        if (event.status === 'complete' || event.status === 'error') {
          steps[idx] = { ...steps[idx]!, completedAt: new Date().toISOString() };
        }
      }
      return replace(messages, { ...target, agentSteps: steps });
    }

    case 'agent:complete': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target || !target.agentSteps?.length) return messages;
      return replace(messages, {
        ...target,
        agentSteps: target.agentSteps.map((s) =>
          s.status === 'running' ? { ...s, status: 'complete' as const } : s
        ),
      });
    }

    case 'message:complete': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target) return messages;
      return replace(messages, { ...target, status: 'complete' });
    }

    // A non-terminal failure. The message keeps streaming and the error is
    // appended as a `notice` part, so several can accumulate on one message
    // and the transcript still reads as a normal reply.
    case 'notice': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target) return messages;
      const error = toChatError(event.error, { code: 'stream_notice' });
      // Collapse a repeat of the same code — a retry loop re-emitting one
      // rate limit every 2s should not stack 30 identical banners.
      const prior = target.parts.findIndex(
        (p) => p.type === 'notice' && p.error.code === error.code,
      );
      if (prior !== -1) {
        const parts = [...target.parts];
        parts[prior] = { type: 'notice', error };
        return replace(messages, { ...target, parts });
      }
      return replace(messages, { ...target, parts: [...target.parts, { type: 'notice', error }] });
    }

    case 'prompt:ask':
    case 'prompt:permission':
    case 'prompt:mcp_approval': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target) return messages;
      const p = event.prompt;
      // The run is paused on this. Re-emitting the same prompt (a reconnect
      // replay, or a host that re-sends on retry) updates the existing card
      // instead of stacking duplicates.
      const prompt: ChatPrompt = { ...p, status: 'pending' };
      const prior = target.parts.findIndex(
        (part) => part.type === 'prompt' && part.prompt.toolCallId === p.toolCallId,
      );
      const parts = [...target.parts];
      if (prior !== -1) parts[prior] = { type: 'prompt', prompt };
      else parts.push({ type: 'prompt', prompt });
      const prompts = [
        ...(target.prompts ?? []).filter((x) => x.toolCallId !== p.toolCallId),
        prompt,
      ];
      return replace(messages, { ...target, parts, prompts });
    }

    case 'prompt:resolved': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target) return messages;
      const { toolCallId, ...rest } = event.prompt;
      // Answering never ends the stream: the run resumes right after, and may
      // raise the next question in the same message.
      const parts = target.parts.map((part) =>
        part.type === 'prompt' && part.prompt.toolCallId === toolCallId
          ? {
              type: 'prompt' as const,
              prompt: {
                ...part.prompt,
                ...rest,
                toolCallId,
                status: rest.status ?? ('decision' in rest ? 'answered' : 'answered'),
              },
            }
          : part,
      );
      const prompts = (target.prompts ?? []).map((x) =>
        x.toolCallId === toolCallId ? { ...x, ...rest, toolCallId } : x,
      );
      return replace(messages, { ...target, parts, prompts });
    }

    case 'error': {
      const target = resolve(messages, event.messageId, fallbackId);
      if (!target) return messages;
      const error = toChatError(event.error, { code: 'stream_error' });
      // A fatal error is the last thing on the message: drop any trailing
      // empty text part so the banner is not separated by a blank line.
      return replace(messages, { ...target, status: 'error', error });
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function emptyAssistant(id: string, conversationId?: string): ChatMessage {
  return {
    id,
    conversationId,
    role: 'assistant',
    status: 'streaming',
    content: '',
    parts: [],
    createdAt: new Date().toISOString(),
  };
}

function resolve(
  messages: ChatMessage[],
  messageId: string | undefined,
  fallbackId: string
): ChatMessage | null {
  const id = messageId ?? fallbackId;
  return messages.find((m) => m.id === id) ?? null;
}

function findOrCreate(
  messages: ChatMessage[],
  messageId: string,
  fallbackId: string
): ChatMessage {
  const found = resolve(messages, messageId, fallbackId);
  if (found) return found;
  return emptyAssistant(messageId);
}

function replace(messages: ChatMessage[], next: ChatMessage): ChatMessage[] {
  const idx = messages.findIndex((m) => m.id === next.id);
  if (idx === -1) return [...messages, next];
  if (messages[idx] === next) return messages;
  const copy = messages.slice();
  copy[idx] = next;
  return copy;
}

function withParts(target: ChatMessage, parts: MessagePart[]): ChatMessage {
  return { ...target, parts, content: messageContentFromParts(parts) };
}

function appendOrMerge(
  parts: MessagePart[],
  next: MessagePart,
  isAppendable: (p: MessagePart) => boolean
): MessagePart[] {
  const last = parts[parts.length - 1];
  if (last && isAppendable(last)) {
    const merged: MessagePart[] = parts.slice(0, -1);
    const append =
      next.type === 'markdown' && last.type === 'markdown'
        ? { ...last, content: last.content + next.content }
        : { ...next };
    return [...merged, append];
  }
  return [...parts, next];
}

export function extractFinishText(call: ToolCall): string {
  let text = '';
  if (call.output !== undefined && call.output !== null) {
    if (typeof call.output === 'string') {
      text = call.output;
    } else if (typeof call.output === 'object') {
      const o = call.output as Record<string, unknown>;
      if (typeof o.output === 'string') text = o.output;
      else if (typeof o.summary === 'string') text = o.summary;
      else if (typeof o.text === 'string') text = o.text;
      else if (typeof o.result === 'string') text = o.result;
    }
  }
  if (!text && call.input !== undefined && call.input !== null) {
    if (typeof call.input === 'string') {
      text = call.input;
    } else if (typeof call.input === 'object') {
      const inp = call.input as Record<string, unknown>;
      if (typeof inp.summary === 'string') text = inp.summary;
      else if (typeof inp.output === 'string') text = inp.output;
      else if (typeof inp.text === 'string') text = inp.text;
    }
  }
  if (text) {
    const summaryPrefixMatch = text.match(/\[TASK COMPLETE\][^\n]*\n(?:Summary:\s*)?([\s\S]*)/i);
    if (summaryPrefixMatch && summaryPrefixMatch[1]) {
      text = summaryPrefixMatch[1].trim();
    }
  }
  return text.trim();
}

export function isFinishTool(call: ToolCall | string): boolean {
  const name = (typeof call === 'string' ? call : call.name).toLowerCase();
  return name === 'finish_task' || name === 'finish_run' || name === 'task_complete' || name === 'complete_task';
}

function withTool(
  messages: ChatMessage[],
  target: ChatMessage,
  updated: ToolCall,
  toolName?: string
): ChatMessage[] {
  // Keep the tool-call list ordered to match the parts list.
  const existingIdx = (target.toolCalls ?? []).findIndex((t) => t.id === updated.id);
  const toolCalls =
    existingIdx === -1
      ? [...(target.toolCalls ?? []), updated]
      : (target.toolCalls ?? []).map((t, i) => (i === existingIdx ? updated : t));

  const resolvedName = toolName ?? updated.name;
  if (isFinishTool(resolvedName)) {
    const text = extractFinishText(updated);
    let parts = [...target.parts];
    if (text) {
      const finishKey = `finish-${updated.id}`;
      const partIdx = parts.findIndex(
        (p) => (p as { _toolCallId?: string })._toolCallId === finishKey
      );
      if (partIdx === -1) {
        const newPart: MessagePart & { _toolCallId?: string } = {
          type: 'markdown',
          content: text,
          _toolCallId: finishKey,
        };
        parts.push(newPart);
      } else {
        const existing = parts[partIdx];
        if (existing.type === 'markdown') {
          parts[partIdx] = { ...existing, content: text };
        }
      }
    }
    return replace(messages, {
      ...target,
      toolCalls,
      parts,
      content: messageContentFromParts(parts),
    });
  }

  const parts = [...target.parts];
  const partIdx = parts.findIndex(
    (p) => p.type === 'tool' && p.toolCall.id === updated.id
  );
  if (partIdx === -1) {
    parts.push({
      type: 'tool',
      toolCall: { ...updated, name: toolName ?? updated.name },
    });
  } else {
    const existing = parts[partIdx]!;
    parts[partIdx] =
      existing.type === 'tool'
        ? { ...existing, toolCall: { ...existing.toolCall, ...updated } }
        : existing;
  }
  return replace(messages, { ...target, toolCalls, parts });
}

function deriveTool(
  target: ChatMessage,
  toolCallId: string,
  fn: (t: ToolCall) => ToolCall
): ToolCall | null {
  const current = target.toolCalls?.find((t) => t.id === toolCallId);
  if (!current) {
    const part = target.parts.find((p) => p.type === 'tool' && p.toolCall.id === toolCallId);
    if (!part || part.type !== 'tool') return null;
    return fn(part.toolCall);
  }
  return fn(current);
}

function duplicateKey(artifact: ChatArtifact): string {
  const a = artifact as { type: string; title?: string; name?: string };
  return `${a.type}:${a.title ?? a.name ?? ''}`;
}

/** Reconstruct plain text from parts (copy / export / request serialization). */
export function messageContentFromParts(parts: MessagePart[]): string {
  const chunks: string[] = [];
  for (const part of parts) {
    switch (part.type) {
      case 'markdown':
      case 'text':
        chunks.push(part.content);
        break;
      case 'thinking':
        chunks.push(part.content ? `> (thinking)\n${part.content}` : '');
        break;
      case 'code':
        chunks.push(`\`\`\`${part.language}\n${part.code}\n\`\`\``);
        break;
      case 'tool': {
        const call = part.toolCall;
        if (isFinishTool(call)) {
          const finishText = extractFinishText(call);
          if (finishText) chunks.push(finishText);
          break;
        }
        const result =
          call.output === undefined
            ? ''
            : typeof call.output === 'string'
              ? call.output
              : JSON.stringify(call.output);
        const input = typeof call.input === 'string' ? call.input : JSON.stringify(call.input ?? '');
        chunks.push(`> 🔧 ${call.name}(${input}) ${result ? `\n${result}` : ''}`);
        break;
      }
      case 'artifact':
        chunks.push(`\n[artifact: ${part.artifact.type}]`);
        break;
      case 'citation':
        break;
      case 'image':
      case 'file':
        chunks.push(`\n[${part.type}]`);
        break;
    }
  }
  return chunks.filter(Boolean).join('\n').trim();
}