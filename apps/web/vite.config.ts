import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // FAT32 drive: workspace packages resolve by path, not node_modules
      '@finpilot/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // dev-only: the SPA talks to the API through the Vite proxy; Nginx does this in prod (§5.1)
      '/healthz': 'http://localhost:4000',
      '/api': 'http://localhost:4000',
    },
  },
});
