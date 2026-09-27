/**
 * Tool presentation, mirroring the harness's `ToolPresentation`.
 *
 * The two shapes are kept identical on purpose: a tool declares its icon once,
 * in Node, and that declaration travels over the wire and is used as-is here.
 * Re-deriving it on this side would mean two registries to keep in sync.
 */
export const TOOL_FAMILIES = ['inspect', 'edit', 'run', 'verify', 'git', 'plan', 'ask'] as const;

export type ToolFamily = (typeof TOOL_FAMILIES)[number];

export type ToolTone = 'default' | 'primary' | 'success' | 'warning' | 'destructive';

export interface ToolPresentation {
  /** Emoji glyph, e.g. `"💳"`. Wins over `family` when both are given. */
  icon?: string;
  /** Human label. Falls back to a title-cased tool name. */
  label?: string;
  /** Family key, so a UI can pick a sensible glyph when `icon` is absent. */
  family?: ToolFamily;
  /** Accent for the glyph, mapped to the active theme's tokens. */
  tone?: ToolTone;
}

/**
 * Host-supplied presentation, keyed by tool name.
 *
 * Use this for tools the FE learns about outside a `tool.started` payload — a
 * history replayed from storage, or a tool list fetched on connect. Live calls
 * carry their own presentation, and that wins.
 */
export type ToolPresentationMap = Record<string, ToolPresentation>;
