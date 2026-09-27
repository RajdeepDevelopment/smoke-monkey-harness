import { memo, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  Brain,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { ChatArtifact, FileArtifact } from '../../types/artifact';
import type { ChatMessage, MessagePart } from '../../types/message';
import type { ChatSource } from '../../types/source';
import type { ToolCall } from '../../types/tool';
import { cn } from '../../lib/cn';
import { formatBytes, formatCompact } from '../../lib/format';
import { buildToolRun, toolFamily } from '../../lib/toolRuns';
import { getFileLanguage, type FileEntry } from '../visuals/fileUtils';
import { Markdown } from '../markdown/Markdown';
import { ArtifactRenderer } from './ArtifactRenderer';
import { Sources } from './Sources';
import { ToolCallCard } from './ToolCallCard';
import { ToolRunGroup } from './ToolRun';
import { ErrorCard } from './ErrorCard';
import { ChatPromptCard } from './ChatPromptCard';
import type { ChatPrompt } from '../../types/prompt';
import type { ToolPresentationMap } from '../../types/tools';
import { withPresentation } from '../../lib/toolRuns';

export interface MessageBubbleFeatures {
  markdown?: boolean;
  codeBlocks?: boolean;
  tools?: boolean;
  artifacts?: boolean;
  charts?: boolean;
  tables?: boolean;
  citations?: boolean;
  tokenUsage?: boolean;
  /** User message shape. Default 'bubble'. */
  userStyle?: 'bubble' | 'plain';
  /** Show the agent avatar gutter. Default false. */
  agentAvatar?: boolean;
  /** Show the model chip under the response. Default false. */
  showModel?: boolean;
  /** Class name for the assistant prose container. */
  bubbleClassName?: string;
  /** Class name for the user message container. */
  userBubbleClassName?: string;
  /**
   * Chain 2+ consecutive tool calls of the same family into one rail run with
   * a phase header and call count. Default true. A `toolCall` slot still
   * renders the card — it is only wrapped in the rail.
   */
  toolChains?: boolean;
}

type ArtifactSlot = ComponentType<{ artifact: ChatArtifact; onDownload?: () => void }>;

export interface MessageBubbleSlots {
  toolCall?: ComponentType<{ call: ToolCall; compact?: boolean }>;
  sources?: ComponentType<{
    sources: ChatSource[];
    onSourceClick?: (source: ChatSource) => void;
  }>;
  codeBlock?: ComponentType<{ language: string; children: string }>;
  chart?: ArtifactSlot;
  table?: ArtifactSlot;
  /** Replace the inline ask_user / permission card. */
  prompt?: ComponentType<{ prompt: ChatPrompt; onRespond?: (answer: string) => void }>;
}

export interface MessageBubbleProps {
  message: ChatMessage;
  /** Right-aligned filled bubble for user messages (default true). */
  userStyle?: 'bubble' | 'plain';
  showModel?: boolean;
  showCopy?: boolean;
  showTimestamps?: boolean;
  onSourceClick?: (source: ChatSource) => void;
  onFileClick?: (file: FileEntry) => void;
  onRetry?: (text: string) => void;
  /**
   * Answer a prompt the run is blocked on. Omit when the transport cannot
   * write back, and the prompt renders read-only.
   */
  onPromptRespond?: (prompt: ChatPrompt, answer: string) => void;
  /**
   * Presentation for tools whose own event did not carry one — a history
   * replayed from storage, or a tool list fetched on connect. Keyed by tool
   * name; anything the event states wins.
   */
  toolPresentations?: ToolPresentationMap;
  /** Per-feature render toggles (SmokeMonkeyChat `features`). */
  features?: MessageBubbleFeatures;
  /** Per-part render replacements (SmokeMonkeyChat `slots`). */
  slots?: MessageBubbleSlots;
  className?: string;
}

// Assistant prose sits directly on the page background — no bubble, no border —
// so the response blends into the UI and starts flush with the chat column.
const BUBBLE_CLASS =
  'relative min-w-0 break-words overflow-wrap-anywhere text-sm leading-relaxed text-ink-primary';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function textFromParts(parts: MessagePart[]): string {
  return parts
    .filter(
      (part): part is Extract<MessagePart, { content: string }> =>
        part.type === 'markdown' || part.type === 'text' || part.type === 'thinking'
    )
    .map((part) => part.content)
    .join('\n\n');
}

function toFileEntry(file: FileArtifact): FileEntry {
  return {
    filename: file.name,
    content: file.path ?? file.url ?? '',
    language: getFileLanguage(file.name),
  };
}

function ThinkingBlock({ content, streaming }: { content: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-surface-700 bg-surface-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-surface-850/60"
        aria-expanded={open}
        title="Show the model's reasoning"
      >
        <Brain className="h-3 w-3 shrink-0 text-ink-muted" />
        <span className="flex-1 text-[11px] font-medium text-ink-secondary">Reasoning</span>
        {streaming && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />}
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 text-ink-muted transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && (
        <div className="max-h-72 overflow-y-auto border-t border-surface-800 px-2.5 py-2 text-[11.5px] leading-relaxed whitespace-pre-wrap break-words text-ink-muted scrollbar-thin">
          {content}
        </div>
      )}
    </div>
  );
}

function CopyButton({ content, label }: { content: string; label: string }) {
  const [copied, setCopied] = useState(false);
  if (!content) return null;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
        if (!clipboard) return;
        void clipboard
          .writeText(content)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          })
          .catch(() => setCopied(false));
      }}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-surface-700 bg-surface-900/60 text-ink-muted opacity-0 transition-all hover:border-primary/40 hover:text-ink-primary focus-visible:opacity-100 group-hover:opacity-100"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function StreamingSkeleton() {
  return (
    <div className="my-1.5 flex flex-col gap-1.5" aria-label="Assistant is thinking">
      <span className="h-2.5 w-2/5 animate-pulse rounded-full bg-surface-800" />
      <span className="h-2.5 w-4/5 animate-pulse rounded-full bg-surface-800" />
      <span className="h-2.5 w-3/5 animate-pulse rounded-full bg-surface-800" />
    </div>
  );
}

function ImagePartView({ url, alt }: { url: string; alt?: string }) {
  return (
    <figure className="my-2 inline-block max-w-full overflow-hidden rounded-xl border border-surface-700 bg-surface-900">
      <img src={url} alt={alt ?? ''} className="block max-h-96 w-auto max-w-full object-contain" />
    </figure>
  );
}

function FilePartView({
  file,
  onFileClick,
}: {
  file: FileArtifact;
  onFileClick?: (file: FileEntry) => void;
}) {
  const entry = toFileEntry(file);
  return (
    <button
      type="button"
      onClick={() => onFileClick?.(entry)}
      className="my-2 flex w-full max-w-full items-center gap-2.5 rounded-xl border border-surface-700 bg-surface-900/60 px-3 py-2 text-left transition-colors hover:border-primary/40"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-ink-primary">{file.name}</span>
        <span className="block truncate text-[10px] text-ink-muted">
          {file.mimeType}
          {file.size ? ` · ${formatBytes(file.size)}` : ''}
        </span>
      </span>
    </button>
  );
}

function PlainProse({ content, streaming, className }: { content: string; streaming: boolean; className?: string }) {
  return (
    <div className={cn(BUBBLE_CLASS, className)}>
      <div className="whitespace-pre-wrap break-words overflow-wrap-anywhere">{content}</div>
      {streaming && <span className="ml-0.5 animate-pulse text-ink-muted">▍</span>}
    </div>
  );
}

function renderPart(
  part: MessagePart,
  key: string,
  streaming: boolean,
  onFileClick: ((file: FileEntry) => void) | undefined,
  features: MessageBubbleFeatures,
  slots: MessageBubbleSlots,
  onRetry: ((content: string) => void) | undefined,
  onPromptRespond?: (prompt: ChatPrompt, answer: string) => void,
  toolPresentations?: ToolPresentationMap
): ReactNode {
  switch (part.type) {
    case 'thinking':
      return <ThinkingBlock key={key} content={part.content} streaming={streaming} />;
    case 'tool': {
      if (features.tools === false) return null;
      const call = withPresentation(part.toolCall, toolPresentations);
      if (slots.toolCall) {
        const Tool = slots.toolCall;
        return <Tool key={key} call={call} />;
      }
      return <ToolCallCard key={key} call={call} />;
    }
    case 'artifact':
      return <ArtifactRenderer key={key} artifact={part.artifact} slots={{ chart: slots.chart, table: slots.table }} />;
    case 'code': {
      if (features.codeBlocks === false) {
        return (
          <pre key={key} className="my-2 overflow-x-auto rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-[12px] leading-relaxed text-ink-primary">
            <code>{part.code}</code>
          </pre>
        );
      }
      return (
        <Markdown
          key={key}
          content={'```' + (part.language || '') + '\n' + part.code + '\n```'}
          codeBlock={slots.codeBlock}
        />
      );
    }
    case 'image': {
      const url = part.url ?? part.dataUri;
      return url ? <ImagePartView key={key} url={url} alt={part.alt} /> : null;
    }
    case 'file':
      return <FilePartView key={key} file={part.file} onFileClick={onFileClick} />;
    case 'prompt': {
      // The run is blocked on this answer. Rendering it inline — rather than
      // as a banner or a modal — keeps each question next to the message that
      // asked it, which matters once the agent chains several.
      const onRespond = onPromptRespond
        ? (answer: string) => onPromptRespond(part.prompt, answer)
        : undefined;
      const Prompt = slots.prompt ?? ChatPromptCard;
      return <Prompt key={key} prompt={part.prompt} {...(onRespond ? { onRespond } : {})} />;
    }
    case 'notice':
      // A recovered/non-terminal failure. It renders inline with its own
      // severity instead of flipping the whole message to `error`.
      return (
        <ErrorCard
          key={key}
          error={part.error}
          dense
          {...(onRetry ? { onRetry: () => onRetry('') } : {})}
        />
      );
    default:
      return null;
  }
}

function filterArtifacts(
  artifacts: ChatMessage['artifacts'],
  features: MessageBubbleFeatures
): NonNullable<ChatMessage['artifacts']> {
  if (features.artifacts === false) return [];
  return (artifacts ?? []).filter((a) => {
    if (a.type === 'chart' && features.charts === false) return false;
    if (a.type === 'table' && features.tables === false) return false;
    return true;
  });
}

function MessageBubbleView({
  message,
  userStyle,
  showModel,
  showCopy = true,
  showTimestamps,
  onSourceClick,
  onFileClick,
  onRetry,
  onPromptRespond,
  toolPresentations,
  features = {},
  slots = {},
  className,
}: MessageBubbleProps) {
  const streaming = message.status === 'streaming';
  const copyText = message.content || textFromParts(message.parts);
  const time = showTimestamps ? formatTime(message.createdAt) : '';
  const userBubble = userStyle ?? features.userStyle ?? 'bubble';
  const showUsage = (showModel ?? features.showModel) && features.tokenUsage !== false && !!(message.model || message.usage);

  const sources = useMemo(() => {
    const list: ChatSource[] = message.sources ? [...message.sources] : [];
    for (const part of message.parts) {
      if (part.type === 'citation' && !list.some((s) => s.id === part.source.id)) {
        list.push(part.source);
      }
    }
    return list;
  }, [message.sources, message.parts]);

  if (message.role === 'user') {
    return (
      <div className={cn('group flex w-full justify-end animate-mobile-bubble', className)}>
        <div className="flex max-w-[88%] flex-col items-end gap-1 sm:max-w-[75%]">
          {userBubble === 'bubble' ? (
            <div
              className={cn(
                'rounded-2xl rounded-tr-md border border-primary/25 bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-lg shadow-primary/10 sm:px-4 sm:py-3',
                features.userBubbleClassName
              )}
            >
              <div className="whitespace-pre-wrap break-words overflow-wrap-anywhere">
                {message.content}
              </div>
            </div>
          ) : (
            <div className={cn('min-w-0 text-sm leading-relaxed text-ink-primary', features.userBubbleClassName)}>
              <Markdown content={message.content} codeBlock={slots.codeBlock} />
            </div>
          )}
          <div className="flex items-center gap-1.5 pr-1">
            {time && <span className="text-[10px] text-ink-muted">{time}</span>}
            <span className="text-[10px] text-ink-muted">You</span>
            {showCopy && <CopyButton content={copyText} label="Copy message" />}
          </div>
        </div>
      </div>
    );
  }

  const showSkeleton = streaming && !message.parts.length && !message.content;

  const nodes: ReactNode[] = [];
  let prose: string[] = [];
  let proseKey = 0;

  const flushProse = () => {
    if (!prose.length) return;
    const markdown = prose.join('\n\n');
    prose = [];
    if (features.markdown === false) {
      nodes.push(<PlainProse key={`prose-${proseKey++}`} content={markdown} streaming={streaming} className={features.bubbleClassName} />);
      return;
    }
    nodes.push(
      <div key={`prose-${proseKey++}`} className={cn(BUBBLE_CLASS, features.bubbleClassName)}>
        <Markdown content={markdown} codeBlock={slots.codeBlock} />
        {streaming && <span className="ml-0.5 animate-pulse text-ink-muted">▍</span>}
      </div>
    );
  };

  // Walk the parts once, folding consecutive same-family tool calls into a
  // single rail run. Prose, code, artifacts and citations all break a run.
  for (let i = 0; i < message.parts.length; ) {
    const part = message.parts[i];
    if (part.type === 'markdown' || part.type === 'text') {
      prose.push(part.content);
      i += 1;
      continue;
    }
    if (part.type === 'tool' && features.toolChains !== false) {
      const family = toolFamily(part.toolCall.name);
      let end = i;
      while (end + 1 < message.parts.length) {
        const next = message.parts[end + 1];
        if (next.type !== 'tool' || toolFamily(next.toolCall.name) !== family) break;
        end += 1;
      }
      if (end > i) {
        const calls = message.parts
          .slice(i, end + 1)
          .map((p) => (p.type === 'tool' ? p.toolCall : null))
          .filter((c): c is ToolCall => c !== null);
        flushProse();
        nodes.push(
          <ToolRunGroup
            key={`run-${calls[0].id}`}
            run={buildToolRun(calls, family)}
            calls={calls}
            Card={slots.toolCall}
            className="my-1"
          />
        );
        i = end + 1;
        continue;
      }
    }
    flushProse();
    nodes.push(
      renderPart(
        part,
        `part-${i}`,
        streaming,
        onFileClick,
        features,
        slots,
        onRetry,
        onPromptRespond,
        toolPresentations,
      ),
    );
    i += 1;
  }
  if (!message.parts.length && message.content) prose.push(message.content);
  flushProse();

  const safeSlots = { chart: slots.chart, table: slots.table };
  filterArtifacts(message.artifacts, features).forEach((artifact, i) => {
    nodes.push(
      <ArtifactRenderer
        key={`artifact-${i}`}
        artifact={artifact}
        slots={safeSlots}
      />
    );
  });

  const usage = message.usage;

  return (
    <div className={cn('group flex w-full justify-start animate-mobile-bubble', className)}>
      <div className={cn('flex w-full min-w-0 items-start', features.agentAvatar && 'gap-2.5 sm:gap-3')}>
        {features.agentAvatar && (
          <div className="relative mt-0.5 shrink-0">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-xl bg-primary/15 ring-1 ring-inset ring-primary/25">
              <Sparkles className="h-4 w-4 text-primary" />
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-accent" />
          </div>
        )}
        <div className="min-w-0 max-w-full flex-1 overflow-hidden">
          <div className="mb-1 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 shrink-0 text-primary" />
            <span className="text-xs font-semibold text-ink-primary">Smoke Monkey</span>
            {streaming && (
              <span className="inline-flex items-center gap-1 text-[10px] text-ink-muted">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                streaming…
              </span>
            )}
            {message.status === 'cancelled' && (
              <span className="text-[10px] text-ink-muted">cancelled</span>
            )}
            {time && <span className="text-[10px] text-ink-muted">{time}</span>}
          </div>

          {showSkeleton && <StreamingSkeleton />}

          <div className={cn(nodes.length > 1 && 'space-y-1.5')}>{nodes}</div>

          {features.citations !== false && sources.length > 0 &&
            (slots.sources ? (
              (() => {
                const Sources = slots.sources!;
                return <Sources sources={sources} onSourceClick={onSourceClick} />;
              })()
            ) : (
              <Sources sources={sources} onSourceClick={onSourceClick} />
            ))}

          {/* Terminal failure. Severity/layer come from the structured error,
              so a bad API key reads differently from a dropped connection. */}
          {message.status === 'error' && message.error && (
            <ErrorCard
              error={message.error}
              dense
              {...(onRetry && message.content ? { onRetry: () => onRetry(message.content) } : {})}
            />
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {showCopy && <CopyButton content={copyText} label="Copy response" />}
            {streaming && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-700 bg-surface-900/60 px-2.5 py-1 text-[11px] font-medium text-ink-secondary">
                <Loader2 className="h-3 w-3 animate-spin text-accent" />
                Streaming
              </span>
            )}
            {showUsage && (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-surface-700 bg-surface-900/60 px-2.5 py-1 text-[11px] font-medium text-ink-secondary">
                <Sparkles className="h-3 w-3 shrink-0 text-primary" />
                <span className="min-w-0 truncate">{message.model ?? 'model'}</span>
                {usage && (
                  <span className="shrink-0 tabular-nums text-ink-muted">
                    ↑{formatCompact(usage.inputTokens)} ↓{formatCompact(usage.outputTokens)}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleView) as (
  props: MessageBubbleProps
) => JSX.Element;