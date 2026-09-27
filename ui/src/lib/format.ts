/** "2026-08-14T…" → "Aug 14" (same year) or "Aug 14, 2025" otherwise. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

/** Compact formatter: 1284 → "1.28K", 1250000 → "1.25M". */
export function formatCompact(value: number): string {
  if (value < 1000) return value.toLocaleString('en-US');
  const units = ['K', 'M', 'B'];
  let scaled = value;
  let unit = '';
  for (const u of units) {
    scaled /= 1000;
    unit = u;
    if (Math.abs(scaled) < 1000) break;
  }
  return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)}${unit}`;
}

/** Human file size: 2412345 → "2.3 MB". */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** File extension from a name: "report.pdf" → "PDF". */
export function fileExtension(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toUpperCase() : 'FILE';
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}