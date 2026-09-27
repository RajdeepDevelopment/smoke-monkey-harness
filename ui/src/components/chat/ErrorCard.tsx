import { memo, useState } from 'react';
import {
  CircleAlert,
  CircleCheck,
  Info,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
  WifiOff,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import type { ChatErrorInfo, ChatErrorLayer, ChatErrorSeverity } from '../../types/stream';

/**
 * How an error is presented: one visual language per severity, so a provider
 * rate limit the run is retrying through does not look like a dead run.
 */
const SEVERITY_STYLE: Record<
  ChatErrorSeverity,
  { wrapper: string; icon: string; Icon: LucideIcon; label: string }
> = {
  info: {
    wrapper: 'border-info/25 bg-info/[0.07] text-ink-secondary',
    icon: 'text-info',
    Icon: Info,
    label: 'Notice',
  },
  warning: {
    wrapper: 'border-warning/30 bg-warning/[0.08] text-ink-secondary',
    icon: 'text-warning',
    Icon: TriangleAlert,
    label: 'Warning',
  },
  error: {
    wrapper: 'border-destructive/30 bg-destructive/[0.08] text-ink-secondary',
    icon: 'text-destructive',
    Icon: CircleAlert,
    label: 'Error',
  },
  fatal: {
    wrapper: 'border-destructive/45 bg-destructive/[0.12] text-ink-primary',
    icon: 'text-destructive',
    Icon: ShieldAlert,
    label: 'Failed',
  },
};

/** Which subsystem failed, shown as a small badge so the cause is unambiguous. */
const LAYER_META: Record<ChatErrorLayer, { label: string; Icon: LucideIcon }> = {
  provider: { label: 'Model', Icon: CircleAlert },
  tool: { label: 'Tool', Icon: Wrench },
  run: { label: 'Run', Icon: TriangleAlert },
  hook: { label: 'Hook', Icon: ShieldAlert },
  permission: { label: 'Permission', Icon: ShieldAlert },
  transport: { label: 'Connection', Icon: WifiOff },
};

export interface ErrorCardProps {
  error: ChatErrorInfo;
  /** Compact form used inline in the transcript. */
  dense?: boolean;
  /** Omitted when retrying would be pointless (fatal + not retryable). */
  onRetry?: () => void;
  /** Renders a dismiss control for non-terminal notices. */
  onDismiss?: () => void;
  className?: string;
}

/**
 * The single error surface for the whole UI.
 *
 * Everything that can go wrong — a provider rate limit, a denied permission, a
 * blocked tool, a dropped socket, a loop guard — arrives here as a
 * `ChatErrorInfo` and is rendered according to its `layer` and `severity`. The
 * retry affordance appears only when the error is actually retryable, so the UI
 * never offers an action that cannot work.
 */
export const ErrorCard = memo(function ErrorCard({
  error,
  dense = false,
  onRetry,
  onDismiss,
  className,
}: ErrorCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const severity = error.severity ?? 'error';
  const layer = error.layer ?? 'run';
  const style = SEVERITY_STYLE[severity];
  const { Icon } = style;
  const layerMeta = LAYER_META[layer];
  const LayerIcon = layerMeta.Icon;
  // A fatal error is a dead end; offering "Retry" there would be a lie.
  const showRetry = !!onRetry && error.retryable && severity !== 'fatal';
  const hasDetails = error.details !== undefined && error.details !== null;

  return (
    <div
      role="alert"
      aria-live={severity === 'fatal' ? 'assertive' : 'polite'}
      data-error-layer={layer}
      data-error-severity={severity}
      data-error-code={error.code}
      className={cn(
        'rounded-lg border',
        dense ? 'mt-1.5 px-2.5 py-1.5 text-[11px] leading-snug' : 'px-3 py-2.5 text-xs leading-relaxed',
        style.wrapper,
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn(dense ? 'mt-0.5 h-3 w-3 shrink-0' : 'mt-0.5 h-3.5 w-3.5 shrink-0', style.icon)} />
        <div className="min-w-0 flex-1">
          {/* Layer + severity badges: the "what happened" summary line. */}
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md border border-current/25 bg-background/50 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-ink-secondary',
              )}
            >
              <LayerIcon className="h-2.5 w-2.5" />
              {layerMeta.label}
            </span>
            {severity === 'fatal' && (
              <span className="rounded-md bg-destructive/15 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-destructive">
                {style.label}
              </span>
            )}
          </div>

          <p className={cn('min-w-0 break-words', dense ? 'text-[11px]' : 'text-xs')}>{error.message}</p>

          {/* Hierarchy comes from size, not from a dimmer colour: on the tinted
              card background `ink-muted` (and `opacity-80`) drops below 4.5:1 in
              9 of the 14 themes, while `ink-secondary` holds 5.47:1 or better. */}
          {error.hint && (
            <p className={cn('mt-1 text-ink-secondary', dense ? 'text-[10px]' : 'text-[11px]')}>{error.hint}</p>
          )}

          {(showRetry || onDismiss || hasDetails) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {showRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-ink-secondary transition-colors hover:bg-foreground/10"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              )}
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-ink-muted transition-colors hover:bg-foreground/10"
                >
                  <CircleCheck className="h-3 w-3" />
                  Dismiss
                </button>
              )}
              {hasDetails && (
                <button
                  type="button"
                  onClick={() => setDetailsOpen((v) => !v)}
                  aria-expanded={detailsOpen}
                  className="rounded-md px-1.5 py-0.5 font-medium text-ink-muted transition-colors hover:bg-foreground/10"
                >
                  {detailsOpen ? 'Hide details' : 'Details'}
                </button>
              )}
            </div>
          )}

          {detailsOpen && hasDetails && (
            <pre className="mt-1.5 max-h-40 overflow-auto rounded-md border border-current/15 bg-background/50 p-2 font-mono text-[10px] leading-relaxed">
              {typeof error.details === 'string'
                ? error.details
                : JSON.stringify(error.details, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
});
