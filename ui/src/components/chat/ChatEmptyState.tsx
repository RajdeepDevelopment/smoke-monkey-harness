import type { ReactNode } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface ChatEmptyStateProps {
  /** Brand mark shown above the title (falls back to a flame glyph). */
  icon?: ReactNode;
  title?: string;
  subtitle?: string;
  suggestions?: string[];
  onSuggestionClick?: (text: string) => void;
  className?: string;
  /** Extra class per suggestion button. */
  suggestionClassName?: string;
}

const DEFAULT_SUGGESTIONS = [
  'Fix the failing tests',
  'Explain this code',
  'Add a feature',
  'Find a bug',
];

/**
 * The zero-state: brand mark, one-line pitch and clickable prompt starters.
 * Everything sits on the page background (no panel) so it reads as part of the
 * app rather than a modal, and the starters stay usable from 320px up.
 */
export function ChatEmptyState({
  icon,
  title = 'Smoke Monkey',
  subtitle = 'Build, debug, and modify your codebase.',
  suggestions = DEFAULT_SUGGESTIONS,
  onSuggestionClick,
  className,
  suggestionClassName,
}: ChatEmptyStateProps) {
  return (
    <div
      className={cn(
        'relative flex w-full flex-1 flex-col items-center justify-center gap-7 overflow-y-auto px-4 pb-10 pt-8 sm:px-6',
        className
      )}
    >
      <span className="pointer-events-none absolute inset-0 bg-app-aurora" aria-hidden />

      <div className="relative flex flex-col items-center text-center">
        <div className="relative mb-5">
          <span
            className="pointer-events-none absolute inset-1 rounded-[20px] bg-primary/25 blur-lg"
            aria-hidden
          />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-[20px] border border-primary/25 bg-gradient-to-b from-surface-800 to-surface-900 shadow-lg shadow-primary/10">
            {icon ?? (
              <span className="flex h-full w-full items-center justify-center text-2xl leading-none">
                🔥
              </span>
            )}
          </div>
        </div>

        <h2 className="text-gradient text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        <p className="mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-ink-muted sm:max-w-sm sm:text-sm">
          {subtitle}
        </p>
      </div>

      {suggestions.length > 0 && (
        <div className="relative w-full max-w-xl">
          <p className="mb-2.5 text-center text-[10px] font-medium uppercase tracking-[0.16em] text-ink-muted/70">
            Try asking
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {suggestions.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onSuggestionClick?.(prompt)}
                className={cn('group flex items-center gap-2.5 rounded-xl border border-surface-700/70 bg-surface-800/40 px-3.5 py-3 text-left text-[12.5px] font-medium text-ink-secondary shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface-800/80 hover:text-ink-primary hover:shadow-card-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60', suggestionClassName)}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary/60 transition-colors group-hover:text-primary" />
                <span className="min-w-0 flex-1 truncate">{prompt}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ink-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
