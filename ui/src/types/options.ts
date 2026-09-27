import type { CSSProperties, ComponentType, ReactNode } from 'react';
import type { ChatArtifact } from './artifact';
import type { ChatSource } from './source';

/** A selectable model surfaced by the model picker. */
export interface ChatModelOption {
  id: string;
  label: string;
  provider?: string;
  /** Optional color/hint, e.g. 'anthropic' | 'openai'. */
  kind?: string;
}

/** A selectable workspace (multi-tenant / project scoping). */
export interface WorkspaceOption {
  id: string;
  name: string;
  /** Optional icon hint, e.g. 'code' | 'docs' | 'data'. */
  kind?: string;
}

/** An MCP server the user has configured. */
export interface MCPServerOption {
  id: string;
  name: string;
  connected?: boolean;
  toolCount?: number;
}

/** A provider API key status shown in the header. */
export interface ApiKeyOption {
  provider: string;
  status: 'set' | 'missing';
}

/** A routing tier (e.g. free/pro) shown in the header picker. */
export interface ChatRouteOption {
  id: string;
  label: string;
}

export type SmokeMonkeyChatLayout = 'coding' | 'cozy' | 'minimal';

export interface SmokeMonkeyChatPosition {
  composer?: 'bottom' | 'bottom-center' | 'top' | 'floating';
  header?: 'top' | 'hidden';
}

export interface SmokeMonkeyChatClassNames {
  root?: string;
  header?: string;
  messages?: string;
  composer?: string;
  /** Assistant prose container. */
  bubble?: string;
  /** User message container. */
  userBubble?: string;
  /** Empty-state wrapper. */
  empty?: string;
  /** Individual suggestion buttons in the empty state. */
  suggestion?: string;
}

export interface SmokeMonkeyChatFeatures {
  // ── Chrome ──────────────────────────────────────────────────────────
  /** Top header bar (brand, selectors, connection). Default true. */
  header?: boolean;
  /** Conversation title bar above the message list. Default true. */
  sessionHeader?: boolean;
  /** Suggested-prompt chips (empty state / above composer). Default true. */
  suggestions?: boolean;
  /** Paperclip + attached-file chips in the composer. Default false. */
  attachments?: boolean;
  /** API-key status pills in the header. Default true when `apiKeys` is provided. */
  apiKeys?: boolean;
  /** MCP server dropdown in the header. Default true when `mcpServers` is provided. */
  mcp?: boolean;
  /** Token usage footer on each assistant message. Default true. */
  tokenUsage?: boolean;
  /**
   * Inline `ask_user` / permission cards. Default true.
   *
   * Turning this off does not unblock a paused run — it only hides the card.
   * Use it when prompts are answered somewhere else entirely.
   */
  prompts?: boolean;
  /** Model picker in the header. Default true when `models` is provided. */
  modelSelector?: boolean;
  /** Workspace picker in the header. Default true when `workspaces` is provided. */
  workspaceSelector?: boolean;
  // ── Message rendering ───────────────────────────────────────────────
  /** User message shape. Default 'bubble' (filled, right-aligned). */
  userStyle?: 'bubble' | 'plain';
  /** Show the agent avatar gutter next to assistant messages. Default false. */
  agentAvatar?: boolean;
  /** Show the model chip under assistant messages. Default false. */
  showModel?: boolean;
  /** Render source chips under assistant messages. Default true. */
  citations?: boolean;
  /** Render tool-call cards. Default true. */
  tools?: boolean;
  /** Render structured artifacts. Default true. */
  artifacts?: boolean;
  /** Render chart artifacts (needs `artifacts`). Default true. */
  charts?: boolean;
  /** Render table artifacts (needs `artifacts`). Default true. */
  tables?: boolean;
  /** Render fenced code blocks with the code renderer. Default true. */
  codeBlocks?: boolean;
  /** Render assistant prose as Markdown. Default true. */
  markdown?: boolean;
  // ── Scroll / misc ───────────────────────────────────────────────────
  autoScroll?: boolean;
  timestamps?: boolean;
  stopButton?: boolean;
  emptyState?: boolean;
}

export interface SmokeMonkeyChatShortcuts {
  /** Enter in the composer always sends — this is baked in, shown for clarity. */
  send?: string;
  /** Stop an in-flight stream. Default: Escape. */
  stop?: string;
  /** Focus the composer. Default: Meta/Ctrl+K. */
  focusComposer?: string;
}

export interface SmokeMonkeyChatSlots {
  header?: ReactNode;
  footer?: ReactNode;
  empty?: ReactNode;
  beforeList?: ReactNode;
  afterList?: ReactNode;
  /** Replaces the default composer. */
  composer?: ReactNode;
  /** Replaces <MessageBubble/> for every message. */
  message?: ComponentType<{
    message: import('./message').ChatMessage;
    showModel?: boolean;
    onRetry?: (text: string) => void;
  }>;
  /** Replaces <CodeBlock/> for fenced code. */
  codeBlock?: ComponentType<{ language: string; children: string }>;
  /** Replaces <ToolCallCard/>. */
  toolCall?: ComponentType<{
    call: import('./tool').ToolCall;
    compact?: boolean;
  }>;
  /** Replaces chart artifacts inside <ArtifactRenderer/>. */
  chart?: ComponentType<{ artifact: ChatArtifact; onDownload?: () => void }>;
  /** Replaces table artifacts inside <ArtifactRenderer/>. */
  table?: ComponentType<{ artifact: ChatArtifact; onDownload?: () => void }>;
  /** Replaces the <Sources/> chips. */
  sources?: ComponentType<{
    sources: ChatSource[];
    onSourceClick?: (source: ChatSource) => void;
  }>;
}

/**
 * Built-in palettes. Each is a pure token override (see
 * `styles/_themes.scss`), so a theme never changes markup or layout.
 *
 * Need a different palette? Use `customTheme` (no CSS file needed), pass raw
 * custom properties via `style`, or add a block in `_themes.scss` and put its
 * class name here.
 */
export type SmokeMonkeyChatTheme =
  | 'dark'
  | 'light'
  | 'yellow'
  | 'ember'
  | 'crimson'
  | 'rose'
  | 'midnight'
  | 'ocean'
  | 'forest'
  | 'grape'
  | 'synthwave'
  | 'mono'
  | 'solar'
  | 'paper';

/** Every themeable token, as bare HSL channels (`'45 96% 58%'`). */
export interface SmokeMonkeyChatCustomTheme {
  /** Sets `color-scheme`, so form controls and scrollbars follow. */
  scheme?: 'dark' | 'light';
  /** Page/chat background. */
  bg?: string;
  /** Second surface step, used by raised panels. */
  bgElevated?: string;
  surface950?: string;
  surface900?: string;
  surface850?: string;
  surface800?: string;
  surface750?: string;
  surface700?: string;
  surface600?: string;
  /** Body text. */
  inkPrimary?: string;
  inkSecondary?: string;
  inkMuted?: string;
  /** Brand colour: buttons, user bubble, focus rings, headings. */
  primary?: string;
  primaryHover?: string;
  primaryDeep?: string;
  /** Text/icon colour ON a `primary` fill. Keep dark for light brands. */
  primaryForeground?: string;
  /** Secondary accent: links, blockquotes, markers. */
  accent?: string;
  accentHover?: string;
  accentForeground?: string;
  /** Hairlines and inputs. */
  border?: string;
  borderStrong?: string;
  input?: string;
  ring?: string;
  /** Dropdowns and popovers. */
  popover?: string;
  popoverForeground?: string;
  card?: string;
  cardForeground?: string;
  /** Semantic overrides, if the defaults don't fit your palette. */
  success?: string;
  warning?: string;
  destructive?: string;
  info?: string;
}

export interface SmokeMonkeyChatThemeVars extends CSSProperties {
  /**
   * One-line recolor on top of the active `theme`. Must be an **HSL triple**
   * (`'45 96% 58%'`), not a hex, because every token is consumed as
   * `hsl(var(--primary) / <alpha>)`. Ignored if it isn't a valid triple.
   */
  '--sm-primary'?: string;
  /** Same format as `--sm-primary`. */
  '--sm-accent'?: string;
  '--sm-chat-bg'?: string;
  '--sm-composer-width'?: string | number;
  [key: `--sm-${string}`]: unknown;
}