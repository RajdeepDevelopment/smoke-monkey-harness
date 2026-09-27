import type { MessagePart } from '../types/message';
import type { ToolCall } from '../types/tool';
import type { ToolPresentation, ToolPresentationMap } from '../types/tools';

/**
 * Tool-call chaining.
 *
 * When a model calls the same *kind* of tool two or more times in a row
 * (`read_file`, `read_file`, `read_file`) the cards are joined by a vertical
 * rail and a single phase header with a count, instead of three loose cards
 * repeating the same status icon. Ported from the desktop agent transcript.
 *
 * Calls are grouped by semantic *family*, not by exact name, so a burst of
 * mixed reads (`read_file` → `grep` → `list_dir`) still reads as one
 * "Inspecting" run. Anything else between two calls — prose, code, an
 * artifact, a different family — breaks the run.
 */

export type ToolFamily = 'inspect' | 'edit' | 'run' | 'verify' | 'git' | 'plan' | 'ask';

export const TOOL_FAMILY_LABELS: Record<ToolFamily, string> = {
  inspect: 'Inspecting',
  edit: 'Editing',
  run: 'Running',
  verify: 'Verifying',
  git: 'Git',
  plan: 'Planning',
  ask: 'Asking',
};

/** Well-known tool names, so the common cases need no guessing. */
const BUILTIN: Record<string, ToolFamily> = {
  // inspect
  read: 'inspect', read_file: 'inspect', readfile: 'inspect', view: 'inspect', view_file: 'inspect',
  cat: 'inspect', open: 'inspect', open_file: 'inspect', list: 'inspect', list_dir: 'inspect',
  list_directory: 'inspect', list_files: 'inspect', ls: 'inspect', glob: 'inspect', tree: 'inspect',
  grep: 'inspect', search: 'inspect', search_code: 'inspect', find: 'inspect', find_symbol: 'inspect',
  fetch: 'inspect', fetch_file: 'inspect', download: 'inspect', stat: 'inspect', stats: 'inspect',
  inspect: 'inspect', notebook_read: 'inspect',
  // edit
  edit: 'edit', edit_file: 'edit', line_edit: 'edit', replace: 'edit', replace_lines: 'edit',
  apply_patch: 'edit', patch: 'edit', write: 'edit', write_file: 'edit', create_file: 'edit',
  delete: 'edit', delete_file: 'edit', remove_file: 'edit', move: 'edit', rename: 'edit',
  format: 'edit', refactor: 'edit', save: 'edit',
  // run
  run: 'run', run_command: 'run', exec: 'run', execute: 'run', shell: 'run', bash: 'run',
  command: 'run', cmd: 'run', spawn: 'run', start: 'run', stop: 'run', restart: 'run',
  install: 'run', build: 'run', deploy: 'run', docker_exec: 'run', ssh_run: 'run',
  // verify
  test: 'verify', run_test: 'verify', run_tests: 'verify', test_file: 'verify', pytest: 'verify',
  jest: 'verify', vitest: 'verify', lint: 'verify', typecheck: 'verify', verify: 'verify',
  check: 'verify', validate: 'verify', e2e: 'verify', benchmark: 'verify',
  // git
  git: 'git', git_status: 'git', git_diff: 'git', git_log: 'git', git_commit: 'git',
  git_push: 'git', git_pull: 'git', git_branch: 'git', checkout: 'git', merge: 'git',
  rebase: 'git', stash: 'git',
  // plan
  todo: 'plan', todo_write: 'plan', todos: 'plan', plan: 'plan', plan_write: 'plan',
  update_plan: 'plan', context: 'plan', context_manage: 'plan', memory: 'plan',
  // ask
  ask: 'ask', ask_user: 'ask', question: 'ask', prompt_user: 'ask', confirm: 'ask',
};

/** Keyword rules for arbitrary tool names, matched against name tokens. */
const RULES: Array<{ tokens: string[]; family: ToolFamily }> = [
  { tokens: ['read', 'view', 'open', 'get', 'list', 'ls', 'cat', 'peek', 'preview', 'describe', 'inspect', 'show', 'fetch', 'retrieve', 'search', 'find', 'grep', 'query', 'lookup', 'glob', 'tree', 'info', 'stat', 'history', 'content'], family: 'inspect' },
  { tokens: ['write', 'edit', 'patch', 'apply', 'replace', 'insert', 'create', 'add', 'save', 'store', 'update', 'upsert', 'append', 'delete', 'remove', 'drop', 'rename', 'move', 'copy', 'format', 'refactor'], family: 'edit' },
  { tokens: ['test', 'pytest', 'jest', 'vitest', 'lint', 'typecheck', 'check', 'verify', 'validate', 'e2e', 'spec', 'coverage'], family: 'verify' },
  { tokens: ['git', 'commit', 'branch', 'diff', 'rebase', 'stash', 'checkout', 'merge', 'tag'], family: 'git' },
  { tokens: ['todo', 'plan', 'task', 'context', 'memory', 'note'], family: 'plan' },
  { tokens: ['ask', 'question', 'prompt', 'confirm', 'approve'], family: 'ask' },
  { tokens: ['run', 'exec', 'execute', 'command', 'shell', 'bash', 'spawn', 'start', 'stop', 'install', 'build', 'deploy', 'launch', 'invoke', 'call', 'benchmark'], family: 'run' },
];

/** Splits `readFile`, `read_file`, `read-file` into lowercase tokens. */
function tokenize(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Best-effort family for any tool name, including MCP tools sent as
 * `server__tool`. Unknown names fall back to `run`, so an unrecognized tool
 * still chains with other command-like calls.
 */
export function toolFamily(name: string): ToolFamily {
  const raw = name ?? '';
  const direct = BUILTIN[raw.toLowerCase()];
  if (direct) return direct;
  // MCP tools arrive as "github__create_issue" — classify the tool half.
  const sep = raw.indexOf('__');
  const bare = sep > 0 ? raw.slice(sep + 2) : raw;
  const tokens = tokenize(bare);
  if (tokens.length === 0) return 'run';
  for (const rule of RULES) {
    if (tokens.some((t) => rule.tokens.includes(t))) return rule.family;
  }
  return 'run';
}

/**
 * Merge a host-supplied presentation with the one that arrived on the event.
 *
 * Precedence is per *field*, not per object: per-call > host > inferred. A tool
 * that declares only an icon on the event should still pick up a host-provided
 * label, and a host that knows a tool's tone should not have to repeat the
 * family the event already states.
 *
 * Returns the original call when there is nothing to merge, so referential
 * equality — and therefore re-render behavior — is unchanged for the common
 * case of a live call that already carries its own presentation.
 */
export function resolvePresentation(
  name: string,
  perCall: ToolPresentation | undefined,
  host: ToolPresentationMap | undefined,
): ToolPresentation | undefined {
  const fallback = host?.[name];
  if (!fallback) return perCall;
  if (!perCall) return fallback;
  return { ...fallback, ...perCall };
}

/** `resolvePresentation` for a whole call, preserving identity when unchanged. */
export function withPresentation(
  call: ToolCall,
  host: ToolPresentationMap | undefined,
): ToolCall {
  if (!host) return call;
  const presentation = resolvePresentation(call.name, call.presentation, host);
  return presentation === call.presentation ? call : { ...call, presentation };
}

export function toolFamilyLabel(name: string): string {
  return TOOL_FAMILY_LABELS[toolFamily(name)];
}

/** Where a call sits inside its run; drives which rail segments are drawn. */
export type RunPosition = 'first' | 'mid' | 'last' | 'only';

export interface ToolRun {
  /** Tool-call ids in DOM order. */
  ids: string[];
  family: ToolFamily;
  label: string;
  total: number;
  positionById: Record<string, RunPosition>;
}

function isToolPart(part: MessagePart | undefined): part is Extract<MessagePart, { type: 'tool' }> {
  return !!part && part.type === 'tool';
}

/**
 * Assembles a run from already-collected calls, assigning each call a rail
 * position. `family` is inferred from the first call when omitted.
 */
export function buildToolRun(calls: ToolCall[], family?: ToolFamily): ToolRun {
  const resolved = family ?? toolFamily(calls[0]?.name ?? '');
  const total = calls.length;
  const positionById: Record<string, RunPosition> = {};
  calls.forEach((call, i) => {
    positionById[call.id] =
      total === 1 ? 'only' : i === 0 ? 'first' : i === total - 1 ? 'last' : 'mid';
  });
  return {
    ids: calls.map((c) => c.id),
    family: resolved,
    label: TOOL_FAMILY_LABELS[resolved],
    total,
    positionById,
  };
}

/**
 * Splits `parts` into maximal runs of consecutive tool parts that share a
 * family. A run of 1 is still returned (with position `only`) so callers can
 * decide whether to draw a rail for it — the widget only draws one for 2+.
 */
export function computeToolRuns(parts: MessagePart[]): ToolRun[] {
  const runs: ToolRun[] = [];
  let current: Extract<MessagePart, { type: 'tool' }>[] = [];
  let family: ToolFamily = 'run';

  const flush = () => {
    if (current.length === 0) return;
    runs.push(buildToolRun(current.map((p) => p.toolCall), family));
    current = [];
  };

  for (const part of parts) {
    if (isToolPart(part)) {
      const f = toolFamily(part.toolCall.name);
      // A family change ends the current run; everything else already broke it.
      if (current.length > 0 && f !== family) flush();
      family = f;
      current.push(part);
      continue;
    }
    // Prose, code, artifacts and citations are all barriers.
    flush();
  }
  flush();
  return runs;
}
