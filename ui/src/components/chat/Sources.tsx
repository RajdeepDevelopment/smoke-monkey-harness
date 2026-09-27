import { ExternalLink, FileText, Globe, Search } from 'lucide-react';
import type { ChatSource } from '../../types/source';
import { sourceDomain } from '../../types/source';
import { cn } from '../../lib/cn';

export interface SourcesProps {
  sources: ChatSource[];
  onSourceClick?: (source: ChatSource) => void;
  className?: string;
}

const TYPE_ICON: Record<ChatSource['type'], typeof Globe> = {
  web: Globe,
  document: FileText,
  knowledge: Search,
  file: FileText,
  database: Search,
};

/** Numbered citation chips, rendered below an assistant message. */
export function Sources({ sources, onSourceClick, className }: SourcesProps) {
  if (!sources.length) return null;
  return (
    <div className={cn('my-2 flex flex-wrap gap-1.5', className)}>
      {sources.map((source, i) => {
        const Icon = TYPE_ICON[source.type] ?? Globe;
        return (
          <span
            key={source.id}
            title={source.title}
            onClick={() => onSourceClick?.(source)}
            className={cn(
              'inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] leading-snug text-ink-secondary',
              onSourceClick && 'cursor-pointer transition-colors hover:border-primary/40 hover:text-ink-primary'
            )}
          >
            <span className="font-semibold tabular-nums text-primary/80">{i + 1}</span>
            <Icon className="h-3 w-3 shrink-0 text-primary/60" />
            <span className="min-w-0 truncate">{source.title}</span>
            <span className="shrink-0 text-ink-muted">{sourceDomain(source)}</span>
            <span className="sr-only">{source.url}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Link chip used by citation markdown — same look, opens the URL. */
export function SourceLink({ source }: { source: ChatSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] leading-snug text-ink-secondary transition-colors hover:border-primary/40 hover:text-ink-primary"
    >
      <span className="font-semibold tabular-nums text-primary/80">↗</span>
      <span className="min-w-0 truncate">{source.title}</span>
      <ExternalLink className="h-3 w-3 shrink-0 text-primary/60" />
    </a>
  );
}