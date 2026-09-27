// The demo consumes the library exactly like a real app would: from its built
// `dist`. `pnpm dev` rebuilds the library first (predev script). Alias it by
// name so your code can write `import { SmokeMonkeyChat } from '@smoke-monkey/ui'`.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@smoke-monkey\/ui\/ui\.css$/,
        replacement: fileURLToPath(new URL('../../ui/dist/index.css', import.meta.url)),
      },
      {
        find: /^@smoke-monkey\/ui$/,
        replacement: fileURLToPath(new URL('../../ui/dist/index.js', import.meta.url)),
      },
    ],
  },
  server: {
    port: 5173,
    open: true,
  },
});