import { useState } from 'react';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import type { ToolCall } from '../../types/tool';
import { cn } from '../../lib/cn';
import { formatCompact } from '../../lib/format';
import { ToolIcon, toolLabel } from './ToolIcon';
import { ErrorCard } from './ErrorCard';

export interface ToolCallCardProps {
  call: ToolCall;
  /** Trim long inputs/outputs in the collapsed row. */
  compact?: boolean;
  className?: string;
}

const STATUS_TEXT: Record<ToolCall['status'], string> = {
  pending: 'Queued',
  running: 'Running',
  success: 'Done',
  error: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_ICON = (status: ToolCall['status']) => {
  switch (status) {
    case 'running':
    case 'pending':
      return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />;
    case 'success':
      return <Check className="h-3 w-3 shrink-0 text-success/70" />;
    case 'error':
      return <X className="h-3 w-3 shrink-0 text-destructive/80" />;
    default:
      return null;
  }
};

/**
 * A single tool invocation: family icon, name, duration and a status mark.
 * Deliberately borderless — the run rail and the surrounding prose supply the
 * structure, so the row itself stays quiet. Input/output expand in place.
 */
export function ToolCallCard({ call, compact, className }: ToolCallCardProps) {
  // A failure opens by default — the reason is the whole point of the card.
  const [open, setOpen] = useState(call.status === 'running' || call.status === 'error');
  const hasDetails = call.input !== undefined || call.output !== undefined || !!call.error;
  const failed = call.status === 'error';

  return (
    <div className={cn('min-w-0', className)}>
      <button
        type="button"
        onClick={() => hasDetails && setOpen((v) => !v)}
        title={`${toolLabel(call.name, call.presentation)} — ${STATUS_TEXT[call.status]}`}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors',
          hasDetails ? 'cursor-pointer hover:bg-surface-800/50' : 'cursor-default'
        )}
      >
        <ToolIcon
          name={call.name}
          icon={call.presentation?.icon}
          family={call.presentation?.family}
          // A declared tone is identity; a status color is the thing you act
          // on. So status wins while the call is running or has failed, and the
          // tone only colors the settled case.
          tone={failed || call.status === 'running' ? undefined : call.presentation?.tone}
          className={failed ? (call.error?.severity === 'warning' ? 'text-warning' : 'text-destructive/80') : call.status === 'running' ? 'text-accent' : 'text-ink-muted'}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-primary">
          {toolLabel(call.name, call.presentation)}
        </span>
        {call.durationMs != null && call.status !== 'pending' && (
          <span className="shrink-0 text-[10px] tabular-nums text-ink-secondary">
            {formatCompact(call.durationMs)}ms
          </span>
        )}
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          {STATUS_ICON(call.status)}
        </span>
        {!compact && hasDetails && (
          <ChevronsUpDown
            className={cn('h-3 w-3 shrink-0 text-ink-muted transition-transform', open && 'rotate-180')}
          />
        )}
      </button>
      {open && hasDetails && (
        <div className="mt-1 grid gap-1.5 border-l border-surface-700 pl-3">
          {/* The structured error explains the failure in the product's own
              language (layer, severity, hint) instead of dumping raw output. */}
          {call.error ? (
            <ErrorCard error={call.error} dense />
          ) : (
            call.output !== undefined && <JsonBlock label={failed ? 'Error' : 'Output'} value={call.output} />
          )}
          {call.input !== undefined && <JsonBlock label="Input" value={call.input} />}
        </div>
      )}
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? String(value);
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-ink-secondary">
        {label}
      </span>
      <pre className="max-h-48 overflow-auto rounded-md bg-surface-950/70 p-2 text-[10.5px] leading-relaxed text-ink-secondary">
        <code className="font-mono">{text}</code>
      </pre>
    </div>
  );
}
