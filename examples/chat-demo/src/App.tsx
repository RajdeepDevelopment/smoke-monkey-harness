// ────────────────────────────────────────────────────────────────────────────
// Smoke Monkey Chat — demo app
//
// This shows off the full <SmokeMonkeyChat /> API. It runs on a built-in
// synthetic transport, so there is NO backend and NO API key required.
//
// Want to try it?  pnpm dev   →  http://localhost:5173
// Then just type a message and press Enter.
// ────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import {
  ErrorCard,
  MemoryStore,
  SmokeMonkeyChat,
  SyntheticTransport,
  ToolIcon,
  toolLabel,
} from '@smoke-monkey/ui';
import type {
  ChatMessage,
  SmokeMonkeyChatCustomTheme,
  SmokeMonkeyChatTheme,
  ToolCall,
  ToolPresentationMap,
} from '@smoke-monkey/ui';
import {
  DEMO_API_KEYS,
  DEMO_MCP_SERVERS,
  DEMO_MODELS,
  DEMO_SUGGESTIONS,
  DEMO_WORKSPACES,
} from './demoData';

const DEMO_CONVERSATION_ID = 'demo-conversation';

// Every built-in theme, grouped so the picker reads as a palette list.
const THEME_GROUPS: { label: string; themes: SmokeMonkeyChatTheme[] }[] = [
  { label: 'Dark', themes: ['dark', 'yellow', 'ember', 'crimson', 'rose', 'grape', 'midnight', 'ocean', 'forest', 'synthwave', 'mono'] },
  { label: 'Light', themes: ['light', 'solar', 'paper'] },
];

/**
 * The chat takes colors as bare HSL channels (`'45 96% 58%'`) because every
 * token is consumed as `hsl(var(--primary) / <alpha>)`. This lets the demo's
 * color pickers speak plain hex and still produce a valid palette.
 */
function hexToHsl(hex: string): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return `0 0% ${Math.round(l * 100)}%`;
  const sat = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return `${h} ${Math.round(sat * 100)}% ${Math.round(l * 100)}%`;
}

/** WCAG relative luminance of a `#rrggbb` color. */
function relLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Picks the readable foreground for a brand color, so changing `primary`
 *  can't leave the send button or user bubble unreadable. */
function readableOn(hex: string): string {
  const l = relLuminance(hex);
  // contrast(white, c) = 1.05 / (l + 0.05); contrast(black, c) = (l + 0.05) / 0.05
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#fafafa' : '#0a0a0a';
}

/** Contrast ratio between two `#rrggbb` colors. */
function contrastRatio(a: string, b: string): number {
  const [x, y] = [relLuminance(a), relLuminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** The keys the widget paints as text, so the builder can flag weak picks. */
const TEXT_KEYS = ['primary', 'accent', 'inkPrimary'] as const;

/** A starting point for the custom-theme builder. */
const CUSTOM_THEME_SEED = {
  primary: '#f8d03c',
  primaryForeground: '#1a1611',
  accent: '#f97316',
  bg: '#141210',
  inkPrimary: '#fcf9f3',
  border: '#3a3228',
};

type CustomThemeKey = keyof typeof CUSTOM_THEME_SEED;

// Seed the in-memory store with a pre-filled conversation so the demo opens
// with real content (arts, tool calls, a chart, citations) instead of an
// empty screen. Delete these and start fresh whenever you like.
const SEED_MESSAGES: ChatMessage[] = [
  {
    id: 'seed-user-1',
    conversationId: DEMO_CONVERSATION_ID,
    role: 'user',
    status: 'complete',
    content: 'Summarize this repo and fix the failing tests',
    parts: [{ type: 'text', content: 'Summarize this repo and fix the failing tests' }],
    createdAt: '2026-01-05T09:10:00.000Z',
  },
  {
    id: 'seed-ai-1',
    conversationId: DEMO_CONVERSATION_ID,
    role: 'assistant',
    status: 'complete',
    content:
      'I looked through the codebase. **3 tests are failing** in `auth.spec.ts`, the `development` branch builds green, and I’ve drafted a fix plus a chart of the test results.',
    model: 'oc/big-pickle',
    parts: [
      {
        type: 'markdown',
        content:
          'I looked through the codebase. **3 tests are failing** in `auth.spec.ts`, the `development` branch builds green, and I’ve drafted a fix plus a chart of the test results.',
      },
      {
        type: 'code',
        language: 'ts',
        code: "const failures = await runTests('auth.spec.ts');\nconsole.log(failures.map((f) => f.name));",
      },
      {
        type: 'tool',
        toolCall: {
          id: 'tc-1',
          name: 'run_tests',
          status: 'success',
          input: { file: 'auth.spec.ts' },
          durationMs: 482,
        },
      },
      {
        type: 'tool',
        toolCall: {
          id: 'tc-2',
          name: 'run_tests',
          status: 'success',
          input: { file: 'auth.spec.ts' },
          durationMs: 482,
        },
      },
      {
        type: 'artifact',
        artifact: {
          type: 'chart',
          chartType: 'bar',
          title: 'Test results by file',
          data: [
            { label: 'auth.spec.ts', value: 3 },
            { label: 'api.spec.ts', value: 1 },
            { label: 'ui.spec.ts', value: 0 },
          ],
          config: { xKey: 'label', yKeys: ['value'], showGrid: true },
        },
      },
      {
        type: 'citation',
        source: {
          id: 'src-1',
          title: 'Running the test suite',
          url: 'https://docs.example.com/test',
          domain: 'docs.example.com',
          type: 'knowledge',
          score: 0.92,
        },
      },
    ],
    sources: [
      {
        id: 'src-1',
        title: 'Running the test suite',
        url: 'https://docs.example.com/test',
        domain: 'docs.example.com',
        type: 'knowledge',
        score: 0.92,
      },
    ],
    toolCalls: [
      {
        id: 'tc-1',
        name: 'run_tests',
        status: 'success',
        input: { file: 'auth.spec.ts' },
        durationMs: 482,
      },
    ],
    createdAt: '2026-01-05T09:10:05.000Z',
  },

  // ── 1b) A chart with long category names: the label axis is what breaks
  //    first on a narrow screen, so it needs to be in the history above the
  //    fold, not something you have to send a message to see. ──
  {
    id: 'seed-ai-1b',
    conversationId: DEMO_CONVERSATION_ID,
    role: 'user',
    status: 'complete',
    content: 'How slow is the suite getting?',
    parts: [{ type: 'text', content: 'How slow is the suite getting?' }],
    createdAt: '2026-01-05T09:11:00.000Z',
  },
  {
    id: 'seed-ai-1c',
    conversationId: DEMO_CONVERSATION_ID,
    role: 'assistant',
    status: 'complete',
    content: 'Runtime by file, over the last six runs.',
    model: 'oc/big-pickle',
    parts: [
      {
        type: 'artifact',
        artifact: {
          type: 'chart',
          chartType: 'line',
          title: 'Suite runtime by file (last 6 runs)',
          data: [
            { run: 'Run 1', 'auth.spec.ts': 41, 'api.spec.ts': 22, 'ui.spec.ts': 68, 'plugin.spec.ts': 15 },
            { run: 'Run 2', 'auth.spec.ts': 38, 'api.spec.ts': 25, 'ui.spec.ts': 71, 'plugin.spec.ts': 14 },
            { run: 'Run 3', 'auth.spec.ts': 44, 'api.spec.ts': 21, 'ui.spec.ts': 66, 'plugin.spec.ts': 18 },
            { run: 'Run 4', 'auth.spec.ts': 52, 'api.spec.ts': 29, 'ui.spec.ts': 74, 'plugin.spec.ts': 16 },
            { run: 'Run 5', 'auth.spec.ts': 47, 'api.spec.ts': 24, 'ui.spec.ts': 69, 'plugin.spec.ts': 13 },
            { run: 'Run 6', 'auth.spec.ts': 39, 'api.spec.ts': 20, 'ui.spec.ts': 63, 'plugin.spec.ts': 15 },
          ],
          config: { xKey: 'run', yKeys: ['auth.spec.ts', 'api.spec.ts', 'ui.spec.ts', 'plugin.spec.ts'], showGrid: true },
        },
      },
      {
        type: 'text',
        content:
          '`ui.spec.ts` dominates the wall clock and has been flat all week, so the suite is not getting slower — it was always this slow.',
      },
    ],
    createdAt: '2026-01-05T09:11:20.000Z',
  },

  // ── 2) Markdown kitchen sink: every GFM feature the renderer supports ──
  {
    id: 'seed-ai-2',
    conversationId: DEMO_CONVERSATION_ID,
    role: 'assistant',
    status: 'complete',
    content: 'Every Markdown element, so regressions are obvious at a glance.',
    model: 'oc/big-pickle',
    parts: [
      {
        type: 'markdown',
        content: [
          '# Heading 1',
          '## Heading 2',
          '### Heading 3',
          '#### Heading 4',
          '##### Heading 5',
          '###### Heading 6',
          '',
          '**Bold**, *italic*, ***bold italic***, ~~strikethrough~~ and `inline code`.',
          'A [link](https://example.com), an autolink <https://example.com/docs>,',
          'and a hard break  ',
          'on the line below.',
          '',
          '1. Ordered one',
          '2. Ordered two',
          '   1. Nested ordered',
          '   2. Nested ordered two',
          '',
          '- Unordered one',
          '- Unordered two',
          '  - Nested bullet',
          '    - Deeper bullet',
          '',
          '- [x] Done task',
          '- [ ] Pending task',
          '- [ ] Another pending task',
          '',
          '> A blockquote',
          '> > Nested blockquote',
          '> > > Third level',
          '',
          '| Language | Typed | Mixed',
          '| :--- | :---: | ---: |',
          '| TypeScript | strict | 42 |',
          '| Python | dynamic | 3.14 |',
          '',
          '---',
        ].join('\n'),
      },
      {
        type: 'markdown',
        content: [
          '### Chart markers',
          '',
          'Marker charts take their series colours from the active theme, so they',
          're-colour with the theme switcher above.',
          '',
          '<bar-chart-st>{"title":"Marker chart","data":[{"label":"Mon","value":12},{"label":"Tue","value":19},{"label":"Wed","value":7},{"label":"Thu","value":24}]}<bar-chart-ed>',
          '',
          '<line-chart-st>{"title":"Marker line","data":[{"label":"v1","value":210},{"label":"v2","value":186},{"label":"v3","value":154}]}<line-chart-ed>',
          '',
          '<pie-chart-st>{"title":"Marker pie","data":[{"name":"Errors","value":3},{"name":"Warnings","value":8},{"name":"Passing","value":21}]}<pie-chart-ed>',
          '',
          '<scatter-chart-st>{"title":"Marker scatter","x":"latency","y":"score","data":[{"x":12,"y":80},{"x":28,"y":54},{"x":45,"y":71},{"x":63,"y":33}]}<scatter-chart-ed>',
        ].join('\n'),
      },
      {
        type: 'code',
        language: 'ts',
        code: "export const add = (a: number, b: number): number => a + b;\ntype Maybe<T> = T | null;\ninterface User { id: string; name?: Maybe<string> }",
      },
      {
        type: 'code',
        language: 'python',
        code: 'def fib(n: int) -> int:\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a',
      },
      {
        type: 'code',
        language: 'bash',
        code: 'pnpm install --frozen-lockfile\npnpm typecheck && pnpm build',
      },
      {
        type: 'code',
        language: 'json',
        code: '{\n  "name": "smoke-monkey",\n  "private": true,\n  "version": "0.1.0"\n}',
      },
      {
        type: 'code',
        language: 'diff',
        code: '--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,3 +1,4 @@\n+export * from \'./lib/toolRuns\';\n export { cn } from \'./lib/cn\';',
      },
      {
        type: 'code',
        language: 'yaml',
        code: 'name: smoke-monkey\ntheme: yellow\nfeatures:\n  - markdown\n  - tools',
      },
      {
        type: 'code',
        language: 'css',
        code: '.sm-tool-run {\n  display: flex;\n  align-items: stretch;\n}',
      },
      {
        type: 'code',
        language: 'text',
        code: 'no language tagged fence',
      },
      {
        type: 'code',
        language: 'ts',
        code: '// Deliberately long line to prove the block scrolls instead of overflowing the message column:\nconst VERY_LONG_IDENTIFIER = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";',
      },
    ],
    createdAt: '2026-01-05T09:12:00.000Z',
  },

  // ── 3) Tool-run chaining: repeated calls joined by a rail ──
  //   Consecutive calls of the same family collapse into one rail run with a
  //   phase header and a count. Prose breaks the run, a family change starts a
  //   new one, and a lone call stays a plain borderless card.
  {
    id: 'seed-chains',
    conversationId: DEMO_CONVERSATION_ID,
    role: 'assistant',
    status: 'complete',
    content: 'Sweeping the repo before I touch anything.',
    model: 'oc/big-pickle',
    parts: [
      {
        type: 'markdown',
        content:
          'Sweeping the repo before I touch anything. Repeated calls chain automatically:',
      },
      // ── run 1: four inspect calls, mixed names, same family ──
      {
        type: 'tool',
        toolCall: {
          id: 'ch-1',
          name: 'read_file',
          status: 'success',
          input: { path: 'src/components/chat/MessageBubble.tsx' },
          output: { lines: 468 },
          durationMs: 34,
        },
      },
      {
        type: 'tool',
        toolCall: {
          id: 'ch-2',
          name: 'grep',
          status: 'success',
          input: { pattern: 'ToolCallCard' },
          output: { matches: 12 },
          durationMs: 61,
        },
      },
      {
        type: 'tool',
        toolCall: {
          id: 'ch-3',
          name: 'list_dir',
          status: 'success',
          input: { path: 'src/lib' },
          output: { files: 9 },
          durationMs: 12,
        },
      },
      {
        type: 'tool',
        toolCall: {
          id: 'ch-4',
          name: 'read_file',
          status: 'success',
          input: { path: 'src/lib/toolRuns.ts' },
          output: { lines: 121 },
          durationMs: 28,
        },
      },
      // ── barrier: prose ends the run, so the next call starts a new one ──
      { type: 'markdown', content: 'Found the seam. Applying the fix in three patches:' },
      // ── run 2: three edits ──
      {
        type: 'tool',
        toolCall: {
          id: 'ch-5',
          name: 'apply_patch',
          status: 'success',
          input: { file: 'MessageBubble.tsx' },
          durationMs: 88,
        },
      },
      {
        type: 'tool',
        toolCall: {
          id: 'ch-6',
          name: 'edit_file',
          status: 'success',
          input: { file: 'toolRuns.ts' },
          durationMs: 40,
        },
      },
      {
        type: 'tool',
        toolCall: {
          id: 'ch-7',
          name: 'write_file',
          status: 'success',
          input: { file: '_tool-run.scss' },
          durationMs: 22,
        },
      },
      // ── run 3: a failing call inside the run tints its node red ──
      {
        type: 'tool',
        toolCall: {
          id: 'ch-8',
          name: 'git_commit',
          status: 'success',
          input: { message: 'feat: chain repeated tool calls' },
          durationMs: 143,
        },
      },
      {
        type: 'tool',
        toolCall: {
          id: 'ch-9',
          name: 'git_push',
          status: 'error',
          input: { remote: 'origin' },
          output: 'rejected: protected branch',
          durationMs: 2100,
        },
      },
      {
        type: 'tool',
        toolCall: {
          id: 'ch-10',
          name: 'git_status',
          status: 'success',
          input: {},
          durationMs: 57,
        },
      },
      {
        type: 'markdown',
        content:
          'Push was rejected on the protected branch — everything else landed. The single call below stays a plain card, with no rail:',
      },
      // ── singleton: one call, no header, no rail ──
      {
        type: 'tool',
        toolCall: {
          id: 'ch-11',
          name: 'run_tests',
          status: 'running',
          input: { file: 'MessageBubble.spec.tsx' },
        },
      },
    ],
    createdAt: '2026-01-05T09:14:00.000Z',
  },

  // ── 4) Every widget: parts, tool states, artifacts, citations ──
  {
    id: 'seed-ai-3',
    conversationId: DEMO_CONVERSATION_ID,
    role: 'assistant',
    status: 'complete',
    content: 'Every widget part and status in one message.',
    model: 'oc/big-pickle',
    parts: [
      { type: 'thinking', content: 'The user wants full coverage, so I will include a thinking part, all five tool states, and every artifact kind.' },
      { type: 'markdown', content: 'All widget parts and statuses:' },
      { type: 'text', content: 'A plain `text` part, rendered as prose.' },
      { type: 'code', language: 'ts', code: 'const parts: MessagePart[] = [];' },
      { type: 'tool', toolCall: { id: 'w-pending', name: 'queue_job', status: 'pending', input: { queue: 'ci' } } },
      { type: 'tool', toolCall: { id: 'w-running', name: 'run_tests', status: 'running', input: { file: 'auth.spec.ts' } } },
      { type: 'tool', toolCall: { id: 'w-success', name: 'apply_patch', status: 'success', input: { file: 'index.ts' }, output: { added: 12 }, durationMs: 64 } },
      { type: 'tool', toolCall: { id: 'w-error', name: 'deploy', status: 'error', input: { env: 'prod' }, output: 'timeout after 30s', durationMs: 30000,
          error: { code: 'provider_timeout', layer: 'provider', severity: 'error',
                   message: 'The deploy provider timed out after 30s.', retryable: true,
                   hint: 'Usually a provider hiccup — retry the deploy.' } } },
      { type: 'tool', toolCall: { id: 'w-denied', name: 'read_file', status: 'error', input: { path: '/etc/hosts' }, durationMs: 12,
          error: { code: 'permission_denied', layer: 'permission', severity: 'warning',
                   message: 'Permission denied for `read_file` — sensitive file', retryable: true,
                   hint: 'Grant access, or ask for a different path.' } } },
      { type: 'notice', error: { code: 'provider_rate_limited', layer: 'provider', severity: 'warning',
                   message: 'Model `oc/big-pickle` is rate-limited (429); retrying in a moment.', retryable: true,
                   hint: 'The run continues automatically — usually clears within a minute.',
                   details: { status: 429, attempt: 2 } } },
      { type: 'tool', toolCall: { id: 'w-cancelled', name: 'search_repo', status: 'cancelled', input: { query: 'todo' } } },
      {
        type: 'artifact',
        artifact: {
          type: 'chart',
          chartType: 'line',
          title: 'Bundle size over time',
          data: [
            { label: 'v1', value: 210 },
            { label: 'v2', value: 186 },
            { label: 'v3', value: 154 },
            { label: 'v4', value: 121 },
          ],
          config: { xKey: 'label', yKeys: ['value'], showGrid: true },
        },
      },
      {
        type: 'artifact',
        artifact: {
          type: 'table',
          title: 'Coverage by package',
          columns: [
            { key: 'pkg', label: 'Package' },
            { key: 'lines', label: 'Lines', align: 'right' },
            { key: 'pct', label: 'Covered %', align: 'right' },
          ],
          rows: [
            { pkg: 'ui', lines: 4820, pct: 92 },
            { pkg: 'runtime', lines: 1140, pct: 88 },
            { pkg: 'transports', lines: 620, pct: 74 },
          ],
        },
      },
      {
        type: 'artifact',
        artifact: {
          type: 'text',
          title: 'Release notes',
          content: 'Tool calls now chain into a single rail run.',
        },
      },
      {
        type: 'artifact',
        artifact: {
          type: 'file',
          id: 'a-file',
          name: 'test-report.html',
          mimeType: 'text/html',
          size: 24576,
        },
      },
      {
        type: 'image',
        dataUri:
          'data:image/svg+xml;utf8,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect width="320" height="120" rx="10" fill="#7c3aed"/><text x="160" y="66" font-family="monospace" font-size="15" fill="#fff" text-anchor="middle">inline image</text></svg>',
          ),
        alt: 'Inline data-URI image',
      },
      {
        type: 'citation',
        source: { id: 'src-a', title: 'Tool chaining design', url: 'https://docs.example.com/chains', domain: 'docs.example.com', type: 'document', score: 0.95 },
      },
      {
        type: 'citation',
        source: { id: 'src-b', title: 'WCAG 2.2 contrast', url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html', domain: 'w3.org', type: 'web', score: 0.88 },
      },
      {
        type: 'citation',
        source: { id: 'src-c', title: 'Agent transcript', url: 'https://github.com/example/agent', domain: 'github.com', type: 'web', score: 0.81 },
      },
    ],
    sources: [
      { id: 'src-a', title: 'Tool chaining design', url: 'https://docs.example.com/chains', domain: 'docs.example.com', type: 'document', score: 0.95 },
      { id: 'src-b', title: 'WCAG 2.2 contrast', url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html', domain: 'w3.org', type: 'web', score: 0.88 },
    ],
    createdAt: '2026-01-05T09:16:00.000Z',
  },

  // ── 5) Error state with a retry affordance ──
  {
    id: 'seed-ai-4',
    conversationId: DEMO_CONVERSATION_ID,
    role: 'assistant',
    status: 'error',
    content: 'I tried to read a file that is not in the workspace.',
    model: 'oc/big-pickle',
    parts: [{ type: 'markdown', content: 'I tried to read a file that is not in the workspace.' }],
    error: {
      code: 'file_not_found',
      layer: 'tool',
      severity: 'error',
      message: '`read_file` failed: ENOENT: no such file or directory, open "src/does-not-exist.ts"',
      retryable: true,
      hint: 'Check the path — the file may have been moved or never created.',
    },
    createdAt: '2026-01-05T09:15:00.000Z',
  },

  // ── 6) Streaming: a run in progress with a still-running tool ──
  {
    id: 'seed-ai-5',
    conversationId: DEMO_CONVERSATION_ID,
    role: 'assistant',
    status: 'streaming',
    content: 'Kicking off the suite',
    model: 'oc/big-pickle',
    parts: [
      { type: 'thinking', content: 'Run the fast unit suite first, then the e2e subset.' },
      { type: 'markdown', content: 'Running the unit suite now' },
      { type: 'tool', toolCall: { id: 'st-1', name: 'run_tests', status: 'running', input: { suite: 'unit' } } },
    ],
    createdAt: '2026-01-05T09:18:00.000Z',
  },
];

const store = new MemoryStore();
void store.createConversation({
  id: DEMO_CONVERSATION_ID,
  title: 'Repo health & failing tests',
  messages: SEED_MESSAGES,
});

/**
 * A tiny custom "tool call" card — just to show how `slots` work.
 * Swap out any built-in piece (message, codeBlock, toolCall, chart, table,
 * sources, composer, header) for your own component whenever you want.
 */
function TinyToolCard({ call }: { call: ToolCall }) {
  // Same shape as the built-in card — borderless row, per-family icon, status
  // tint — to show that a slot drops straight into the run rail.
  const tint =
    call.status === 'error'
      ? 'hsl(var(--destructive))'
      : call.status === 'running'
        ? 'hsl(var(--accent))'
        : 'hsl(var(--ink-muted))';
  const status =
    call.status === 'success'
      ? 'Done'
      : call.status === 'error'
        ? 'Failed'
        : call.status === 'running'
          ? 'Running'
          : call.status === 'cancelled'
            ? 'Cancelled'
            : 'Queued';
  // A custom `toolCall` slot receives the *resolved* presentation, so a slot
  // that ignores `call.presentation` silently drops a custom tool's icon. Use
  // the same helpers the built-in card uses.
  const label = toolLabel(call.name, call.presentation);
  return (
    <div style={{ minWidth: 0 }}>
    <div
      title={`${label} — ${status}`}
      aria-label={`${label} — ${status}`}
      style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 6px', borderRadius: 6, minWidth: 0 }}
    >
      <ToolIcon
        name={call.name}
        icon={call.presentation?.icon}
        family={call.presentation?.family}
        tone={call.status === 'success' ? call.presentation?.tone : undefined}
        style={{ color: tint }}
      />
      <code
        style={{
          color: 'hsl(var(--ink-primary))',
          fontSize: 11.5,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </code>
      <span
        style={{
          color: 'hsl(var(--ink-secondary))',
          fontSize: 10,
          marginLeft: 'auto',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {call.durationMs != null ? `${call.durationMs}ms` : ''}
      </span>
    </div>
      {/* When the producer sent a structured error, show it in the product's
          own language instead of leaving the row as a bare "Failed". */}
      {call.error ? <ErrorCard error={call.error} dense className="ml-6 mb-1" /> : null}
    </div>
  );
}


/**
 * One demo per error level. `notices` are non-terminal (the run recovers and
 * still answers); `failingTool` is scoped to a single call; `failWith` ends the
 * run.
 */
type ErrorCase = 'none' | 'rate-limit' | 'tool-permission' | 'run-guard' | 'auth-fatal' | 'cancelled' | 'connection';

/**
 * Non-error stream shapes worth seeing in the transcript.
 *
 * Kept separate from `ErrorCase` because a run that pauses to ask a question is
 * working correctly — filing it under "errors" would teach the wrong lesson
 * about what the card means.
 */
type StreamCase = 'default' | 'custom-tool' | 'interactive';

const STREAM_CASES: Array<{ id: StreamCase; label: string }> = [
  { id: 'default', label: 'Default' },
  { id: 'custom-tool', label: 'Custom tool (emoji)' },
  { id: 'interactive', label: 'Paused: ask + permission' },
];

const ERROR_CASES: Array<{ id: ErrorCase; label: string }> = [
  { id: 'none', label: 'No errors' },
  { id: 'rate-limit', label: 'Model rate limit (recovered)' },
  { id: 'tool-permission', label: 'Tool permission denied' },
  { id: 'run-guard', label: 'Run guard stopped it' },
  { id: 'auth-fatal', label: 'Bad API key (fatal)' },
  { id: 'cancelled', label: 'Cancelled by user' },
  { id: 'connection', label: 'Connection lost' },
];

/**
 * A custom tool declared entirely in Node and rendered entirely by the emoji it
 * brings with it. The `legacy_migrate` entry is deliberately given a *wrong*
 * family (`run`) to show the declared icon winning over inference — without one,
 * the name alone would have been classified as a shell command.
 */
const DEMO_TOOL_PRESENTATIONS: ToolPresentationMap = {
  legacy_migrate: { icon: '🗄️', label: 'Legacy migrate', family: 'run', tone: 'warning' },
  charge_card: { icon: '💳', label: 'Charge card', family: 'run', tone: 'primary' },
  // Declared for the host registry only: the synthetic stream does not emit
  // this tool, which is exactly the case `toolPresentations` exists for.
  export_report: { icon: '📊', label: 'Export report', family: 'verify' },
};

function syntheticFor(errorCase: ErrorCase, streamCase: StreamCase): SyntheticTransport {
  if (streamCase === 'custom-tool') {
    return new SyntheticTransport({
      includeToolCall: false,
      customTools: [
        {
          toolCallId: 't_custom',
          toolName: 'legacy_migrate',
          presentation: { icon: '🗄️', label: 'Legacy migrate', family: 'run', tone: 'warning' },
          input: { table: 'orders_2019' },
          result: { migrated: 4820, skipped: 3 },
        },
      ],
    });
  }
  if (streamCase === 'interactive') {
    return new SyntheticTransport({
      includeToolCall: false,
      // Two prompts in one run, asked in sequence. The second is not emitted
      // until the first is answered, because a real run cannot know the answer
      // to one before it has asked it.
      askUser: {
        toolCallId: 'ask_1',
        question: 'Which environment should this deploy to?',
        options: [
          { value: 'staging', label: 'staging', description: 'Safe: shares the prod schema' },
          { value: 'production', label: 'production' },
        ],
      },
      requestPermission: {
        toolCallId: 'perm_1',
        toolName: 'write_file',
        input: { path: 'src/index.ts' },
      },
    });
  }
  switch (errorCase) {
    case 'rate-limit':
      return new SyntheticTransport({
        notices: [
          {
            code: 'provider_rate_limited',
            layer: 'provider',
            severity: 'warning',
            message: 'Model `gpt-x` is rate-limited (429); retrying in a moment.',
            retryable: true,
            hint: 'The run continues automatically — usually clears within a minute.',
            details: { status: 429 },
          },
        ],
      });
    case 'tool-permission':
      return new SyntheticTransport({
        failingTool: {
          toolCallId: 't_denied',
          toolName: 'read_file',
          error: {
            code: 'permission_denied',
            layer: 'permission',
            severity: 'warning',
            message: 'Permission denied for `read_file` — sensitive file',
            retryable: true,
            hint: 'Grant access, or ask for a different path.',
          },
        },
      });
    case 'run-guard':
      return new SyntheticTransport({
        notices: [
          {
            code: 'tool_mutation_limit',
            layer: 'tool',
            severity: 'warning',
            message: 'Mutation limit reached for `write_file`.',
            retryable: false,
            hint: 'The run is capped so it cannot change too many files.',
          },
          {
            code: 'run_repeated_error',
            layer: 'run',
            severity: 'fatal',
            message: 'Repeated error detected: the same failure kept recurring.',
            retryable: false,
            hint: 'The run stopped to avoid burning tokens.',
          },
        ],
      });
    case 'auth-fatal':
      return new SyntheticTransport({
        failWith: {
          code: 'provider_auth',
          layer: 'provider',
          severity: 'fatal',
          message: 'Model `gpt-x` refused the request (403 — free-tier/permission).',
          retryable: false,
          hint: 'Check the provider API key and its access tier.',
        },
      });
    case 'cancelled':
      return new SyntheticTransport({
        notices: [
          {
            code: 'tool_cancelled',
            layer: 'tool',
            severity: 'info',
            message: '`bash` was cancelled before it finished.',
            retryable: true,
          },
        ],
      });
    case 'connection':
      return new SyntheticTransport({
        notices: [
          {
            code: 'transport_disconnected',
            layer: 'transport',
            severity: 'warning',
            message: 'Lost the event connection — socket closed.',
            retryable: true,
            hint: 'Messages already received are safe. Reconnect to continue the run.',
          },
        ],
      });
    default:
      return new SyntheticTransport();
  }
}

export function App() {
  // 1) A pretend backend. Swap for the real thing later:
  //    const transport = new FetchTransport({ url: 'https://…', parser: StreamParser });
  //    const transport = new WebSocketTransport({ url: 'wss://…' });
  //
  // `errorCase` exercises every error level: each layer (model / tool / run /
  // connection) and each severity (info → fatal), so the surface can be checked
  // without breaking a real provider.
  const [errorCase, setErrorCase] = useState<ErrorCase>('none');
  const [streamCase, setStreamCase] = useState<StreamCase>('default');
  const transport = useMemo(() => syntheticFor(errorCase, streamCase), [errorCase, streamCase]);

  // A theme is one prop — no CSS to write, no markup to change.
  const [theme, setTheme] = useState<SmokeMonkeyChatTheme | 'custom'>('yellow');
  const [custom, setCustom] = useState(CUSTOM_THEME_SEED);
  const [customScheme, setCustomScheme] = useState<'auto' | 'dark' | 'light'>('auto');

  // Only the keys the user actually touched are passed, so anything else
  // still falls back to the `theme` underneath.
  const customTheme = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(custom).map(([k, v]) => [k, hexToHsl(v)]),
      ) as SmokeMonkeyChatCustomTheme,
    [custom]
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 2) A small instruction bar — this lives OUTSIDE the chat widget. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: '10px 16px',
          borderBottom: '1px solid #27272a',
          background: '#0f0f11',
          color: '#a1a1aa',
          fontSize: 12,
        }}
      >
        <b style={{ color: '#e4e4e7' }}>🔥 Smoke Monkey Chat demo</b>
        <span>Enter to send</span>
        <span>Shift+Enter for a new line</span>
        <span>Esc to stop</span>
        <span>⌘/Ctrl + K to focus the box</span>
        <span style={{ marginLeft: 'auto', color: '#71717a' }}>
          Try: <i>“Write a Python script to fetch stock prices”</i>
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          theme
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as SmokeMonkeyChatTheme | 'custom')}
            style={{
              background: '#18181b',
              color: '#e4e4e7',
              border: '1px solid #27272a',
              borderRadius: 6,
              padding: '2px 6px',
              fontSize: 12,
            }}
          >
            {THEME_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.themes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label="Yours">
              <option value="custom">custom…</option>
            </optgroup>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          error case
          <select
            value={errorCase}
            onChange={(e) => setErrorCase(e.target.value as ErrorCase)}
            style={{
              background: '#18181b',
              color: '#e4e4e7',
              border: '1px solid #27272a',
              borderRadius: 6,
              padding: '2px 6px',
              fontSize: 12,
            }}
          >
            {ERROR_CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          stream case
          <select
            value={streamCase}
            onChange={(e) => setStreamCase(e.target.value as StreamCase)}
            style={{
              background: '#18181b',
              color: '#e4e4e7',
              border: '1px solid #27272a',
              borderRadius: 6,
              padding: '2px 6px',
              fontSize: 12,
            }}
          >
            {STREAM_CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {theme === 'custom' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {(Object.keys(CUSTOM_THEME_SEED) as CustomThemeKey[]).map((k) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="color"
                  value={custom[k]}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCustom((c) => ({
                      ...c,
                      [k]: next,
                      // Keep the bubble readable when the brand color changes.
                      ...(k === 'primary' ? { primaryForeground: readableOn(next) } : null),
                    }));
                  }}
                  style={{ width: 22, height: 18, padding: 0, border: '1px solid #3f3f46', borderRadius: 4, background: 'none' }}
                />
                <span style={{ color: '#71717a' }}>{k}</span>
                {(TEXT_KEYS as readonly string[]).includes(k) &&
                  (() => {
                    const r = contrastRatio(custom[k], custom.bg);
                    return (
                      <span
                        title={`${r.toFixed(1)}:1 against the background`}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: r >= 4.5 ? '#4ade80' : r >= 3 ? '#fbbf24' : '#f87171',
                        }}
                      />
                    );
                  })()}
              </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#71717a' }}>scheme</span>
              <select
                value={customScheme}
                onChange={(e) => setCustomScheme(e.target.value as 'auto' | 'dark' | 'light')}
                style={{
                  background: '#18181b',
                  color: '#e4e4e7',
                  border: '1px solid #27272a',
                  borderRadius: 6,
                  padding: '1px 4px',
                  fontSize: 11,
                }}
              >
                <option value="auto">auto (from bg)</option>
                <option value="dark">dark</option>
                <option value="light">light</option>
              </select>
            </label>
            <code style={{ color: '#a1a1aa' }}>
              customTheme={'{'}
              {[
                ...(customScheme === 'auto' ? [] : [`scheme: '${customScheme}'`]),
                ...Object.entries(customTheme).map(([k, v]) => `${k}: '${v}'`),
              ].join(', ')}
              {'}'}
            </code>
          </span>
        )}
      </div>

      {/* 3) The chat widget. Everything below is optional — the more you
            declare, the richer the experience (see the README for each prop). */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <SmokeMonkeyChat
          // ── Data ────────────────────────────────────────────────────
          models={DEMO_MODELS}
          workspaces={DEMO_WORKSPACES}
          mcpServers={DEMO_MCP_SERVERS}
          apiKeys={DEMO_API_KEYS}
          suggestions={DEMO_SUGGESTIONS}

          // ── Runtime ─────────────────────────────────────────────────
          transport={transport}
          toolPresentations={DEMO_TOOL_PRESENTATIONS}
          store={store}
          conversationId={DEMO_CONVERSATION_ID}

          // ── Brand ───────────────────────────────────────────────────
          //  Put your own logo + product name in the header. Omit `brand`
          //  entirely to fall back to the default 🔥 Smoke Monkey.
          sessionTitle="Fix the failing auth tests, then chart the suite runtime by file"

          brand={{
            icon: (
              <span
                style={{
                  display: 'inline-flex',
                  height: 20,
                  width: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                  background: '#7c3aed',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                🐒
              </span>
            ),
            name: 'Smoke Monkey',
          }}

          // ── Layout ──────────────────────────────────────────────────
          layout="cozy"
          position={{ composer: 'bottom', header: 'top' }}

          // ── Features ────────────────────────────────────────────────
          features={{
            header: true,
            sessionHeader: false,
            suggestions: true,
            attachments: true,
            apiKeys: true,
            mcp: true,
            tokenUsage: true,
            modelSelector: true,
            workspaceSelector: true,
            citations: true,
            tools: true,
            artifacts: true,
            charts: true,
            tables: true,
            codeBlocks: true,
            markdown: true,
          }}

          // ── Theme ───────────────────────────────────────────────────
          // 'dark' | 'yellow' | 'light' — try the select in the bar above.
          theme={theme === 'custom' ? 'dark' : theme}
          customTheme={theme === 'custom' ? customTheme : undefined}

          className="my-chat"

          classNames={{
            root: 'demo-chat-root',
            header: 'demo-chat-header',
            messages: 'demo-chat-messages',
            composer: 'demo-chat-composer',
          }}

          style={
            {
              '--sm-composer-width': '48rem',
              // Optional one-line recolor on top of the active theme.
              // HSL triple, not hex: '--sm-primary': '45 96% 58%',
            } as const
          }

          // ── Components (slots) ──────────────────────────────────────
          slots={{
            toolCall: TinyToolCard,
          }}

          // ── Behavior (log events in the console) ────────────────────
          onRetry={(text) => console.log('retry →', text)}

          onModelChange={(id) => console.log('model →', id)}
          onWorkspaceChange={(id) => console.log('workspace →', id)}
          onMCPChange={(id, enabled) => console.log('mcp', id, enabled ? 'on' : 'off')}

          // ── Keyboard ────────────────────────────────────────────────
          shortcuts={{ send: 'Enter', stop: 'Escape', focusComposer: 'Meta+K' }}
          
        />
      </div>
    </div>
  );
}