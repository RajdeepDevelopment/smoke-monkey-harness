/**
 * Skills — Claude Code / Codex / AniGravity / opencode-compatible folder skills.
 *
 * A "skill" is a directory (or a single .md file) whose `SKILL.md` carries YAML
 * frontmatter — `name`, `description` — plus a markdown body with the actual
 * instructions, workflow steps, and do/don't rules. Supporting files (scripts/,
 * references/) travel with the skill folder.
 *
 * Skills are loaded JUST-IN-TIME: the run's system prompt only carries a
 * one-line catalog (id + description). The model calls `list_skills` to browse
 * and `use_skill` to pull the full body into the run context — the same
 * discover-on-demand pattern used by Claude Code, Codex, and opencode.
 *
 * Discovery follows the ecosystem convention:
 *   <dir>/<skill>/SKILL.md   and   <dir>/<skill>.md
 * with default dirs (when `skillsDir` is not configured):
 *   <workspace>/.opencode/skills, <workspace>/.claude/skills,
 *   <workspace>/.codex/skills, plus ~/.claude/skills, ~/.codex/skills,
 *   ~/.opencode/skills and ~/.config/opencode/skills (home-specific skills).
 */
import {
  readdirSync,
  readFileSync,
  statSync,
  type Dirent,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export interface Skill {
  /** Stable id (slugified folder/file name). Passed to use_skill. */
  id: string;
  /** Display name from frontmatter (falls back to id). */
  name: string;
  /** One-line "when/how to use" description (from frontmatter). */
  description: string;
  /** Full SKILL.md body — the instructions loaded by use_skill. */
  content: string;
  /** Absolute path to the SKILL.md file. */
  path: string;
  /** Absolute path of the skill folder (supporting files live here). */
  dir: string;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'skill'
  );
}

/** Parses the optional `---` YAML frontmatter off a markdown file. */
export function parseSkillFrontmatter(
  text: string,
): { frontmatter: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { frontmatter: {}, body: text.trim() };
  const frontmatter: Record<string, string> = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    let value = line
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');

    // Block scalars — `>` fold single newlines to spaces, `|` keeps them;
    // `-` chomps trailing newlines. Continues over indented lines.
    if (/^[|>][+-]?$/.test(value)) {
      const keepNewlines = value[0] === '|';
      const continuation: string[] = [];
      while (i + 1 < lines.length && /^[ \t]/.test(lines[i + 1])) {
        continuation.push(lines[++i]);
      }
      const chunk = continuation
        .map((l) => l.replace(/^[ \t]+/, ''))
        .join(keepNewlines ? '\n' : ' ')
        .replace(keepNewlines ? /(^|\n)[ \t]+(?=\S)/g : / +/g, keepNewlines ? '$1' : ' ');
      if (chunk.length > 0) value = chunk;
    }

    frontmatter[key] = value;
  }
  return { frontmatter, body: text.slice(m[0].length).trim() };
}

/** First non-empty paragraph of the body, trimmed for a description fallback. */
function describeFallback(body: string): string {
  const para = body.split(/\n\s*\n/).find((p) => p.trim().length > 0);
  const flat = (para ?? body)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > 200 ? `${flat.slice(0, 197)}…` : flat;
}

function makeSkill(skillFilePath: string, fallbackId: string): Skill {
  let text: string;
  try {
    text = readFileSync(skillFilePath, 'utf8');
  } catch {
    throw new Error(`Cannot read skill file: ${skillFilePath}`);
  }
  const { frontmatter, body } = parseSkillFrontmatter(text);
  const id = slugify(frontmatter.id || fallbackId);
  const name = (frontmatter.name || id).trim();
  const description = (frontmatter.description || describeFallback(body)).trim();
  return {
    id,
    name,
    description,
    content: body,
    path: skillFilePath,
    dir: dirname(skillFilePath),
  };
}

export interface LoadSkillsOptions {
  /** Emit a warning for each unreadable skill instead of throwing. */
  tolerateErrors?: boolean;
  warn?: (message: string) => void;
}

/**
 * Scans a directory for skills: `SKILL.md` inside each folder (id = folder
 * name) and bare `.md` files at the directory's top level (id = file name).
 * A folder holding SKILL.md is not recursed into — its extra markdown is
 * treated as supporting references, not additional skills.
 */
export function loadSkillsFromDir(dir: string, opts: LoadSkillsOptions = {}): Skill[] {
  const { tolerateErrors = true, warn } = opts;
  const out: Skill[] = [];

  const scan = (current: string, depth: number): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      if (tolerateErrors) return;
      throw new Error(`Skills directory not readable: ${current}`);
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    const dirs = entries.filter((e) => e.isDirectory());
    const files = entries.filter((e) => e.isFile());

    if (depth === 0) {
      for (const f of files) {
        if (!/\.md$/i.test(f.name) || f.name === 'SKILL.md') continue;
        const p = join(current, f.name);
        try {
          out.push(makeSkill(p, f.name.replace(/\.md$/i, '')));
        } catch (err) {
          warn?.(`skill ${f.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    for (const d of dirs) {
      const skillPath = join(current, d.name, 'SKILL.md');
      let isSkillDir = false;
      try {
        isSkillDir = statSync(skillPath).isFile();
      } catch {
        isSkillDir = false;
      }
      if (isSkillDir) {
        try {
          out.push(makeSkill(skillPath, d.name));
        } catch (err) {
          warn?.(`skill ${d.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        scan(join(current, d.name), depth + 1);
      }
    }
  };

  scan(dir, 0);
  return out;
}

/** Loads skills from several directories, de-duplicating by id (first wins). */
export function loadSkillsFromDirs(dirs: string[], opts: LoadSkillsOptions = {}): Skill[] {
  const byId = new Map<string, Skill>();
  for (const dir of dirs) {
    for (const skill of loadSkillsFromDir(dir, opts)) {
      if (!byId.has(skill.id)) byId.set(skill.id, skill);
    }
  }
  return Array.from(byId.values());
}

/**
 * Default discovery locations, mirroring the ecosystem conventions when the
 * caller did not pass an explicit `skillsDir`:
 *   <workspace>/.opencode/skills        (opencode)
 *   <workspace>/.claude/skills          (Claude Code)
 *   <workspace>/.codex/skills           (Codex)
 *   ~/.claude/skills, ~/.codex/skills, ~/.opencode/skills,
 *   ~/.config/opencode/skills           (home-specific)
 */
export function defaultSkillDirs(workspacePath?: string): string[] {
  const home = homedir();
  const dirs: string[] = [];
  if (workspacePath) {
    dirs.push(
      join(workspacePath, '.opencode', 'skills'),
      join(workspacePath, '.claude', 'skills'),
      join(workspacePath, '.codex', 'skills'),
    );
  }
  dirs.push(
    join(home, '.claude', 'skills'),
    join(home, '.codex', 'skills'),
    join(home, '.opencode', 'skills'),
    join(home, '.config', 'opencode', 'skills'),
  );
  return dirs;
}

/** In-memory registry of loaded skills (getAll / get / count, plus warn-on-dup). */
export class SkillRegistry {
  private readonly byId = new Map<string, Skill>();

  add(skill: Skill): { ok: boolean; error?: string } {
    if (!skill.id) return { ok: false, error: 'skill needs an id' };
    if (!skill.content) return { ok: false, error: `skill "${skill.id}" has no instructions (empty body)` };
    if (this.byId.has(skill.id)) return { ok: false, error: `duplicate skill id "${skill.id}"` };
    this.byId.set(skill.id, skill);
    return { ok: true };
  }

  get(id: string): Skill | undefined {
    return this.byId.get(id);
  }

  all(): Skill[] {
    return Array.from(this.byId.values());
  }

  get count(): number {
    return this.byId.size;
  }
}

export function isMcpSkill(id: string): boolean {
  return id.startsWith('mcp_');
}