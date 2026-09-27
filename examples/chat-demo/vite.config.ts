// The demo consumes the library the same way any real app does: as a normal
// dependency installed from npm. There is no alias and no local build step —
// if it renders here, it renders for your users, because they get the exact
// same published artifact.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
});
