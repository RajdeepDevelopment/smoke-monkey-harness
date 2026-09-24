import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'src');
const files = [];

function walk(dir) {
  for (const ent of readdirSync(dir)) {
    const p = join(dir, ent);
    if (statSync(p).isDirectory()) walk(p);
    else if (ent.endsWith('.ts')) files.push(p);
  }
}
walk(root);

function needsExt(spec) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return false;
  const base = spec.split(/[?#]/)[0];
  if (/\.(j|t|c|m)sx?$/.test(base)) return false;
  return true;
}

let changed = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(/(from\s+)(['"])(\.{1,2}\/[^'"\n]+)(['"])/g, (m, pre, q, spec, q2) => {
    if (!needsExt(spec)) return m;
    changed++;
    return `${pre}${q}${spec}.js${q2}`;
  });
  if (out !== src) writeFileSync(file, out);
}
console.log(`rewrote specifiers in ${files.length} files (${changed} edits)`);