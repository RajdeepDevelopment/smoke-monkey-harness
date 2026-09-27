import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode, Ref } from 'react';
import { ArrowUp, Paperclip, Square, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useIsomorphicLayoutEffect } from '../../lib/useIsomorphicLayoutEffect';
import { PILL_ICON_ONLY_WIDTH, PillRow, usePillNarrowContext } from './pill-collapse';

export interface ChatComposerProps {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (text: string) => void;
  onStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
  isStreaming?: boolean;
  autoFocus?: boolean;
  maxRows?: number;
  /** Expose the textarea so the parent can focus it (e.g. Meta+K). */
  inputRef?: Ref<HTMLTextAreaElement>;
  /** Show a paperclip + attached-file chips. Callback receives the raw files. */
  attachments?: boolean;
  onAttach?: (files: File[]) => void;
  /** Extra left-side toolbar controls rendered after the attach chip
   *  (e.g. model / API-key / MCP dropdown chips from SmokeMonkeyChat). */
  toolbar?: ReactNode;
  /** Token meter: 🧠 used / limit with a tiny progress bar. */
  tokenUsage?: { used: number; limit: number };
  className?: string;
}

/**
 * The chat composer: bounded auto-growing textarea plus send/stop. Controlled
 * when `value` is provided (the owner clears the field on submit); uncontrolled
 * otherwise, in which case the composer clears itself after a submit.
 *
 * Enter sends, Shift+Enter is a newline, and attached file names are prepended
 * to the submitted text as `📎 name` chips so the parent always receives a
 * plain string. Pass `inputRef` to focus it from the outside (Meta+K).
 */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  placeholder,
  disabled,
  isStreaming,
  autoFocus,
  maxRows = 8,
  inputRef,
  attachments,
  onAttach,
  toolbar,
  tokenUsage,
  className,
}: ChatComposerProps) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const [internal, setInternal] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isControlled = value !== undefined;
  const text = isControlled ? value : internal;

  const setText = (next: string) => {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };

  useIsomorphicLayoutEffect(() => {
    const el = internalRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const styles = getComputedStyle(el);
    const lineHeight = parseFloat(styles.lineHeight) || 20;
    const padding =
      (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
    const max = Math.max(lineHeight * maxRows + padding, 44);
    el.style.maxHeight = `${max}px`;
    const next = Math.min(el.scrollHeight, max);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > next ? 'auto' : 'hidden';
  }, [text, maxRows]);

  useEffect(() => {
    const el = internalRef.current;
    if (autoFocus && el) el.focus();
  }, [autoFocus]);

  const attach = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!picked.length) return;
    setFiles((prev) => [...prev, ...picked.map((f) => f.name)]);
    onAttach?.(picked);
  };

  const attachPrefix = files.length
    ? files.map((name) => `📎 ${name}`).join(' ') + '\n\n'
    : '';

  const canSend = !disabled && !isStreaming && text.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    onSubmit?.(attachPrefix + text);
    if (!isControlled) setInternal('');
    setFiles([]);
  };

  return (
    <div
      className={cn(
        'w-full rounded-2xl border border-surface-700 bg-surface-900/80 shadow-lg shadow-black/20 backdrop-blur transition-all focus-within:border-primary/50',
        className
      )}
    >
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2 pt-2">
          {files.map((name) => (
            <span
              key={name}
              className="inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-full border border-surface-600/70 bg-surface-800/60 px-2 py-0.5 text-[10.5px] text-ink-secondary"
            >
              <Paperclip className="h-2.5 w-2.5 shrink-0 text-primary/70" />
              <span className="truncate">{name}</span>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => setFiles((prev) => prev.filter((f) => f !== name))}
                className="shrink-0 rounded p-0.5 text-ink-muted transition-colors hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea
        ref={(el) => {
          internalRef.current = el;
          if (typeof inputRef === 'function') inputRef(el);
          else if (inputRef) (inputRef as { current: HTMLTextAreaElement | null }).current = el;
        }}
        rows={1}
        value={text}
        placeholder={placeholder ?? 'Ask anything…'}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        className="box-border min-h-[44px] w-full max-h-[35vh] resize-none bg-transparent px-3.5 pb-1 pt-3 text-base leading-relaxed text-ink-primary placeholder:text-ink-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:max-h-[220px] sm:px-4 sm:pt-3.5 sm:text-sm"
      />
      {/* Always one line: everything here collapses to icons when the strip is
          narrow, so stacking only ever cost vertical space and split the
          controls across two rows. */}
      <PillRow
        className="flex min-w-0 items-center gap-1.5 px-2.5 pt-1 pb-2.5"
        threshold={PILL_ICON_ONLY_WIDTH}
      >
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1">
          {attachments && (
            <button
              type="button"
              aria-label="Attach files"
              title="Attach files"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-7 w-7 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-surface-700 bg-surface-800/50 text-[11.5px] font-medium text-ink-secondary transition-colors hover:border-primary/40 hover:text-ink-primary sm:w-auto sm:justify-start sm:px-2.5"
            >
              <span aria-hidden>📎</span>
              <span className="hidden sm:inline">Attach</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={attach}
            className="hidden"
            style={{ display: 'none' }}
          />
          {toolbar}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {tokenUsage && <TokenMeter used={tokenUsage.used} limit={tokenUsage.limit} />}
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              title="Stop generating"
              aria-label="Stop generating"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-destructive transition-colors hover:bg-surface-800 hover:text-destructive sm:w-auto sm:px-2.5"
            >
              <Square className="h-3 w-3 shrink-0" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              aria-label="Send"
              title="Send"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </PillRow>
    </div>
  );
}

const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(n));

function TokenMeter({ used, limit }: { used: number; limit: number }) {
  const pct = Math.max(0, Math.min(100, (used / limit) * 100));
  // Same collapse rule as the pills: the numbers are in the tooltip either way.
  const iconOnly = usePillNarrowContext();
  const label = `${used.toLocaleString()} of ${limit.toLocaleString()} tokens`;
  return (
    <span
      title={label}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-surface-700/70 bg-surface-800/30 text-[10.5px] tabular-nums text-ink-muted',
        iconOnly ? 'w-7 justify-center' : 'px-2'
      )}
    >
      <span aria-hidden>🧠</span>
      {iconOnly ? (
        <span className="sr-only">{label}</span>
      ) : (
        <>
          <span className="whitespace-nowrap">
            {fmtTokens(used)} <span className="opacity-70">/</span> {fmtTokens(limit)}
          </span>
          <span className="hidden h-1 w-10 overflow-hidden rounded-full bg-surface-700 sm:block">
            <span className="block h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
          </span>
        </>
      )}
    </span>
  );
}