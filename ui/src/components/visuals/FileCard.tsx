import { memo, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  File, FileText, Presentation, Sheet, Image as ImageIcon, Code2, FolderOpen, ExternalLink, Loader2, Check, AlertTriangle, Download, Video, Music,
} from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * The backend instructs the agent to wrap every generated file path in this
 * marker so the frontend can render it as a clickable card:
 *
 *   <file-SM-st>/abs/path/report.pdf<file-sm-ed>
 *
 * Both prefixes (`file`/`pdf`) and both close-tag spellings (with/without `/`)
 * are accepted, case-insensitively — the agent may emit any variant.
 */
export const FILE_MARKER_RE =
  /<(?:pdf|file)-sm-st\s*>([\s\S]*?)[\t ]*<(?:\/)?(?:pdf|file)-sm-ed\s*>/gi;

interface FileMarker {
  path: string;
  /** Full matched marker text (replaced by the rendered card). */
  raw: string;
}

/** Extract every complete <file-SM-st>…<file-sm-ed> wrapper from a message. */
export function extractFileMarkers(text: string): FileMarker[] {
  const markers: FileMarker[] = [];
  FILE_MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FILE_MARKER_RE.exec(text)) !== null) {
    const path = m[1].trim();
    if (path) markers.push({ path, raw: m[0] });
  }
  FILE_MARKER_RE.lastIndex = 0;
  return markers;
}

/** Remove complete markers plus any still-streaming (unclosed) open tags. */
export function stripFileMarkers(text: string): string {
  const cleaned = text.replace(FILE_MARKER_RE, '');
  return cleaned.replace(/<(?:pdf|file)-sm-st\s*>\s*[^<\n]*$/gi, '').replace(/^[ \t]*<(?:pdf|file)-sm-ed\s*>?[ \t]*$/gim, '');
}

export type FileSegment =
  | { kind: 'text'; content: string }
  | { kind: 'file'; path: string }
  | { kind: 'streaming-file' };

/**
 * Splits a message into text and FileCard segments. Complete wrappers become
 * file cards; an unclosed (still-streaming) open tag becomes a placeholder.
 */
export function splitFileSegments(text: string): FileSegment[] {
  const markers = extractFileMarkers(text);
  if (markers.length === 0) {
    if (/<(?:pdf|file)-sm-st\s*>[\s\S]*$/i.test(text)) {
      const before = stripFileMarkers(text);
      const out: FileSegment[] = [];
      if (before.trim()) out.push({ kind: 'text', content: before });
      out.push({ kind: 'streaming-file' });
      return out;
    }
    return [{ kind: 'text', content: text }];
  }

  const segments: FileSegment[] = [];
  let last = 0;
  for (const marker of markers) {
    const idx = text.indexOf(marker.raw, last);
    const start = idx === -1 ? last : idx;
    if (start > last) {
      const before = text.slice(last, start);
      if (before.trim()) segments.push({ kind: 'text', content: before });
    }
    segments.push({ kind: 'file', path: marker.path });
    last = start + marker.raw.length;
  }
  const tail = text.slice(last);
  if (tail.trim()) segments.push({ kind: 'text', content: tail });
  if (segments.length === 0) return [{ kind: 'text', content: text }];
  return segments;
}

const isMac = () => /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
const isWindows = () => /win/i.test(navigator.platform || navigator.userAgent);

function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function fileExt(path: string): string {
  const name = fileName(path);
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

type FileViewerType =
  | 'code'
  | 'markdown'
  | 'image'
  | 'svg'
  | 'pdf'
  | 'csv'
  | 'text'
  | 'binary';

const CODE_LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', htm: 'html', xml: 'xml', vue: 'html', svelte: 'html',
  py: 'python', pyi: 'python', rs: 'rust', go: 'go', java: 'java',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
  cs: 'csharp', php: 'php', rb: 'ruby', swift: 'swift', kt: 'kotlin',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', conf: 'ini',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  lua: 'lua', pl: 'perl', r: 'r', dart: 'dart', ex: 'elixir', exs: 'elixir',
  scala: 'scala', hs: 'haskell', clj: 'clojure', proto: 'proto',
};

const SPECIAL_TEXT_FILES: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  procfile: 'shell',
  gemfile: 'ruby',
  rakefile: 'ruby',
  vagrantfile: 'ruby',
  brewfile: 'ruby',
  justfile: 'shell',
};

const TEXT_EXTRAS = new Set([
  'txt', 'log', 'env', 'gitignore', 'gitattributes', 'editorconfig', 'npmrc',
  'nvmrc', 'babelrc', 'eslintrc', 'prettierrc', 'lock', 'cfg', 'properties',
  'mdx', 'rst', 'adoc', 'patch', 'diff', 'srt',
]);

const TYPE_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif']);

const BINARY_HINTS = new Set([
  'exe', 'dll', 'so', 'dylib', 'a', 'o', 'obj', 'bin', 'dat', 'class',
  'jar', 'war', 'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'dmg', 'iso',
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'flac', 'ogg',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'psd', 'ai', 'sketch', 'wasm',
  'db', 'sqlite', 'sqlite3', 'pyc', 'pyo', 'node', 'pack', 'idx',
]);

function getFileViewerType(path: string): FileViewerType {
  const name = fileName(path).toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop()! : '';

  // .env variants: ".env", ".env.local", "production.env"
  if (ext === 'env' || name.startsWith('.env')) return 'code';

  switch (ext) {
    case 'md': case 'markdown': return 'markdown';
    case 'svg': return 'svg';
    case 'pdf': return 'pdf';
    case 'csv': case 'tsv': return 'csv';
    default: break;
  }

  if (TYPE_IMAGE_EXTS.has(ext)) return 'image';
  if (BINARY_HINTS.has(ext)) return 'binary';
  if (!ext && SPECIAL_TEXT_FILES[name]) return 'code';
  if (CODE_LANG_BY_EXT[ext] !== undefined) return 'code';
  if (TEXT_EXTRAS.has(ext) || !ext) return 'text';
  return 'binary';
}

function isEditableViewer(t: FileViewerType): boolean {
  return t === 'code' || t === 'markdown' || t === 'text' || t === 'svg';
}

interface FileTypeMeta {
  icon: LucideIcon;
  label: string;
  chip: string;
}

function typeMeta(path: string): FileTypeMeta {
  const ext = fileExt(path);
  switch (ext) {
    case 'pdf':
      return { icon: FileText, label: 'PDF Document', chip: 'text-destructive bg-destructive/10' };
    case 'ppt':
    case 'pptx':
      return { icon: Presentation, label: 'PowerPoint', chip: 'text-orange-400 bg-orange-500/10' };
    case 'xls':
    case 'xlsx':
      return { icon: Sheet, label: 'Excel Workbook', chip: 'text-success bg-success/10' };
    case 'csv':
      return { icon: Sheet, label: 'CSV Spreadsheet', chip: 'text-success bg-success/10' };
    case 'doc':
    case 'docx':
      return { icon: FileText, label: 'Word Document', chip: 'text-sky-400 bg-sky-500/10' };
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'avif':
      return { icon: ImageIcon, label: 'Image', chip: 'text-purple-400 bg-purple-500/10' };
    case 'mp4':
    case 'webm':
    case 'mkv':
    case 'mov':
    case 'avi':
      return { icon: Video, label: 'Video', chip: 'text-sky-400 bg-sky-500/10' };
    case 'mp3':
    case 'wav':
    case 'flac':
    case 'ogg':
    case 'm4a':
      return { icon: Music, label: 'Audio', chip: 'text-warning bg-warning/10' };
    default:
      return { icon: File, label: isEditableViewer(getFileViewerType(path)) ? 'Source File' : 'File', chip: 'text-ink-muted bg-surface-700' };
  }
}

interface FileCardProps {
  path: string;
  /** Optional; when set and the file is editable text, renders an extra
   *  "Open in Editor" action (wired to the caller's IDE file opener). */
  onOpenInEditor?: (path: string) => void;
}

function useFileAction() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setDone(false);
    try {
      await action();
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      /* the host app simply could not be launched */
    } finally {
      setBusy(false);
    }
  };
  return { busy, done, run };
}

export const FileCard = memo(function FileCard({ path, onOpenInEditor }: FileCardProps) {
  const meta = useMemo(() => typeMeta(path), [path]);
  const Icon = meta.icon;
  const name = fileName(path);
  const openInEditor = useFileAction();
  const revealLabel = isWindows() ? 'Show in Explorer' : isMac() ? 'Show in Finder' : 'Show in File Manager';

  /** Open the file in the in-app editor whenever a handler is wired up. */
  const runOpenInEditor = () =>
    openInEditor.run(async () => {
      if (!onOpenInEditor) return;
      await onOpenInEditor(path);
    });

  return (
    <div className="addon-shell relative mx-0 my-2.5 overflow-hidden rounded-lg border border-surface-600 bg-surface-900">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', meta.chip)}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium text-foreground" title={path}>
            {name}
          </p>
          <p className="truncate text-[10.5px] text-ink-muted" title={path}>
            {meta.label}
            <span className="mx-1 opacity-60">·</span>
            <span className="font-mono">{path}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-surface-700/70 px-2.5 py-2">
        <button
          disabled
          className="inline-flex items-center gap-1.5 rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
        >
          <Download className="h-3 w-3" />
          Download
        </button>
        <button
          disabled
          className="inline-flex items-center gap-1.5 rounded-md bg-surface-800 px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:bg-surface-700 hover:text-foreground disabled:opacity-50"
        >
          <ExternalLink className="h-3 w-3" />
          Open
        </button>
        <button
          disabled
          className="inline-flex items-center gap-1.5 rounded-md bg-surface-800 px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:bg-surface-700 hover:text-foreground disabled:opacity-50"
        >
          <FolderOpen className="h-3 w-3" />
          {revealLabel}
        </button>
        {onOpenInEditor && (
          <button
            onClick={runOpenInEditor}
            disabled={openInEditor.busy}
            title="Open in the in-app editor (falls back to your default app)"
            className="inline-flex items-center gap-1.5 rounded-md bg-surface-800 px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:bg-surface-700 hover:text-foreground disabled:opacity-50"
          >
            {openInEditor.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : openInEditor.done ? <Check className="h-3 w-3" /> : <Code2 className="h-3 w-3" />}
            {openInEditor.done ? 'Opened' : 'Open in Editor'}
          </button>
        )}
      </div>
    </div>
  );
});

/** A slim card to show while the marker is still streaming (unclosed). */
export const FileCardPlaceholder = memo(function FileCardPlaceholder() {
  return (
    <div className="addon-shell relative mx-0 my-2.5 flex items-center gap-3 overflow-hidden rounded-lg border border-surface-600 bg-surface-900 px-3 py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-800">
        <AlertTriangle className="h-4 w-4 text-ink-muted" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-ink-muted">Generating file…</p>
      </div>
    </div>
  );
});
