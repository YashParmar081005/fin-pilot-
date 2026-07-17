import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env';

const VALID = {
  JWT_ACCESS_SECRET: 'a'.repeat(64),
};

describe('parseEnv (plan.md §7 — throw at boot)', () => {
  it('accepts a minimal valid environment and applies dev defaults', () => {
    const env = parseEnv(VALID);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PROCESS_TYPE).toBe('api');
    expect(env.PORT).toBe(4000);
    expect(env.MONGO_URI).toContain('replicaSet=rs0');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('fails with a readable error when JWT_ACCESS_SECRET is missing', () => {
    expect(() => parseEnv({})).toThrowError(/JWT_ACCESS_SECRET/);
    expect(() => parseEnv({})).toThrowError(/refusing to boot/);
    expect(() => parseEnv({})).toThrowError(/\.env\.local/);
  });

  it('rejects a too-short JWT_ACCESS_SECRET', () => {
    expect(() => parseEnv({ JWT_ACCESS_SECRET: 'short' })).toThrowError(/at least 32 characters/);
  });

  it('coerces numeric strings (PORT) and rejects garbage', () => {
    expect(parseEnv({ ...VALID, PORT: '5001' }).PORT).toBe(5001);
    expect(() => parseEnv({ ...VALID, PORT: 'not-a-port' })).toThrowError(/PORT/);
  });

  it('rejects an unknown PROCESS_TYPE', () => {
    expect(() => parseEnv({ ...VALID, PROCESS_TYPE: 'cron' })).toThrowError(/PROCESS_TYPE/);
  });
});
