import { useState } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { ChatRevertResult } from '../../types/transport';

export interface RevertControl {
  /** Shows what would change; modifies nothing. */
  preview: () => Promise<ChatRevertResult>;
  /** Performs the revert. */
  confirm: () => Promise<ChatRevertResult>;
}

const MAX_LISTED = 8;

/**
 * "Revert to before this message". One click opens an inline confirm that lists
 * the files the agent touched since (from a dry run), so the user sees what
 * will be undone before it is. Nothing changes until they confirm.
 */
export function RevertButton({ control }: { control: RevertControl }) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'confirm' | 'working'>('idle');
  const [result, setResult] = useState<ChatRevertResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setPhase('loading');
    setError(null);
    const preview = await control.preview();
    if (!preview.ok) {
      setError(preview.error ?? 'Could not prepare the revert.');
      setPhase('idle');
      return;
    }
    setResult(preview);
    setPhase('confirm');
  };

  const run = async () => {
    setPhase('working');
    const done = await control.confirm();
    if (!done.ok) {
      setError(done.error ?? 'Revert failed.');
      setPhase('confirm');
    }
    // On success the message is removed from the transcript, which unmounts this.
  };

  const files = result
    ? [
        ...result.changes.modified.map((f) => ({ f, tag: 'edited' })),
        ...result.changes.added.map((f) => ({ f, tag: 'created' })),
        ...result.changes.deleted.map((f) => ({ f, tag: 'deleted' })),
      ]
    : [];

  if (phase === 'idle' || phase === 'loading') {
    return (
      <>
        <button
          type="button"
          onClick={() => void open()}
          disabled={phase === 'loading'}
          aria-label="Revert to before this message"
          title="Revert to before this message"
          className="rounded p-0.5 text-ink-muted opacity-0 transition-opacity hover:text-ink-primary focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-100"
        >
          {phase === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
        </button>
        {error && <span className="text-[10px] text-destructive">{error}</span>}
      </>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-label="Confirm revert"
      className="mt-1 w-full max-w-sm rounded-xl border border-surface-700 bg-surface-900 p-3 text-left text-xs shadow-lg"
    >
      <div className="font-medium text-ink-primary">Revert to before this message?</div>
      <div className="mt-1 text-ink-muted">
        This message and everything after it are removed
        {files.length ? `, and ${files.length} file${files.length === 1 ? '' : 's'} are restored:` : '. No files changed.'}
      </div>
      {files.length > 0 && (
        <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto font-mono text-[11px] text-ink-secondary">
          {files.slice(0, MAX_LISTED).map(({ f, tag }) => (
            <li key={`${tag}:${f}`} className="flex gap-2">
              <span className="w-12 shrink-0 text-ink-muted">{tag}</span>
              <span className="truncate">{f}</span>
            </li>
          ))}
          {files.length > MAX_LISTED && <li className="text-ink-muted">…and {files.length - MAX_LISTED} more</li>}
        </ul>
      )}
      <div className="mt-1.5 text-ink-muted">Hand edits made since then are overwritten too.</div>
      {error && <div className="mt-1.5 text-destructive">{error}</div>}
      <div className="mt-2.5 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setPhase('idle')}
          disabled={phase === 'working'}
          className="rounded-lg px-2.5 py-1 text-ink-secondary hover:text-ink-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void run()}
          disabled={phase === 'working'}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg bg-destructive px-2.5 py-1 font-medium text-white',
            phase === 'working' && 'opacity-70',
          )}
        >
          {phase === 'working' && <Loader2 className="h-3 w-3 animate-spin" />}
          Revert
        </button>
      </div>
    </div>
  );
}
