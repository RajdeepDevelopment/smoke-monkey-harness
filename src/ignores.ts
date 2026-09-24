/**
 * Directory filters for searches / file-tree walks, extracted from the source
 * app's workspace service. Keeps node_modules, .git, .smoke and other noise out
 * of tool output so the agent sees a clean project.
 */

export const IGNORE_DIRS = new Set([
  '.git',
  '.svn',
  '.hg',
  '.next',
  '.cache',
  '.turbo',
  '.vercel',
  'node_modules',
  'dist',
  'build',
  'out',
  '.venv',
  'venv',
  '__pycache__',
  'coverage',
  '.smoke',
]);

/** Directories excluded from glob/grep search output (the default `exclude`.
 *  NOTE: `node_modules` is intentionally excluded here so the agent can still
 *  grep/glob inside node_modules when it explicitly asks (search tools keep the
 *  `node_modules` exclusion OUT of their defaults). */
export const SEARCH_EXCLUDE_DIRS = [
  '.git',
  '.svn',
  '.hg',
  '.next',
  '.cache',
  '.turbo',
  '.vercel',
  'dist',
  'build',
  'out',
  '.venv',
  'venv',
  '__pycache__',
  'coverage',
  '.smoke',
];

export function isSmokePath(p?: string): boolean {
  const s = (p || '').replace(/\\/g, '/').replace(/^\.\//, '');
  return s === '.smoke' || s.startsWith('.smoke/') || s.includes('/.smoke/');
}