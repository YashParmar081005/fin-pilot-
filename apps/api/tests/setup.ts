/**
 * Vitest setup — runs before every spec file. Provides the env that
 * config/env.ts requires so tests never depend on a local .env.local.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-secret-'.padEnd(64, 'x');
process.env.ENCRYPTION_KEY ??= 'ab'.repeat(32); // 64 hex chars
process.env.LOG_LEVEL ??= 'silent';
// specs hammer auth/api from one IP — keep the limiters out of their way
// (limiter SEMANTICS are tested explicitly in ratelimit.spec.ts)
process.env.RL_L1_LIMIT ??= '1000000';
process.env.RL_AUTH_LIMIT ??= '1000000';
