/**
 * @smoke-monkey/ui
 *
 * Provider-agnostic AI chat UI infrastructure: normalized streaming events,
 * a headless runtime, transports, hooks, and a faithful port of the Smoke
 * Monkey Markdown/chat visuals.
 *
 * ----- styling ------------------------------------------------------------
 * Import the compiled theme once in your app:
 *   import '@smoke-monkey/ui/ui.css';
 */

// ── Types ────────────────────────────────────────────────────────────────
export * from './types/stream';
export * from './types/tool';
export * from './types/tools';
export * from './types/prompt';
export * from './types/source';
export * from './types/artifact';
export * from './types/message';
export * from './types/transport';
export * from './types/options';

// ── Lib helpers ──────────────────────────────────────────────────────────
export { cn } from './lib/cn';
export {
  buildToolRun,
  computeToolRuns,
  toolFamily,
  toolFamilyLabel,
  TOOL_FAMILY_LABELS,
  resolvePresentation,
  withPresentation,
} from './lib/toolRuns';
export type { RunPosition, ToolFamily, ToolRun } from './lib/toolRuns';
export { createId } from './lib/id';
export * from './lib/format';
export { readSSELines } from './lib/sse';

// ── Runtime ───────────────────────────────────────────────────────────────
export { applyChatEvent, messageContentFromParts } from './runtime/EventReducer';
export { ChatPromptCard } from './components/chat/ChatPromptCard';
export type { ChatPromptCardProps } from './components/chat/ChatPromptCard';
export { ErrorCard } from './components/chat/ErrorCard';
export type { ErrorCardProps } from './components/chat/ErrorCard';
export { StreamParser } from './runtime/StreamParser';
export type { StreamParserFn } from './runtime/StreamParser';
export { createAgentEventParsers } from './runtime/agentEventParsers';
export type { AgentEventParserOptions } from './runtime/agentEventParsers';
export { ChatRuntime } from './runtime/ChatRuntime';
// The harness <-> UI translation layer. A host needs this to connect a live
// `AgentHarness` run to a chat surface, and to route paused-run answers back
// into the run. See the module doc for the full event mapping.
export { createHarnessBridge, mapHarnessEvent } from './runtime/harnessBridge';
export type {
  BridgeAgent,
  HarnessBridge,
  HarnessBridgeOptions,
  HarnessEvent,
} from './runtime/harnessBridge';

// ── Storage ───────────────────────────────────────────────────────────────
export { MemoryStore } from './store/memoryStore';

// ── Transports ────────────────────────────────────────────────────────────
export { FetchTransport } from './transports/FetchTransport';
export type { FetchTransportOptions } from './transports/FetchTransport';
export { SyntheticTransport } from './transports/SyntheticTransport';
export type { SyntheticStreamOptions } from './transports/SyntheticTransport';
export { WebSocketTransport } from './transports/WebSocketTransport';
export type { WebSocketTransportOptions } from './transports/WebSocketTransport';

// ── Hooks ─────────────────────────────────────────────────────────────────
export { useChat } from './hooks/useChat';
export type { UseChatResult } from './hooks/useChat';
export { useSmokeMonkeyChat } from './hooks/useSmokeMonkeyChat';
export { useStreaming } from './hooks/useStreaming';
export type { UseStreamingOptions, UseStreamingResult } from './hooks/useStreaming';
export { useAutoScroll } from './hooks/useAutoScroll';
export type { UseAutoScrollOptions } from './hooks/useAutoScroll';
export { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
export type { KeyboardShortcut } from './hooks/useKeyboardShortcuts';

// ── Markdown ──────────────────────────────────────────────────────────────
export * from './components/markdown/Markdown';
export { CitationMarkdown } from './components/markdown/citationMarkdown';
export { ErrorBoundary } from './components/markdown/ErrorBoundary';

// ── Visuals (markdown add-ons) ────────────────────────────────────────────
export * from './components/visuals/AddonShell';
export * from './components/visuals/CodeBlock';
export { CHART_MARKER_TAGS, parseChart, ChartBlock, ChartSkeleton } from './components/visuals/ChartBlock';
export * from './components/visuals/TableWithExport';
export * from './components/visuals/CardBlock';
export * from './components/visuals/FileCard';
export * from './components/visuals/FileBasedViewer';
export * from './components/visuals/fileUtils';
export * from './components/visuals/zip';
export * from './components/visuals/MermaidDiagram';
export * from './components/visuals/IsolatedHtml';
export * from './components/visuals/htmlDoc';
export * from './components/visuals/StreamingVisual';
export * from './components/visuals/TreeBlock';
export * from './components/visuals/WorkflowBlock';

// ── Chat UI ───────────────────────────────────────────────────────────────
export { MessageBubble } from './components/chat/MessageBubble';
export type { MessageBubbleProps } from './components/chat/MessageBubble';
export { ChatComposer } from './components/chat/ChatComposer';
export type { ChatComposerProps } from './components/chat/ChatComposer';
export { ChatEmptyState } from './components/chat/ChatEmptyState';
export type { ChatEmptyStateProps } from './components/chat/ChatEmptyState';
export { ChatMessages } from './components/chat/ChatMessages';
export type { ChatMessagesProps } from './components/chat/ChatMessages';
export { ChatPanel } from './components/chat/ChatPanel';
export type { ChatPanelProps } from './components/chat/ChatPanel';
export { SmokeMonkeyChat } from './components/chat/SmokeMonkeyChat';
export type { SmokeMonkeyChatProps } from './components/chat/SmokeMonkeyChat';
export { ToolCallCard } from './components/chat/ToolCallCard';
export type { ToolCallCardProps } from './components/chat/ToolCallCard';
export { ToolIcon, TOOL_FAMILY_ICONS, toolLabel } from './components/chat/ToolIcon';
export type { ToolIconProps } from './components/chat/ToolIcon';
export { ToolRunGroup, ToolRunRow, ToolRunHeader } from './components/chat/ToolRun';
export type { ToolRunGroupProps, ToolRunRowProps, ToolRunHeaderProps } from './components/chat/ToolRun';
export { ArtifactRenderer } from './components/chat/ArtifactRenderer';
export type { ArtifactRendererProps } from './components/chat/ArtifactRenderer';
export { Sources, SourceLink } from './components/chat/Sources';
export type { SourcesProps } from './components/chat/Sources';