/**
 * CheckpointService — "revert the agent's changes" for the harness.
 *
 * Before each run starts, the workspace is snapshotted into a SHADOW git
 * repository that lives under `<workspace>/.smoke/checkpoints/git`. The user's
 * own `.git` is never read, written, or modified. Reverting a run restores every
 * file the agent (or any command it ran) created, edited, or deleted since that
 * snapshot — including files changed through `run_command`, which a per-tool
 * backup could not see.
 *
 * Properties:
 *   • Opt-in (`AgentOptions.checkpoints`); nothing happens unless enabled.
 *   • Files ignored by the workspace's `.gitignore` (node_modules, .env, build
 *     output, …) and the harness's own ignore list are neither snapshotted nor
 *     touched on revert.
 *   • Needs the `git` binary. If it is missing the service disables itself and
 *     reports why; the agent keeps running normally.
 *   • Zero new dependencies (uses `node:child_process`).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { Logger } from '../logger.js';
import { IGNORE_DIRS } from '../ignores.js';

export interface CheckpointOptions {
  /** Where the shadow repo + index live. Default: `<workspace>/.smoke/checkpoints`. */
  dir?: string;
  /** Max checkpoints kept in the index (oldest are forgotten). Default 100. */
  maxCheckpoints?: number;
}

export interface Checkpoint {
  /** The run this checkpoint was taken BEFORE. Also the checkpoint id. */
  runId: string;
  sessionId: string;
  /** Shadow-git tree hash of the workspace at that moment. */
  tree: string;
  /** The user task the run was started with. */
  task: string;
  /** Number of session messages that existed before the run's user message. */
  messageCount: number;
  /** Session context snapshot at that moment (restored on revert). */
  sessionSnapshot?: unknown;
  createdAt: number;
}

export interface CheckpointDiff {
  /** Created since the checkpoint (a revert deletes them). */
  added: string[];
  /** Edited since the checkpoint (a revert restores them). */
  modified: string[];
  /** Deleted since the checkpoint (a revert recreates them). */
  deleted: string[];
}

const GIT_TIMEOUT_MS = 120_000;
const BATCH = 200;

export class CheckpointService {
  private readonly logger = new Logger('CheckpointService');
  private readonly root: string;
  private readonly gitDir: string;
  private readonly indexFile: string;
  private readonly max: number;
  private ready: Promise<boolean> | null = null;
  private checkpoints: Checkpoint[] | null = null;
  /** Why the service is unavailable (set when init fails). */
  unavailableReason: string | null = null;

  constructor(private readonly workspacePath: string, opts: CheckpointOptions = {}) {
    this.root = path.resolve(opts.dir ?? path.join(workspacePath, '.smoke', 'checkpoints'));
    this.gitDir = path.join(this.root, 'git');
    this.indexFile = path.join(this.root, 'index.json');
    this.max = Math.max(1, opts.maxCheckpoints ?? 100);
  }

  // ── git plumbing ─────────────────────────────────────────────────────────

  private git(args: string[], stdin?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        'git',
        ['-c', 'core.quotepath=off', '-c', 'core.fsmonitor=false', ...args],
        {
          cwd: this.workspacePath,
          env: {
            ...process.env,
            GIT_DIR: this.gitDir,
            GIT_WORK_TREE: path.resolve(this.workspacePath),
            GIT_TERMINAL_PROMPT: '0',
          },
          maxBuffer: 256 * 1024 * 1024,
          timeout: GIT_TIMEOUT_MS,
        },
        (err, stdout, stderr) => {
          if (err) reject(new Error(`git ${args[0]} failed: ${(stderr || err.message).toString().trim()}`));
          else resolve(stdout.toString());
        },
      );
      if (stdin !== undefined) child.stdin?.end(stdin);
    });
  }

  /** Lazily initialise the shadow repo. Resolves false when unavailable. */
  private ensureReady(): Promise<boolean> {
    if (!this.ready) {
      this.ready = (async () => {
        try {
          await this.git(['--version']);
          await fs.promises.mkdir(this.gitDir, { recursive: true });
          if (!fs.existsSync(path.join(this.gitDir, 'HEAD'))) {
            await this.git(['init', '--quiet']);
          }
          await this.git(['config', 'gc.auto', '0']);
          await this.git(['config', 'core.autocrlf', 'false']);
          await this.git(['config', 'core.safecrlf', 'false']);
          const excludeDir = path.join(this.gitDir, 'info');
          await fs.promises.mkdir(excludeDir, { recursive: true });
          const lines = [...new Set([...IGNORE_DIRS, '.smoke', '.git'])].map((d) => `${d}/`);
          await fs.promises.writeFile(path.join(excludeDir, 'exclude'), lines.join('\n') + '\n', 'utf8');
          return true;
        } catch (err) {
          this.unavailableReason = err instanceof Error ? err.message : String(err);
          this.logger.warn(`checkpoints disabled: ${this.unavailableReason}`);
          return false;
        }
      })();
    }
    return this.ready;
  }

  private async snapshotTree(): Promise<string> {
    await this.git(['add', '-A']);
    return (await this.git(['write-tree'])).trim();
  }

  // ── index persistence ────────────────────────────────────────────────────

  private async load(): Promise<Checkpoint[]> {
    if (this.checkpoints) return this.checkpoints;
    try {
      const raw = await fs.promises.readFile(this.indexFile, 'utf8');
      const parsed = JSON.parse(raw);
      this.checkpoints = Array.isArray(parsed) ? (parsed as Checkpoint[]) : [];
    } catch {
      this.checkpoints = [];
    }
    return this.checkpoints;
  }

  private async save(): Promise<void> {
    try {
      await fs.promises.mkdir(this.root, { recursive: true });
      await fs.promises.writeFile(this.indexFile, JSON.stringify(this.checkpoints ?? []), 'utf8');
    } catch (err) {
      this.logger.warn(`could not persist checkpoint index: ${err}`);
    }
  }

  // ── public API ───────────────────────────────────────────────────────────

  /** Snapshot the workspace BEFORE a run. Returns null when unavailable (never throws). */
  async create(info: Omit<Checkpoint, 'tree' | 'createdAt'>): Promise<Checkpoint | null> {
    if (!(await this.ensureReady())) return null;
    try {
      const list = await this.load();
      const cp: Checkpoint = { ...info, tree: await this.snapshotTree(), createdAt: Date.now() };
      const existing = list.findIndex((c) => c.runId === cp.runId);
      if (existing >= 0) list.splice(existing, 1);
      list.push(cp);
      while (list.length > this.max) list.shift();
      await this.save();
      return cp;
    } catch (err) {
      this.logger.warn(`checkpoint create failed: ${err}`);
      return null;
    }
  }

  async list(sessionId?: string): Promise<Checkpoint[]> {
    const list = await this.load();
    return sessionId ? list.filter((c) => c.sessionId === sessionId) : [...list];
  }

  async get(runId: string): Promise<Checkpoint | undefined> {
    return (await this.load()).find((c) => c.runId === runId);
  }

  /** What a revert to `cp` would change, without changing anything. */
  async diff(cp: Checkpoint): Promise<CheckpointDiff> {
    if (!(await this.ensureReady())) throw new Error(this.unavailableReason ?? 'checkpoints unavailable');
    const now = await this.snapshotTree();
    const out = await this.git(['diff-tree', '-r', '-z', '--name-status', '--no-renames', cp.tree, now]);
    const parts = out.split('\0').filter((p) => p.length > 0);
    const diff: CheckpointDiff = { added: [], modified: [], deleted: [] };
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const status = parts[i][0];
      const file = parts[i + 1];
      if (status === 'A') diff.added.push(file);
      else if (status === 'D') diff.deleted.push(file);
      else diff.modified.push(file);
    }
    return diff;
  }

  /**
   * Restore the workspace to the state captured in `cp`: delete files created
   * since, restore edited files, recreate deleted ones. Also forgets `cp` and
   * every later checkpoint (their history no longer exists).
   */
  async restore(cp: Checkpoint): Promise<CheckpointDiff> {
    const diff = await this.diff(cp);
    const base = path.resolve(this.workspacePath);

    for (const rel of diff.added) {
      const abs = path.resolve(base, rel);
      if (!abs.startsWith(base + path.sep)) continue; // never leave the workspace
      try {
        await fs.promises.rm(abs, { force: true });
        await this.pruneEmptyDirs(path.dirname(abs), base);
      } catch (err) {
        this.logger.warn(`revert: could not remove ${rel}: ${err}`);
      }
    }

    const toRestore = [...diff.modified, ...diff.deleted];
    for (let i = 0; i < toRestore.length; i += BATCH) {
      await this.git(['checkout', '-f', cp.tree, '--', ...toRestore.slice(i, i + BATCH)]);
    }
    await this.git(['read-tree', cp.tree]);

    const list = await this.load();
    const idx = list.findIndex((c) => c.runId === cp.runId);
    if (idx >= 0) list.splice(idx);
    await this.save();
    return diff;
  }

  /** Forget `cp` and every later checkpoint without touching files. */
  async forgetFrom(cp: Checkpoint): Promise<void> {
    const list = await this.load();
    const idx = list.findIndex((c) => c.runId === cp.runId);
    if (idx >= 0) list.splice(idx);
    await this.save();
  }

  private async pruneEmptyDirs(dir: string, stopAt: string): Promise<void> {
    let cur = dir;
    while (cur.startsWith(stopAt + path.sep)) {
      try {
        await fs.promises.rmdir(cur); // only succeeds when empty
      } catch {
        return;
      }
      cur = path.dirname(cur);
    }
  }
}
