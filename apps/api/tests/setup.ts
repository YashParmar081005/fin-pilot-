/**
 * Vitest setup — runs before every spec file. Provides the env that
 * config/env.ts requires so tests never depend on a local .env.local.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-secret-'.padEnd(64, 'x');
process.env.ENCRYPTION_KEY ??= 'ab'.repeat(32); // 64 hex chars
process.env.LOG_LEVEL ??= 'silent';
