import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    // worker threads, not forked processes — child-process spawn is flaky on this FAT32 drive
    pool: 'threads',
  },
});
