import { useState } from 'react';
import { CircleHelp, ShieldQuestion } from 'lucide-react';
import type { ChatPrompt } from '../../types/prompt';
import { cn } from '../../lib/cn';

export interface ChatPromptCardProps {
  prompt: ChatPrompt;
  /**
   * Send the answer. Omitted when the transport cannot write back, in which
   * case the card renders read-only — showing controls that go nowhere is
   * worse than showing none.
   */
  onRespond?: (answer: string) => void;
  className?: string;
}

/**
 * The inline surface for a run that is blocked on the user.
 *
 * `ask_user` and `permission.required` both *pause* the run, so this card is
 * the only thing standing between a paused run and a deadlocked one. It sits
 * in the transcript next to the message that raised it because the agent can
 * chain several questions, and each one belongs where it was asked.
 *
 * Answered prompts collapse to what was chosen: the transcript should read as a
 * conversation, not as a pile of dismissed forms.
 */
export function ChatPromptCard({ prompt, onRespond, className }: ChatPromptCardProps) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const answered = prompt.status !== 'pending';
  const isPermission = prompt.kind === 'permission';
  const Icon = isPermission ? ShieldQuestion : CircleHelp;
  const readOnly = answered || !onRespond;

  const toggle = (value: string): void => {
    setPicked((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const submitText = (): void => {
    const value = text.trim();
    if (!value) return;
    onRespond?.(value);
    setText('');
  };

  const submitPicked = (): void => {
    if (!picked.length) return;
    onRespond?.(picked.join(', '));
    setPicked([]);
  };

  // A permission answer is a decision, not free text. `decision` is the
  // authoritative field when the server set it, but an answer recorded locally
  // on click carries only the wire value — and showing that raw ("deny") in the
  // transcript reads like a leak rather than an answer.
  const denied = prompt.decision === 'deny' || prompt.answer === 'deny' || prompt.answer === 'denied';
  const allowed = prompt.decision === 'allow' || prompt.answer === 'allow' || prompt.answer === 'allow_once';
  const settledAnswer =
    prompt.status === 'cancelled'
      ? 'Cancelled'
      : denied
        ? 'Denied'
        : allowed
          ? 'Allowed'
          : (prompt.answer ?? 'Answered');

  if (answered) {
    return (
      <div
        data-prompt-status={prompt.status}
        className={cn(
          'flex min-w-0 items-center gap-2 rounded-xl border border-surface-700/60 bg-surface-900/50 px-3 py-2 text-[11.5px]',
          className,
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-ink-secondary">
          {prompt.question}
        </span>
        <span className="max-w-[50%] shrink-0 truncate font-medium text-ink-primary">
          {settledAnswer}
        </span>
      </div>
    );
  }

  return (
    <div
      data-prompt-status="pending"
      data-prompt-kind={prompt.kind}
      className={cn(
        'min-w-0 rounded-xl border bg-surface-900/70 p-3',
        isPermission ? 'border-warning/40' : 'border-primary/40',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Icon
          className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', isPermission ? 'text-warning' : 'text-primary')}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium leading-snug text-ink-primary">
            {prompt.question}
          </p>
          {prompt.toolName && (
            <p className="mt-0.5 truncate font-mono text-[10.5px] text-ink-muted">
              {prompt.toolName}
            </p>
          )}
        </div>
      </div>

      {readOnly ? (
        <p className="mt-2 text-[11px] text-ink-muted">
          This run is waiting for an answer. The connected transport cannot send
          one, so it has to be answered from the host that started the run.
        </p>
      ) : isPermission ? (
        <div className="mt-2.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onRespond?.('allow')}
            className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Allow once
          </button>
          <button
            type="button"
            onClick={() => onRespond?.('deny')}
            className="rounded-lg border border-surface-700/70 bg-surface-800/50 px-2.5 py-1 text-[11px] font-medium text-ink-secondary transition-colors hover:border-destructive/50 hover:text-destructive"
          >
            Deny
          </button>
        </div>
      ) : (
        <>
          {prompt.options && prompt.options.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {prompt.options.map((opt) => {
                const active = picked.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    title={opt.description ?? opt.label ?? opt.value}
                    aria-pressed={active}
                    onClick={() => (prompt.multiple ? toggle(opt.value) : onRespond?.(opt.value))}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
                      active
                        ? 'border-primary/60 bg-primary/15 text-primary'
                        : 'border-surface-700/70 bg-surface-800/50 text-ink-secondary hover:border-primary/40 hover:text-ink-primary',
                    )}
                  >
                    {opt.label ?? opt.value}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-2.5 flex items-center gap-1.5">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitText();
                }
              }}
              placeholder="Type an answer…"
              aria-label={prompt.question}
              className="min-w-0 flex-1 rounded-lg border border-surface-700/70 bg-surface-800/50 px-2.5 py-1 text-[11.5px] text-ink-primary placeholder:text-ink-muted focus:border-primary/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={submitText}
              disabled={!text.trim()}
              className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              Send
            </button>
            {prompt.multiple && picked.length > 0 && (
              <button
                type="button"
                onClick={submitPicked}
                className="shrink-0 rounded-lg border border-surface-700/70 bg-surface-800/50 px-2.5 py-1 text-[11px] font-medium text-ink-secondary transition-colors hover:border-primary/40 hover:text-ink-primary"
              >
                Confirm {picked.length}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
