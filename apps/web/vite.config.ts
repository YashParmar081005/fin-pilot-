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
    // 5173 is Vite's default and collides with other local projects — a stale
    // FinPilot tab then proxies /api to whatever else grabbed the port and the
    // HTML reply surfaces as "Internal Server Error". Own port, and strictPort
    // so a clash fails loudly instead of silently drifting.
    port: 5180,
    strictPort: true,
    proxy: {
      // dev-only: the SPA talks to the API through the Vite proxy; Nginx does this in prod (§5.1)
      '/healthz': 'http://localhost:4000',
      '/api': 'http://localhost:4000',
    },
  },
});
