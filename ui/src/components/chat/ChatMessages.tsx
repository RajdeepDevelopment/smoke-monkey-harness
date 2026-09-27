import type { ComponentType, ReactNode } from 'react';
import { MessageBubble } from './MessageBubble';
import type { MessageBubbleFeatures, MessageBubbleProps, MessageBubbleSlots } from './MessageBubble';
import type { ChatMessage } from '../../types/message';
import type { ChatSource } from '../../types/source';
import type { FileEntry } from '../visuals/fileUtils';
import { cn } from '../../lib/cn';
import type { ChatPrompt } from '../../types/prompt';
import type { ToolPresentationMap } from '../../types/tools';

export interface ChatMessagesProps {
  messages: ChatMessage[];
  showTimestamps?: boolean;
  onSourceClick?: (source: ChatSource) => void;
  onFileClick?: (file: FileEntry) => void;
  onRetry?: (text: string) => void;
  /** Answers a run blocked on the user; see `ChatPrompt`. */
  onPromptRespond?: (prompt: ChatPrompt, answer: string) => void;
  /** Host-supplied tool presentation, keyed by tool name. */
  toolPresentations?: ToolPresentationMap;
  /** Rendered between consecutive messages (e.g. day separators). */
  between?: (message: ChatMessage, index: number) => ReactNode;
  /** Per-feature render toggles (SmokeMonkeyChat `features`). */
  features?: MessageBubbleFeatures;
  /** Per-part render replacements (SmokeMonkeyChat `slots`). */
  slots?: MessageBubbleSlots;
  /** Replaces <MessageBubble/> for every message (SmokeMonkeyChat `slots.message`). */
  Message?: ComponentType<MessageBubbleProps>;
  className?: string;
}

/** Pure scroll list of `MessageBubble`s. Pair with `useAutoScroll` for streaming. */
export function ChatMessages({
  messages,
  showTimestamps,
  onSourceClick,
  onFileClick,
  onRetry,
  onPromptRespond,
  toolPresentations,
  between,
  features,
  slots,
  Message = MessageBubble,
  className,
}: ChatMessagesProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {messages.map((message, index) => (
        <div key={message.id}>
          {between?.(message, index)}
          <Message
            message={message}
            showTimestamps={showTimestamps}
            onSourceClick={onSourceClick}
            onFileClick={onFileClick}
            onRetry={onRetry}
            onPromptRespond={onPromptRespond}
            toolPresentations={toolPresentations}
            features={features}
            slots={slots}
          />
        </div>
      ))}
    </div>
  );
}