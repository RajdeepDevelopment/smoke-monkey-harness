import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cjsDir = join(root, 'dist', 'cjs');
mkdirSync(cjsDir, { recursive: true });
writeFileSync(join(cjsDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');