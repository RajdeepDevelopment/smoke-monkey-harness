// Unlike examples/chat-demo (which installs the PUBLISHED package), this demo
// exercises the revert feature, so it points at the local ui build:
//   pnpm --dir ../../ui build     ← run once, and again after UI changes
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const ui = path.resolve(__dirname, '../../ui/dist');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@smoke-monkey/ui/ui.css', replacement: path.join(ui, 'index.css') },
      { find: /^@smoke-monkey\/ui$/, replacement: path.join(ui, 'index.js') },
    ],
    // One React for the app AND the library, or hooks break.
    dedupe: ['react', 'react-dom'],
  },
  server: { port: 5174, open: true },
});
