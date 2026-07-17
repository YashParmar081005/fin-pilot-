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
    setupFiles: ['tests/setup.ts'],
    // worker threads, not forked processes — child-process spawn is flaky on this FAT32 drive
    pool: 'threads',
    testTimeout: 30_000,
    hookTimeout: 120_000, // first mongodb-memory-server run downloads a mongod binary
  },
});
