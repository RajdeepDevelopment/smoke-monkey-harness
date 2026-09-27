import { useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Braces, Check, Copy, Download, FileText, Image as ImageIcon, Table2 } from 'lucide-react';
import type {
  ChatArtifact,
  ChartArtifact,
  FileArtifact,
  ImageArtifact,
  TableArtifact,
  TextArtifact,
} from '../../types/artifact';
import { chartColor } from '../../types/artifact';
import { cn } from '../../lib/cn';

export interface ArtifactRendererProps {
  artifact: ChatArtifact;
  /** Download handler for file artifacts — default triggers a blob download. */
  onDownload?: (file: FileArtifact) => void;
  /** Swap the default chart/table bodies (SmokeMonkeyChat slots). */
  slots?: {
    chart?: ComponentType<{ artifact: ChatArtifact; onDownload?: () => void }>;
    table?: ComponentType<{ artifact: ChatArtifact; onDownload?: () => void }>;
  };
  className?: string;
}

/**
 * Standalone renderer for `artifact` stream events: charts, tables, files,
 * images and text/code artifacts. Kept dependency-light (no charting library).
 */
export function ArtifactRenderer({ artifact, onDownload, slots, className }: ArtifactRendererProps) {
  const body = renderBody(artifact, onDownload, slots?.chart, slots?.table);
  const title = artifactTitle(artifact);
  return (
    <section
      className={cn(
        'my-3 overflow-hidden rounded-xl border border-surface-600 bg-surface-900 shadow-[0_14px_40px_-24px_rgba(0,0,0,0.85)]',
        className
      )}
    >
      {title && (
        <header className="flex items-center gap-2 sm-card-head px-3 py-1.5">
          <ArtifactIcon artifact={artifact} />
          <h4 className="truncate text-[12px] font-semibold text-ink-primary">{title}</h4>
        </header>
      )}
      {body}
    </section>
  );
}

type ArtifactSlot = ComponentType<{ artifact: ChatArtifact; onDownload?: () => void }>;

function renderBody(
  artifact: ChatArtifact,
  onDownload?: ArtifactRendererProps['onDownload'],
  chartSlot?: ArtifactSlot,
  tableSlot?: ArtifactSlot
): ReactNode {
  switch (artifact.type) {
    case 'chart': {
      if (chartSlot) {
        const Chart = chartSlot;
        return <Chart artifact={artifact} />;
      }
      return <ChartArtifactView artifact={artifact} />;
    }
    case 'table': {
      if (tableSlot) {
        const Table = tableSlot;
        return <Table artifact={artifact} />;
      }
      return <TableArtifactView artifact={artifact} />;
    }
    case 'file':
      return <FileArtifactView artifact={artifact} onDownload={onDownload} />;
    case 'image':
      return <ImageArtifactView artifact={artifact} />;
    case 'text':
      return <TextArtifactView artifact={artifact} />;
    default:
      return null;
  }
}

function artifactTitle(artifact: ChatArtifact): string | undefined {
  switch (artifact.type) {
    case 'chart':
    case 'table':
    case 'text':
      return artifact.title;
    case 'file':
      return artifact.name;
    case 'image':
      return artifact.alt;
  }
}

function ArtifactIcon({ artifact }: { artifact: ChatArtifact }) {
  const props = { className: 'h-3.5 w-3.5 shrink-0' };
  switch (artifact.type) {
    case 'chart':
      return <BarGlyph {...props} className="h-3.5 w-3.5 shrink-0 text-primary" />;
    case 'table':
      return <Table2 {...props} className="h-3.5 w-3.5 shrink-0 text-primary" />;
    case 'file':
      return <FileText {...props} className="h-3.5 w-3.5 shrink-0 text-success" />;
    case 'image':
      return <ImageIcon {...props} className="h-3.5 w-3.5 shrink-0 text-accent" />;
    case 'text':
      return <Braces {...props} className="h-3.5 w-3.5 shrink-0 text-warning" />;
  }
}

/* --- SVG chart (no external charting lib) -------------------------------- */

function BarGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function ChartArtifactView({ artifact }: { artifact: ChartArtifact }) {
  const rows = useMemo(() => {
    const xKey = artifact.config?.xKey ?? 'name';
    const yKey = artifact.config?.yKeys?.[0] ?? 'value';
    return artifact.data
      .map((row) => {
        if (typeof row !== 'object' || row === null) return null;
        const r = row as Record<string, unknown>;
        return { label: String(r[xKey] ?? ''), value: Number(r[yKey] ?? 0) };
      })
      .filter((r): r is { label: string; value: number } => !!r && r.label !== '');
  }, [artifact]);

  if (!rows.length) {
    return <div className="p-4 text-[12px] text-ink-muted">No data.</div>;
  }

  const kind = artifact.chartType;
  if (kind === 'pie' || kind === 'donut') return <PieView rows={rows} />;
  if (kind === 'scatter') return <ScatterView rows={rows} />;
  if (kind === 'line' || kind === 'area') return <LineView rows={rows} kind={kind} />;
  return <BarView rows={rows} />;
}

function BarView({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="p-3">
      <div className="flex h-40 items-end gap-2 px-1">
        {rows.map((row, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[9px] tabular-nums text-ink-muted">{row.value}</span>
            <div
              className="w-full rounded-t-md"
              style={{
                height: `${Math.max(4, (row.value / max) * 100)}%`,
                background: chartColor(i),
                opacity: 0.9,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 px-1">
        {rows.map((row, i) => (
          <span key={i} className="flex-1 truncate text-center text-[9px] text-ink-muted">
            {row.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LineView({ rows, kind }: { rows: { label: string; value: number }[]; kind: 'line' | 'area' }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const w = 320;
  const h = 120;
  const points = rows
    .map((r, i) => {
      const x = rows.length === 1 ? w / 2 : (i / (rows.length - 1)) * w;
      const y = h - (r.value / max) * (h - 12) - 6;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <div className="p-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full">
        {kind === 'area' && points.split(' ').length > 1 ? (
          <polygon
            points={`0,${h} ${points} ${w},${h}`}
            style={{ fill: chartColor(0) }}
            opacity={0.08}
          />
        ) : null}
        <polyline
          fill="none"
          style={{ stroke: chartColor(0) }}
          strokeWidth="2"
          points={points}
        />
        {rows.map((_, i) => {
          const [x, y] = points.split(' ')[i]!.split(',');
          return <circle key={i} cx={x} cy={y} r="2.5" style={{ fill: chartColor(0) }} />;
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[9px] text-ink-muted">
        {rows.map((r, i) => (
          <span key={i}>{r.label}</span>
        ))}
      </div>
    </div>
  );
}

function PieView({ rows }: { rows: { label: string; value: number }[] }) {
  const total = rows.reduce((acc, r) => acc + r.value, 0);
  let acc = 0;
  const arcs = rows.map((r, i) => {
    const frac = r.value / total;
    const start = acc * 360;
    acc += frac;
    const end = acc * 360;
    return { ...r, color: chartColor(i), start, end };
  });
  const R = 40;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex gap-4 p-3">
      <svg viewBox="0 0 100 100" className="h-36 w-36 shrink-0">
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          strokeWidth="18"
          strokeDasharray={`${C} ${C}`}
          transform="rotate(-90 50 50)"
        />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="18"
            style={{ stroke: arc.color }}
            strokeDasharray={`${(arc.end - arc.start) * (C / 360)} ${C}`}
            strokeDashoffset={-(arc.start * (C / 360)) + C / 4}
            transform="rotate(-90 50 50)"
          />
        ))}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 py-2">
        {arcs.map((arc, i) => (
          <li key={i} className="flex items-center gap-2 text-[11px] text-ink-secondary">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: arc.color }} />
            <span className="min-w-0 truncate">{arc.label}</span>
            <span className="ml-auto shrink-0 tabular-nums text-ink-muted">
              {Math.round((arc.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScatterView({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="p-3">
      <div className="relative h-32 w-full overflow-hidden rounded-lg bg-surface-950/60">
        {rows.map((r, i) => (
          <span
            key={i}
            className="absolute h-2 w-2 rounded-full"
            style={{
              left: `${(i / Math.max(rows.length - 1, 1)) * 92 + 4}%`,
              bottom: `${Math.min(90, Math.max(4, (r.value / max) * 90))}%`,
              background: chartColor(0),
            }}
            title={r.label}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-ink-muted">
        <span>{rows[0]?.label}</span>
        <span>{rows[rows.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/* --- Table ----------------------------------------------------------------- */

function TableArtifactView({ artifact }: { artifact: TableArtifact }) {
  const [copied, setCopied] = useState(false);
  const csv = useMemo(() => {
    const headers = artifact.columns.map((c) => c.key);
    const lines = [
      headers.map(escapeCsv).join(','),
      ...artifact.rows.map((row) => headers.map((h) => escapeCsv(String(row[h] ?? ''))).join(',')),
    ];
    return lines.join('\n');
  }, [artifact]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between sm-card-head px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-muted">
          <Table2 className="h-3 w-3" />
          {artifact.columns.length} × {artifact.rows.length}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-ink-secondary transition-colors hover:bg-surface-800 hover:text-ink-primary"
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy CSV'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="m-0 w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {artifact.columns.map((c) => (
                <th
                  key={c.key}
                  className="border border-surface-600/70 px-2.5 py-1.5 text-left font-semibold text-ink-primary"
                >
                  {c.label ?? c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {artifact.rows.map((row, i) => (
              <tr key={i} className={i % 2 === 1 ? 'bg-[hsl(var(--ink-primary)/0.02)]' : ''}>
                {artifact.columns.map((c) => (
                  <td key={c.key} className="border border-surface-600/70 px-2.5 py-1.5 text-ink-secondary">
                    {String(row[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --- File ------------------------------------------------------------------ */

function FileArtifactView({
  artifact,
  onDownload,
}: {
  artifact: FileArtifact;
  onDownload?: ArtifactRendererProps['onDownload'];
}) {
  const download = async () => {
    if (onDownload) {
      onDownload(artifact);
      return;
    }
    if (!artifact.downloadUrl && !artifact.url) return;
    const href = artifact.downloadUrl ?? artifact.url!;
    const a = document.createElement('a');
    a.href = href;
    a.download = artifact.name;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="flex items-center gap-3 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-800 text-success">
        <FileText className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink-primary">{artifact.name}</p>
        <p className="text-[11px] text-ink-muted">
          {artifact.mimeType}
          {artifact.size ? ` · ${formatBytes(artifact.size)}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={download}
        disabled={!artifact.downloadUrl && !artifact.url}
        className="inline-flex items-center gap-1.5 rounded-md border border-surface-600 px-2 py-1 text-[10px] font-medium text-ink-secondary transition-colors hover:border-accent hover:text-ink-primary disabled:opacity-40"
      >
        <Download className="h-3 w-3" />
        Download
      </button>
    </div>
  );
}

/* --- Image ----------------------------------------------------------------- */

function ImageArtifactView({ artifact }: { artifact: ImageArtifact }) {
  const src = artifact.url ?? artifact.dataUri;
  if (!src) {
    return <div className="p-4 text-[12px] text-ink-muted">Image unavailable.</div>;
  }
  return (
    <div className="p-3">
      <img
        src={src}
        alt={artifact.alt ?? ''}
        className="max-h-80 w-full rounded-lg object-contain"
        style={{ width: artifact.width, height: artifact.height }}
      />
    </div>
  );
}

/* --- Text / code ------------------------------------------------------------ */

function TextArtifactView({ artifact }: { artifact: TextArtifact }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };
  return (
    <div>
      <div className="flex items-center justify-end sm-card-head px-3 py-1">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary transition-colors hover:bg-surface-800 hover:text-ink-primary"
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="m-0 max-h-80 overflow-auto bg-surface-950 p-3 text-[12px] leading-relaxed text-ink-primary">
        <code className="font-mono">{artifact.content}</code>
      </pre>
    </div>
  );
}

function escapeCsv(cell: string): string {
  return `"${cell.replace(/"/g, '""')}"`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}