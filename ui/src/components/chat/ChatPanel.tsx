import type { ComponentType, ReactNode } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import { ChatComposer } from './ChatComposer';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessages } from './ChatMessages';
import type { MessageBubbleFeatures, MessageBubbleProps, MessageBubbleSlots } from './MessageBubble';
import type { ChatPrompt } from '../../types/prompt';
import type { ToolPresentationMap } from '../../types/tools';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import type { ChatMessage } from '../../types/message';
import type { ChatSource } from '../../types/source';
import type { ChatErrorInfo } from '../../types/stream';
import type { FileEntry } from '../visuals/fileUtils';
import { cn } from '../../lib/cn';

export interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
  onSend?: (text: string) => void;
  onStop?: () => void;
  onClear?: () => void;
  error?: ChatErrorInfo | null;
  placeholder?: string;
  empty?: ReactNode;
  header?: ReactNode;
  /** Composer slot — defaults to <ChatComposer/> wired to onSend/onStop. */
  composer?: ReactNode;
  /** Rendered above the messages list (status rail, suggested prompts…). */
  beforeList?: ReactNode;
  /** Rendered below the messages list. */
  afterList?: ReactNode;
  showTimestamps?: boolean;
  showSources?: boolean;
  autoScroll?: boolean;
  /** Where to dock the default composer: above or below the messages. */
  composerPosition?: 'bottom' | 'top';
  /** Suppress the composer saddle entirely (parent renders its own — e.g. a
   *  floating overlay). */
  hideComposer?: boolean;
  composerClassName?: string;
  /** Max width of the shared chat column (messages + composer). Optional —
   *  defaults to Tailwind's `max-w-3xl`. Kept in sync so the input box always
   *  lines up with the message list. */
  columnMaxWidth?: string;
  /** Passed through to every <MessageBubble/> (SmokeMonkeyChat `features`). */
  messageFeatures?: MessageBubbleFeatures;
  /** Passed through to every <MessageBubble/> (SmokeMonkeyChat `slots`). */
  messageSlots?: MessageBubbleSlots;
  /** Replaces <MessageBubble/> for every message (SmokeMonkeyChat `slots.message`). */
  Message?: ComponentType<MessageBubbleProps>;
  onSourceClick?: (source: ChatSource) => void;
  onFileClick?: (file: FileEntry) => void;
  onRetry?: (text: string) => void;
  /** Answers a run that is blocked on the user. See `ChatPrompt`. */
  onPromptRespond?: (prompt: ChatPrompt, answer: string) => void;
  /** Passed through to every <MessageBubble/>; keyed by tool name. */
  toolPresentations?: ToolPresentationMap;
  className?: string;
  innerClassName?: string;
}

/**
 * Full chat wrapper: header slot, scrollable message list with auto-scroll,
 * empty state, error banner and composer footer. Everything is optional —
 * pass your own slots to compose a bespoke shell.
 */
export function ChatPanel({
  messages,
  isStreaming,
  onSend,
  onStop,
  onClear,
  error,
  placeholder,
  empty,
  header,
  composer,
  beforeList,
  afterList,
  showTimestamps,
  showSources: _showSources,
  autoScroll = true,
  composerPosition = 'bottom',
  hideComposer = false,
  composerClassName,
  columnMaxWidth,
  messageFeatures,
  messageSlots,
  Message,
  onSourceClick,
  onFileClick,
  onRetry,
  onPromptRespond,
  toolPresentations,
  className,
  innerClassName,
}: ChatPanelProps) {
  const { ref: scrollRef, atBottom, follow, scrollToBottom } = useAutoScroll<HTMLDivElement>({
    streaming: autoScroll ? isStreaming : false,
    threshold: 120,
  });

  const hasMessages = messages.length > 0;

  const composerNode = composer ?? (
    <ChatComposer
      onSubmit={onSend}
      onStop={onStop}
      isStreaming={!!isStreaming}
      disabled={!onSend}
      placeholder={placeholder}
    />
  );

  const messagesColumn = (
    <div
      ref={scrollRef}
      className={cn(
        'min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-thin sm:px-6',
        innerClassName
      )}
    >
      <div
        className="mx-auto flex min-h-full max-w-3xl flex-col gap-4"
        style={columnMaxWidth ? { maxWidth: columnMaxWidth } : undefined}
      >
        {beforeList}
        {!hasMessages ? (
          <div className="flex flex-1 items-center justify-center py-10">
            {empty ?? <ChatEmptyState />}
          </div>
        ) : (
          <ChatMessages
            messages={messages}
            showTimestamps={showTimestamps}
            onSourceClick={onSourceClick}
            onFileClick={onFileClick}
            onRetry={onRetry}
            onPromptRespond={onPromptRespond}
            toolPresentations={toolPresentations}
            features={messageFeatures}
            slots={messageSlots}
            Message={Message}
          />
        )}
        {isStreaming && !follow && atBottom === false && (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            className="sticky bottom-2 z-10 mx-auto rounded-full border border-surface-600 bg-surface-800 px-3 py-1 text-[11px] font-medium text-ink-secondary shadow-lg transition hover:border-accent hover:text-ink-primary"
          >
            ↓ New activity
          </button>
        )}
        {afterList}
      </div>
    </div>
  );

  const errorBanner = error ? (
    <div className="mx-auto mb-2 flex w-full max-w-3xl items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{error.message}</span>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded p-0.5 text-destructive/70 transition hover:bg-destructive/20 hover:text-destructive"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  ) : null;

  // The saddle mirrors the messages container's horizontal padding so the input
  // box edges line up exactly with the chat column at every breakpoint.
  const columnStyle = columnMaxWidth ? { maxWidth: columnMaxWidth } : undefined;

  const composerSaddle = (
    <div className={cn('px-4 pb-4 sm:px-6', composerClassName)}>
      <div className="mx-auto w-full max-w-3xl" style={columnStyle}>
        {composerNode}
      </div>
    </div>
  );

  return (
    <section className={cn('flex h-full min-h-0 flex-col overflow-hidden', className)}>
      {header}

      {composerPosition === 'top' && !hideComposer && composer && (
        <div className="px-4 pt-4 sm:px-6">
          <div className="mx-auto w-full max-w-3xl" style={columnStyle}>
            {composerNode}
          </div>
        </div>
      )}

      {messagesColumn}

      {errorBanner}

      {composerPosition !== 'top' && !hideComposer && composerSaddle}
    </section>
  );
}