export type ChartKind = 'line' | 'bar' | 'area' | 'pie' | 'donut' | 'scatter' | 'radar';

export interface ChartSeries {
  key: string;
  name?: string;
  color?: string;
}

export interface ChartArtifactConfig {
  xKey?: string;
  yKeys?: string[];
  series?: ChartSeries[];
  stacked?: boolean;
  showLegend?: boolean;
  showGrid?: boolean;
  colors?: string[];
}

/**
 * First-class chart artifact. Charts are NOT trapped inside markdown — they
 * arrive as `artifact` stream events and render standalone, so users can copy
 * the data, download CSV, expand or change chart type.
 */
export interface ChartArtifact {
  type: 'chart';
  chartType: ChartKind;
  title?: string;
  description?: string;
  data: unknown[];
  config?: ChartArtifactConfig;
}

export interface TableColumn {
  key: string;
  label?: string;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
}

export interface TableArtifactConfig {
  pagination?: { enabled?: boolean; pageSize?: number };
  sortable?: boolean;
  filterable?: boolean;
}

export interface TableArtifact {
  type: 'table';
  title?: string;
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  config?: TableArtifactConfig;
}

export interface FileArtifact {
  type: 'file';
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  url?: string;
  path?: string;
  downloadUrl?: string;
  previewUrl?: string;
}

export interface ImageArtifact {
  type: 'image';
  url?: string;
  dataUri?: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
}

export interface TextArtifact {
  type: 'text';
  title?: string;
  content: string;
  language?: string;
}

export type ChatArtifact = ChartArtifact | TableArtifact | FileArtifact | ImageArtifact | TextArtifact;

export const CHART_KINDS: readonly ChartKind[] = [
  'line',
  'bar',
  'area',
  'pie',
  'donut',
  'scatter',
  'radar',
];

/**
 * Categorical series scale, expressed as CSS colour functions over the
 * semantic tokens.
 *
 * These are deliberately NOT literal hex values, and the tokens are referenced
 * at the *use* site rather than through a pre-composed custom property:
 * a declaration such as `:root { --chart-1: hsl(var(--primary)) }` resolves
 * `var(--primary)` on `:root`, which pins every chart to the default palette
 * and makes custom themes inert. Emitting the expression straight into the
 * element's `style` keeps the lookup inside the themed subtree, so series
 * follow the active built-in theme and any custom theme.
 *
 * Note that SVG/DOM presentation attributes (`fill="…"`, `stroke="…"`) cannot
 * resolve `var()`, so callers must pass these through a `style` prop.
 */
const CHART_TOKENS = [
  'primary',
  'accent',
  'info',
  'success',
  'warning',
  'destructive',
] as const;

/** Extra steps blended from the semantic hues, widening the categorical range. */
const CHART_BLEND_TOKENS: ReadonlyArray<readonly [string, string]> = [
  ['primary', 'accent'],
  ['info', 'success'],
];

const hsl = (token: string): string => `hsl(var(--${token}))`;

const blend = (a: string, b: string): string =>
  `color-mix(in oklab, ${hsl(a)} 58%, ${hsl(b)})`;

/** Every colour in the categorical scale, in order. */
export const CHART_COLOR_VARS: readonly string[] = [
  ...CHART_TOKENS.map(hsl),
  ...CHART_BLEND_TOKENS.map(([a, b]) => blend(a, b)),
];

/** Series colour for the nth data point, cycling through the scale. */
export function chartColor(index: number): string {
  const n = CHART_COLOR_VARS.length;
  return CHART_COLOR_VARS[((index % n) + n) % n]!;
}

/**
 * @deprecated Renamed to `CHART_COLOR_VARS` / `chartColor()` — the old hex
 * palette ignored the active theme. Kept as an alias for type compatibility.
 */
export const DEFAULT_CHART_COLORS = CHART_COLOR_VARS;

export function isChatArtifact(value: unknown): value is ChatArtifact {
  if (!value || typeof value !== 'object') return false;
  const t = (value as { type?: unknown }).type;
  return t === 'chart' || t === 'table' || t === 'file' || t === 'image' || t === 'text';
}