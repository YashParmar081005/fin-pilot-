import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // FAT32 drive: workspace packages resolve by path, not node_modules
      '@finpilot/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    // worker threads, not forked processes — child-process spawn is flaky on this FAT32 drive
    pool: 'threads',
  },
});
