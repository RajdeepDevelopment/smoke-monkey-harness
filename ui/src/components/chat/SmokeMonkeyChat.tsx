import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Check, ChevronDown, Plus, Server, Settings, Sparkles, Target, Timer } from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatComposer } from './ChatComposer';
import { PillRow, usePillNarrowContext } from './pill-collapse';
import type { ChatPrompt } from '../../types/prompt';
import type { ToolPresentationMap } from '../../types/tools';
import { ChatPanel } from './ChatPanel';
import type { ChatRuntimeOptions } from '../../types/transport';
import type { ChatSource } from '../../types/source';
import type {
  ApiKeyOption,
  ChatModelOption,
  ChatRouteOption,
  MCPServerOption,
  SmokeMonkeyChatClassNames,
  SmokeMonkeyChatFeatures,
  SmokeMonkeyChatLayout,
  SmokeMonkeyChatPosition,
  SmokeMonkeyChatShortcuts,
  SmokeMonkeyChatSlots,
  SmokeMonkeyChatCustomTheme,
  SmokeMonkeyChatTheme,
  SmokeMonkeyChatThemeVars,
  WorkspaceOption,
} from '../../types/options';
import { cn } from '../../lib/cn';
import { deriveCustomThemeVars, hslTriple, token } from '../../lib/theme';

export interface SmokeMonkeyChatProps {
  /** Required transport (FetchTransport / WebSocketTransport / your own). */
  transport: ChatRuntimeOptions['transport'];
  /** Optional persistence (use MemoryStore or implement ChatStore). */
  store?: ChatRuntimeOptions['store'];
  conversationId?: string;
  /** Initial model — overridden by the header picker when `models` is set. */
  model?: string;
  system?: string;
  /** Static extras merged into every request. */
  request?: ChatRuntimeOptions['request'];

  // ── Data ────────────────────────────────────────────────────────────
  models?: ChatModelOption[];
  workspaces?: WorkspaceOption[];
  mcpServers?: MCPServerOption[];
  apiKeys?: ApiKeyOption[];
  suggestions?: string[];
  /** Routing tiers in the header picker. Omit to keep the built-in free/pro pair. */
  routes?: ChatRouteOption[];

  // ── Layout ──────────────────────────────────────────────────────────
  layout?: SmokeMonkeyChatLayout;
  position?: SmokeMonkeyChatPosition;
  /** Max width of the shared chat column (messages + input box). Optional —
   *  defaults to `48rem`, and both always stay the same width. */
  columnWidth?: string;

  // ── Brand ───────────────────────────────────────────────────────────
  /** Brand icon + name shown in the header. Defaults to `Smoke Monkey`. */
  brand?: { icon?: ReactNode; name?: string };

  /**
   * Conversation name for the header row. Defaults to "New session"; pass the
   * real title so a long name truncates instead of pushing the row's action
   * buttons off the edge.
   */
  sessionTitle?: string;

  // ── Features / theme ────────────────────────────────────────────────
  features?: SmokeMonkeyChatFeatures;
  /**
   * Built-in palette. Default `'dark'`. Each theme is a pure token override
   * applied as a class on the chat root, so nothing about the markup or
   * layout changes. For a custom palette, pass raw custom properties via
   * `style` instead.
   */
  theme?: SmokeMonkeyChatTheme;
  /**
   * Build a palette in JS — no CSS file, no build step. Every key is a theme
   * token as bare HSL channels (`'45 96% 58%'`); anything you leave out falls
   * back to `theme`. Applied inline, so it wins over the theme class and can
   * change at runtime.
   *
   * ```tsx
   * <SmokeMonkeyChat theme="dark" customTheme={{ primary: '190 95% 52%', accent: '45 96% 58%' }} />
   * ```
   */
  customTheme?: SmokeMonkeyChatCustomTheme;
  className?: string;
  classNames?: SmokeMonkeyChatClassNames;
  /** CSS-in-JS overrides — spread on the root. `--sm-*` vars theme tokens. */
  style?: SmokeMonkeyChatThemeVars;

  // ── Components ──────────────────────────────────────────────────────
  slots?: SmokeMonkeyChatSlots;

  // ── Behavior ────────────────────────────────────────────────────────
  onSend?: (text: string) => void;
  onStop?: () => void;
  onRetry?: (text: string) => void;
  /**
   * Answer a run the agent paused on (`ask_user` / a permission request).
   *
   * When omitted the chat falls back to `transport.respond`, and when the
   * transport has none either, prompts render read-only. Intercept this to
   * persist answers, route them to a human, or answer on the user's behalf.
   */
  onPromptRespond?: (prompt: ChatPrompt, answer: string) => void;
  /**
   * Presentation for tools that arrive without one — a replayed history, or a
   * tool list fetched on connect. Keyed by tool name; anything the live event
   * declares wins, so this only needs filling in for tools the backend has
   * not described yet.
   *
   * In a Node backend this is `harness.getToolPresentations()`.
   */
  toolPresentations?: ToolPresentationMap;
  onRegenerate?: (messageId: string) => void;
  onModelChange?: (modelId: string) => void;
  onWorkspaceChange?: (workspaceId: string) => void;
  onMCPChange?: (serverId: string, enabled: boolean) => void;
  onSourceClick?: (source: ChatSource) => void;
  placeholder?: string;

  // ── Keyboard ────────────────────────────────────────────────────────
  shortcuts?: SmokeMonkeyChatShortcuts;
}

const DEFAULT_FEATURES: Required<Omit<SmokeMonkeyChatFeatures, 'header'>> = {
  sessionHeader: false,
  // Assistant prose sits directly on the background (blends in, flush with the
  // column); flip these to opt into the avatar gutter, model chip or plain user text.
  userStyle: 'bubble',
  agentAvatar: false,
  showModel: false,
  suggestions: true,
  attachments: false,
  apiKeys: false,
  mcp: false,
  tokenUsage: true,
  prompts: true,
  modelSelector: true,
  workspaceSelector: true,
  citations: true,
  tools: true,
  artifacts: true,
  charts: true,
  tables: true,
  codeBlocks: true,
  markdown: true,
  autoScroll: true,
  timestamps: true,
  stopButton: true,
  emptyState: true,
};

function featuresWithDefaults(
  f: SmokeMonkeyChatFeatures | undefined,
  hasModels: boolean,
  hasWorkspaces: boolean,
  hasApiKeys: boolean,
  hasMcp: boolean
): Required<Omit<SmokeMonkeyChatFeatures, 'header'>> {
  const d = { ...DEFAULT_FEATURES };
  // A picker/pill turns itself on when you hand it options, and stays off when you
  // don't — passing data is enough, no need to also flip the feature flag.
  if (f?.modelSelector === undefined) d.modelSelector = hasModels;
  if (f?.workspaceSelector === undefined) d.workspaceSelector = hasWorkspaces;
  if (f?.apiKeys === undefined) d.apiKeys = hasApiKeys;
  if (f?.mcp === undefined) d.mcp = hasMcp;
  return { ...d, ...f };
}

function parseShortcut(combo: string): {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
} {
  const parts = combo.split('+').map((p) => p.trim());
  const mods = {
    shiftKey: parts.some((p) => p === 'Shift' || p === '⇧'),
    ctrlKey: parts.some((p) => p === 'Ctrl' || p === 'Control' || p === '⌃'),
    metaKey: parts.some((p) => p === 'Meta' || p === '⌘' || p === 'Cmd'),
    altKey: parts.some((p) => p === 'Alt' || p === '⌥'),
  };
  const key = parts[parts.length - 1] ?? 'Escape';
  return {
    // useKeyboardShortcuts compares the DOM modifier names, so keep the *Key suffix
    key: key.length === 1 ? key.toLowerCase() : key,
    ...mods,
  };
}

/* ───────────────────────── small header pieces ─────────────────────────── */

function Dropdown({
  trigger,
  children,
  align = 'right',
  direction = 'down',
}: {
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  /** Which way the menu opens relative to the trigger. */
  direction?: 'up' | 'down';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 max-h-[min(60vh,19rem)] min-w-44 max-w-[min(92vw,22rem)] overflow-y-auto rounded-xl border border-surface-700 bg-surface-800/95 py-1 shadow-xl shadow-black/40 backdrop-blur scrollbar-thin',
            direction === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-surface-700/60',
        active ? 'text-ink-primary' : 'text-ink-secondary'
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
    </button>
  );
}

const DEFAULT_ROUTES: ChatRouteOption[] = [
  { id: 'free', label: 'OmniRoute (free)' },
  { id: 'pro', label: 'OmniRoute (pro)' },
];

function DefaultHeader({
  brandName,
  sessionTitle,
  brandIcon,
  currentModelLabel,
  models,
  routes = DEFAULT_ROUTES,
  workspaces,
  mcpServers,
  selectedModel,
  selectedWorkspace,
  isStreaming,
  ready,
  connected,
  onModelChange,
  onWorkspaceChange,
  onMCPChange,
  onNewSession,
  className,
}: {
  brandName: string;

  /** Conversation name shown in the header. Falls back to "New session". */
  sessionTitle?: string;
  brandIcon?: ReactNode;
  currentModelLabel?: string;
  models?: ChatModelOption[];
  routes?: ChatRouteOption[];
  workspaces?: WorkspaceOption[];
  mcpServers?: MCPServerOption[];
  selectedModel?: string;
  selectedWorkspace?: string;
  isStreaming: boolean;
  ready: boolean;
  connected: boolean;
  onModelChange?: (id: string) => void;
  onWorkspaceChange?: (id: string) => void;
  onMCPChange?: (id: string, enabled: boolean) => void;
  onNewSession?: () => void;
  className?: string;
}) {
  const [route, setRoute] = useState(routes[0]?.id ?? 'free');
  const model = models?.find((m) => m.id === selectedModel);
  const workspace = workspaces?.find((w) => w.id === selectedWorkspace);
  const label = model?.label ?? currentModelLabel ?? selectedModel ?? 'model';
  const statusDot =
    isStreaming ? 'bg-warning' : !ready ? 'animate-pulse bg-ink-muted' : connected ? 'bg-success' : 'bg-destructive';
  const statusText = isStreaming ? 'Streaming…' : ready ? (connected ? 'Connected' : 'Offline') : 'Connecting…';

  return (
    <header
      className={cn('shrink-0 border-b border-surface-800 bg-bg-elevated/60', className)}
    >
      {/* Row 1 — brand + runtime selectors, aligned with the chat column. */}
      <PillRow className="mx-auto flex min-h-9 w-full max-w-3xl flex-wrap items-center gap-2 px-4 py-1">
        <div className="flex shrink-0 items-center gap-1.5">
          {brandIcon ?? (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 text-[10px]">
              🔥
            </span>
          )}
          <span className="whitespace-nowrap text-[11.5px] font-semibold tracking-tight text-ink-primary">
            {brandName}
          </span>
        </div>

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {workspaces && workspaces.length > 0 && onWorkspaceChange && (
            <Dropdown
              trigger={<HeaderPill icon={<Target className="h-3 w-3" />} label={`Target: ${workspace?.name ?? 'Local'}`} />}
            >
              {(close) =>
                workspaces.map((w) => (
                  <DropdownItem
                    key={w.id}
                    active={w.id === selectedWorkspace}
                    onClick={() => {
                      onWorkspaceChange(w.id);
                      close();
                    }}
                  >
                    {w.name}
                  </DropdownItem>
                ))
              }
            </Dropdown>
          )}

          <Dropdown
            trigger={
              <HeaderPill
                icon={<Settings className="h-3 w-3" />}
                label={routes.find((r) => r.id === route)?.label ?? routes[0]?.label ?? 'route'}
              />
            }
          >
            {(close) =>
              routes.map((r) => (
                <DropdownItem key={r.id} active={r.id === route} onClick={() => { setRoute(r.id); close(); }}>
                  {r.label}
                </DropdownItem>
              ))
            }
          </Dropdown>

          {models && models.length > 0 && onModelChange && (
            <Dropdown trigger={<HeaderPill icon={<Sparkles className="h-3 w-3" />} label={`/ ${label}`} />}>
              {(close) =>
                models.map((m) => (
                  <DropdownItem
                    key={m.id}
                    active={m.id === selectedModel}
                    onClick={() => {
                      onModelChange(m.id);
                      close();
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{m.label}</span>
                      {m.provider && (
                        <span className="truncate text-[9.5px] text-ink-muted">{m.provider}</span>
                      )}
                    </span>
                  </DropdownItem>
                ))
              }
            </Dropdown>
          )}
        </div>
      </PillRow>

      {/* Row 2 — session title + actions, aligned with the chat column. */}
      <div className="border-t border-surface-800/60">
        <div className="mx-auto flex h-9 w-full max-w-3xl items-center gap-2 px-4">
          <span
            title={sessionTitle ?? 'New session'}
            className="min-w-0 truncate text-[12px] font-semibold text-ink-primary"
          >
            {sessionTitle ?? 'New session'}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <span title={statusText} className={cn('h-1.5 w-1.5 rounded-full', statusDot)} />
            <button
              type="button"
              title="New session"
              aria-label="New session"
              onClick={onNewSession}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-surface-700/70 bg-surface-800/50 text-ink-secondary transition-colors hover:border-primary/40 hover:text-ink-primary"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Elapsed time"
              aria-label="Elapsed time"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-surface-700/70 bg-surface-800/50 text-ink-secondary transition-colors hover:border-primary/40 hover:text-ink-primary"
            >
              <Timer className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * One selector pill in the header / composer rows.
 *
 * When the row runs out of room the pill keeps its icon and drops the text
 * rather than truncating it to an unreadable stub — "MCP 43" clipped to "MCP…"
 * is worse than no label at all, because the icon already identifies the
 * control. The full text stays in the tooltip either way.
 *
 * The switch keys off *container* width, not viewport width: this UI is
 * embedded in panels of arbitrary size, and a 1400px window with a 380px
 * sidebar has to collapse exactly like a 380px window does.
 */
function HeaderPill({ icon, label }: { icon: ReactNode; label: string }) {
  const iconOnly = usePillNarrowContext();
  return (
    <span
      title={label}
      className={cn(
        'inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-lg border border-surface-700/70 bg-surface-800/50 text-[11px] font-medium text-ink-secondary transition-colors hover:border-primary/40 hover:text-ink-primary',
        iconOnly ? 'h-7 w-7 justify-center' : 'h-7 px-2.5'
      )}
    >
      <span className="shrink-0">{icon}</span>
      {iconOnly ? (
        // Keep the accessible name even though nothing is drawn: the trigger is a
        // button whose only other content would be the icon.
        <span className="sr-only">{label}</span>
      ) : (
        <>
          <span className="min-w-0 max-w-28 truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-ink-muted" />
        </>
      )}
    </span>
  );
}

function SessionHeader({ workspace, model }: { workspace?: string; model?: string }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-1 pb-1">
      <span className="text-[11px] font-medium text-ink-muted">
        Conversation{workspace ? ` · ${workspace}` : ''}
      </span>
      {model && <span className="text-[10px] text-ink-muted">{model}</span>}
    </div>
  );
}

/* ───────────────────────────── the component ───────────────────────────── */

/**
 * Opinionated, drop-in chat UI. Wires `useChat` + `ChatPanel` into one
 * component: transport in, working assistant out. Feature-flag every piece,
 * swap `slots`, or hand over rendering callbacks.
 *
 * ```tsx
 * import { SmokeMonkeyChat, FetchTransport, StreamParser } from '@smoke-monkey/ui';
 * import '@smoke-monkey/ui/ui.css';
 *
 * <SmokeMonkeyChat transport={new FetchTransport({ url, parser })} />
 * ```
 */
export function SmokeMonkeyChat(props: SmokeMonkeyChatProps) {
  const {
    transport,
    store,
    conversationId,
    model: initialModel,
    system,
    request,
    models,
    workspaces,
    mcpServers,
    apiKeys,
    suggestions,
    routes,
    layout = 'coding',
    position = {},
    brand,
    sessionTitle,
    features,
    theme = 'dark',
    customTheme,
    className,
    classNames,
    style,
    columnWidth,
    slots,
    onSend,
    onStop,
    onRetry,
  onPromptRespond,
  toolPresentations,
    onRegenerate,
    onModelChange,
    onWorkspaceChange,
    onMCPChange,
    onSourceClick,
    placeholder,
    shortcuts,
  } = props;

  const featuresResolved = useMemo(
    () =>
      featuresWithDefaults(
        features,
        !!models?.length,
        !!workspaces?.length,
        !!apiKeys?.length,
        !!mcpServers?.length
      ),
    [features, models, workspaces, apiKeys, mcpServers]
  );

  const [selectedModel, setSelectedModel] = useState(initialModel ?? models?.[0]?.id);
  const [selectedWorkspace, setSelectedWorkspace] = useState(workspaces?.[0]?.id);
  useEffect(() => setSelectedModel(initialModel ?? models?.[0]?.id), [initialModel, models]);

  const { messages, isStreaming, error, connectionStatus, ready, clear, runtime } = useChat({
    transport,
    store: store ?? null,
    conversationId,
    model: initialModel,
    system,
    request,
  });

  // Hot-swap model options onto the runtime so the next send uses the picker.
  useEffect(() => {
    runtime.refresh({ model: selectedModel });
  }, [runtime, selectedModel]);

  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSend = (text: string) => {
    if (isStreaming) return;
    if (onSend) {
      onSend(text);
      return;
    }
    void runtime.send(text);
  };

  const handleStop = () => {
    if (onStop) {
      onStop();
      return;
    }
    runtime.stop();
  };

  /**
   * Answer a run that is blocked on the user.
   *
   * Prefers the host's own handler so a host can persist the answer, then falls
   * back to the transport. With neither, the prompt renders read-only — the run
   * stays paused, but nothing pretends the user can unblock it from here.
   */
  const handlePromptRespond = (prompt: ChatPrompt, answer: string) => {
    if (onPromptRespond) {
      onPromptRespond(prompt, answer);
      return;
    }
    const respond = transport?.respond;
    if (!respond) return;
    // Reflect the answer locally first: the click must take effect on screen
    // before any network round-trip, so the user cannot answer the same
    // question twice.
    runtime.resolvePrompt(prompt.toolCallId, answer);
    try {
      const result = respond.call(transport, {
        conversationId,
        toolCallId: prompt.toolCallId,
        kind: prompt.kind,
        answer,
      });
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      /* the run ended while the user was typing; the card will update anyway */
    }
  };

  const handleRetry = (text: string) => {
    if (onRetry) {
      onRetry(text);
      return;
    }
    handleSend(text);
  };

  const lastUserText = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'user')?.content ?? '',
    [messages]
  );

  const handleRegenerate = () => {
    if (onRegenerate) {
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      onRegenerate(lastAssistant?.id ?? '');
      return;
    }
    if (lastUserText) handleSend(lastUserText);
  };

  // Keyboard shortcuts: Esc → stop (unless typing), Meta+K → focus composer.
  const stopCombo = parseShortcut(shortcuts?.stop ?? 'Escape');
  const focusCombo = parseShortcut(shortcuts?.focusComposer ?? 'Meta+K');
  useKeyboardShortcuts([
    {
      ...stopCombo,
      whenEditing: false,
      preventDefault: true,
      handler: () => {
        if (isStreaming) handleStop();
      },
    },
    {
      ...focusCombo,
      whenEditing: false,
      preventDefault: true,
      handler: () => composerRef.current?.focus(),
    },
  ]);

  const horizontal = layout === 'minimal' ? 'px-2 sm:px-4' : 'px-4 sm:px-6';

  const selectedModelObj = models?.find((m) => m.id === selectedModel);
  const composerModelLabel = selectedModelObj?.label ?? selectedModel ?? initialModel ?? 'model';

  const enterText = placeholder ?? `Ask ${brand?.name ?? 'Smoke Monkey'} to build, fix, or explain...`;

  const totalTokens = useMemo(() => {
    let chars = 0;
    for (const m of messages) {
      if (m.content) chars += m.content.length;
      for (const p of m.parts ?? []) {
        if (p.type === 'text') chars += p.content.length;
      }
    }
    return Math.floor(chars / 4);
  }, [messages]);

  const tokenUsage =
    featuresResolved.tokenUsage && messages.length > 0
      ? { used: Math.min(totalTokens, 113_000), limit: 113_000 }
      : undefined;

  const composerMenuUp = (position?.composer ?? 'bottom') !== 'top';

  const modelChip =
    featuresResolved.modelSelector && models && models.length > 0 ? (
      <Dropdown direction={composerMenuUp ? 'up' : 'down'} trigger={<HeaderPill icon={<Sparkles className="h-3 w-3 text-primary" />} label={composerModelLabel} />}>
        {(close) =>
          models.map((m) => (
            <DropdownItem
              key={m.id}
              active={m.id === selectedModel}
              onClick={() => {
                onModelChange?.(m.id);
                setSelectedModel(m.id);
                close();
              }}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{m.label}</span>
                {m.provider && <span className="truncate text-[9.5px] text-ink-muted">{m.provider}</span>}
              </span>
            </DropdownItem>
          ))
        }
      </Dropdown>
    ) : null;

  const apiKeyChip =
    featuresResolved.apiKeys && apiKeys && apiKeys.length > 0 ? (
      <Dropdown direction={composerMenuUp ? 'up' : 'down'} trigger={<HeaderPill icon={<span aria-hidden>🗝</span>} label="API Keys" />}>
        {(close) =>
          apiKeys.map((k) => (
            <DropdownItem key={k.provider} onClick={close}>
              <span className="flex w-full items-center justify-between gap-2">
                <span className="truncate">{k.provider}</span>
                <span className={cn('text-[10px]', k.status === 'set' ? 'text-success' : 'text-warning')}>
                  {k.status === 'set' ? '✓ set' : 'missing'}
                </span>
              </span>
            </DropdownItem>
          ))
        }
      </Dropdown>
    ) : null;

  const mcpChip =
    featuresResolved.mcp && mcpServers && mcpServers.length > 0 ? (
      <Dropdown direction={composerMenuUp ? 'up' : 'down'} trigger={<HeaderPill icon={<span aria-hidden>🔌</span>} label={`MCP ${mcpServers.length}`} />}>
        {(close) =>
          mcpServers.map((s) => (
            <DropdownItem key={s.id} onClick={() => { onMCPChange?.(s.id, !s.connected); close(); }}>
              <span className="flex items-center gap-1.5">
                <Server className="h-3 w-3 text-ink-muted" />
                {s.name}
              </span>
              <span className={cn('text-[10px]', s.connected ? 'text-success' : 'text-ink-muted')}>
                {s.connected ? 'on' : 'off'}
              </span>
            </DropdownItem>
          ))
        }
      </Dropdown>
    ) : null;

  const defaultComposer = (
    <ChatComposer
      inputRef={composerRef}
      onSubmit={handleSend}
      onStop={handleStop}
      isStreaming={isStreaming}
      disabled={!transport && !onSend}
      placeholder={enterText}
      attachments={featuresResolved.attachments}
      toolbar={
        <>
          {modelChip}
          {apiKeyChip}
          {mcpChip}
        </>
      }
      tokenUsage={tokenUsage}
      className={classNames?.composer}
    />
  );

  const bottomCenter = position.composer === 'bottom-center' || position.composer === 'floating';
  const topComposer = position.composer === 'top';
  const composerPosition: 'bottom' | 'top' = topComposer ? 'top' : 'bottom';

  const composerOverlay = bottomCenter ? (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center">
      <div
        className="pointer-events-auto w-full overflow-y-auto px-4 pb-4 sm:px-6"
        style={{ maxWidth: 'var(--sm-composer-width, 44rem)' }}
      >
        {slots?.composer ?? defaultComposer}
      </div>
    </div>
  ) : null;

  const sessionHeader =
    featuresResolved.sessionHeader && (
      <SessionHeader
        workspace={workspaces?.find((w) => w.id === selectedWorkspace)?.name}
        model={composerModelLabel}
      />
    );

  const regenerateButton =
    !isStreaming && lastUserText ? (
      <button
        type="button"
        onClick={handleRegenerate}
        className="mx-auto text-[10.5px] font-medium text-ink-muted transition-colors hover:text-ink-primary"
      >
        ↻ Regenerate response
      </button>
    ) : null;

  const customEmpty =
    slots?.empty ??
    (featuresResolved.emptyState === false ? undefined : (
      <ChatEmptyState
        icon={brand?.icon}
        title={brand?.name ?? 'Smoke Monkey'}
        suggestions={featuresResolved.suggestions ? suggestions : []}
        onSuggestionClick={handleSend}
        className={classNames?.empty}
        suggestionClassName={classNames?.suggestion}
      />
    ));

  const beforeList = (
    <>
      {featuresResolved.sessionHeader && sessionHeader}
      {slots?.beforeList}
    </>
  );

  const afterList = regenerateButton ? (
    <>
      {regenerateButton}
      {slots?.afterList}
    </>
  ) : (
    slots?.afterList
  );

  const headerHidden = position.header === 'hidden' || features?.header === false;
  const handleModelChange = (id: string) => {
    setSelectedModel(id);
    onModelChange?.(id);
  };
  const handleWorkspaceChange = (id: string) => {
    setSelectedWorkspace(id);
    onWorkspaceChange?.(id);
  };
  const handleMCPChange = (id: string, enabled: boolean) => onMCPChange?.(id, enabled);

  const defaultHeaderNode = headerHidden ? null : (
    <DefaultHeader
      sessionTitle={sessionTitle}
      brandName={brand?.name ?? 'Smoke Monkey'}
      brandIcon={brand?.icon}
      currentModelLabel={initialModel}
      models={featuresResolved.modelSelector && !slots?.header ? models : undefined}
      routes={routes}
      workspaces={slots?.header ? undefined : featuresResolved.workspaceSelector ? workspaces : undefined}
      mcpServers={slots?.header ? undefined : featuresResolved.mcp ? mcpServers : undefined}
      selectedModel={selectedModel}
      selectedWorkspace={selectedWorkspace}
      isStreaming={isStreaming}
      ready={ready}
      connected={ready && connectionStatus !== 'unknown'}
      onModelChange={handleModelChange}
      onWorkspaceChange={handleWorkspaceChange}
      onMCPChange={handleMCPChange}
      onNewSession={clear}
      className={classNames?.header}
    />
  );

  const chatBg = (style as (CSSProperties & Record<string, string>) | undefined)?.['--sm-chat-bg'];

  // `--sm-primary` / `--sm-accent` are a one-line recolor on top of any theme.
  // Tokens are consumed as `hsl(var(--primary) / …)`, so only an HSL triple
  // ("45 96% 58%") is aliased — a hex would break every alpha usage.
  const styleVars = style as (CSSProperties & Record<string, string>) | undefined;
  const recolor = {
    ...(hslTriple(styleVars?.['--sm-primary']) ? { '--primary': hslTriple(styleVars?.['--sm-primary']) } : null),
    ...(hslTriple(styleVars?.['--sm-accent']) ? { '--accent': hslTriple(styleVars?.['--sm-accent']) } : null),
  };
  // `customTheme` is a JS palette: camelCase key -> `--kebab-case` token.
  // Applied inline so it outranks the theme class and can change at runtime.
  // Tokens the caller omitted are derived from the ones they did set, so a
  // partial palette can't mix a light bg with the stock dark surfaces.
  const customVars = {
    ...(customTheme ? deriveCustomThemeVars(customTheme) : null),
    ...Object.fromEntries(
      Object.entries(customTheme ?? {})
        .filter(([k, v]) => k !== 'scheme' && typeof v === 'string')
        .map(([k, v]) => [token(k as keyof SmokeMonkeyChatCustomTheme), v])
    ),
  } as CSSProperties;

  const rootStyle = {
    ...style,
    ...recolor,
    ...customVars,
    ...(customTheme?.scheme ? { colorScheme: customTheme.scheme } : null),
    ...(chatBg ? { backgroundColor: chatBg, backgroundSize: 'cover', backgroundPosition: 'center' } : null),
  } as CSSProperties;

  return (
    <div
      data-sm-chat=""
      style={rootStyle}
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden bg-bg text-ink-primary',
        layout === 'cozy' && 'px-2 sm:px-4',
        // A theme is just a class that re-points the design tokens.
        theme !== 'dark' && `smc-${theme}`,
        className,
        classNames?.root
      )}
    >
      {slots?.header ?? defaultHeaderNode}

      <ChatPanel
        messages={messages}
        isStreaming={isStreaming}
        error={error}
        onSend={handleSend}
        onStop={featuresResolved.stopButton === false ? undefined : handleStop}
        onClear={clear}
        onRetry={handleRetry}
        onPromptRespond={featuresResolved.prompts === false ? undefined : handlePromptRespond}
        toolPresentations={toolPresentations}
        placeholder={enterText}
        empty={customEmpty}
        beforeList={beforeList}
        afterList={afterList}
        composer={slots?.composer ?? defaultComposer}
        composerPosition={composerPosition}
        hideComposer={bottomCenter}
        composerClassName={classNames?.composer}
        columnMaxWidth={columnWidth}
        showTimestamps={featuresResolved.timestamps}
        showSources={featuresResolved.citations}
        autoScroll={featuresResolved.autoScroll}
        messageFeatures={{
          ...featuresResolved,
          bubbleClassName: classNames?.bubble,
          userBubbleClassName: classNames?.userBubble,
        }}
        messageSlots={slots}
        Message={slots?.message}
        onSourceClick={featuresResolved.citations === false ? undefined : onSourceClick}
        innerClassName={cn(horizontal, bottomCenter && 'pb-32', classNames?.messages)}
      />

      {composerOverlay}
      {slots?.footer}
    </div>
  );
}