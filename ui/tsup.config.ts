import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2020',
  external: [
    'react',
    'react-dom',
    'react-markdown',
    'remark-gfm',
    'rehype-highlight',
    'highlight.js',
    'recharts',
    'clsx',
    'tailwind-merge',
    'lucide-react',
    'mermaid',
    '@xyflow/react',
  ],
});