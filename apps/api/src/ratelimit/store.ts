/**
 * Rate-limit storage (plan.md §19.2/§19.3) — the two Lua scripts, verbatim,
 * atomic and correct across N pods. A MemoryStore provides the deterministic
 * test engine AND the conservative per-pod fallback when Redis fails open.
 */
import type { Redis } from 'ioredis';
import { getEnv } from '../config/env';
import { getRedis } from '../config/redis';

export interface SlidingResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}
export interface BucketResult {
  allowed: boolean;
  retryAfterSec: number;
}

export interface RateLimitStore {
  slidingWindow(key: string, windowMs: number, limit: number): Promise<SlidingResult>;
  tokenBucket(
    key: string,
    capacity: number,
    refillPerSec: number,
    cost: number,
  ): Promise<BucketResult>;
}

// §19.2 — sliding window log
const SLIDING_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, tonumber(ARGV[1]) - tonumber(ARGV[2]))
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[3]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return { 0, tonumber(ARGV[3]) - count, oldest[2] }
end
redis.call('ZADD', KEYS[1], tonumber(ARGV[1]), ARGV[4])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]))
return { 1, tonumber(ARGV[3]) - count - 1, 0 }
`;

// §19.3 — token bucket with weighted cost
const BUCKET_LUA = `
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens   = tonumber(b[1]) or tonumber(ARGV[1])
local lastTs   = tonumber(b[2]) or tonumber(ARGV[3])
local elapsed  = math.max(0, tonumber(ARGV[3]) - lastTs) / 1000
tokens = math.min(tonumber(ARGV[1]), tokens + elapsed * tonumber(ARGV[2]))
local cost = tonumber(ARGV[4])
if tokens < cost then
  redis.call('HMSET', KEYS[1], 'tokens', tokens, 'ts', ARGV[3])
  redis.call('EXPIRE', KEYS[1], 3600)
  return { 0, math.ceil((cost - tokens) / tonumber(ARGV[2])) }
end
redis.call('HMSET', KEYS[1], 'tokens', tokens - cost, 'ts', ARGV[3])
redis.call('EXPIRE', KEYS[1], 3600)
return { 1, 0 }
`;

export class RedisStore implements RateLimitStore {
  private client: Redis & {
    rlSliding?: (
      key: string,
      now: number,
      win: number,
      limit: number,
      member: string,
    ) => Promise<number[]>;
    rlBucket?: (
      key: string,
      cap: number,
      refill: number,
      now: number,
      cost: number,
    ) => Promise<number[]>;
  };

  constructor() {
    this.client = getRedis(getEnv(), 'ratelimit');
    if (!this.client.rlSliding) {
      this.client.defineCommand('rlSliding', { numberOfKeys: 1, lua: SLIDING_LUA });
      this.client.defineCommand('rlBucket', { numberOfKeys: 1, lua: BUCKET_LUA });
    }
  }

  async slidingWindow(key: string, windowMs: number, limit: number): Promise<SlidingResult> {
    const now = Date.now();
    const [allowed, remaining, oldest] = (await this.client.rlSliding!(
      key,
      now,
      windowMs,
      limit,
      `${now}:${Math.random()}`,
    )) as [number, number, number];
    return {
      allowed: allowed === 1,
      remaining: Math.max(0, remaining),
      retryAfterSec: allowed === 1 ? 0 : Math.ceil((Number(oldest) + windowMs - now) / 1000),
    };
  }

  async tokenBucket(
    key: string,
    capacity: number,
    refillPerSec: number,
    cost: number,
  ): Promise<BucketResult> {
    const [allowed, retryAfterSec] = (await this.client.rlBucket!(
      key,
      capacity,
      refillPerSec,
      Date.now(),
      cost,
    )) as [number, number];
    return { allowed: allowed === 1, retryAfterSec };
  }
}

/** Deterministic engine — same semantics, injectable clock. */
export class MemoryStore implements RateLimitStore {
  private windows = new Map<string, number[]>();
  private buckets = new Map<string, { tokens: number; ts: number }>();
  constructor(private clock: () => number = Date.now) {}

  async slidingWindow(key: string, windowMs: number, limit: number): Promise<SlidingResult> {
    const now = this.clock();
    const hits = (this.windows.get(key) ?? []).filter((t) => t > now - windowMs);
    if (hits.length >= limit) {
      this.windows.set(key, hits);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.ceil((hits[0]! + windowMs - now) / 1000),
      };
    }
    hits.push(now);
    this.windows.set(key, hits);
    return { allowed: true, remaining: limit - hits.length, retryAfterSec: 0 };
  }

  async tokenBucket(
    key: string,
    capacity: number,
    refillPerSec: number,
    cost: number,
  ): Promise<BucketResult> {
    const now = this.clock();
    const bucket = this.buckets.get(key) ?? { tokens: capacity, ts: now };
    const elapsed = Math.max(0, now - bucket.ts) / 1000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSec);
    bucket.ts = now;
    if (bucket.tokens < cost) {
      this.buckets.set(key, bucket);
      return { allowed: false, retryAfterSec: Math.ceil((cost - bucket.tokens) / refillPerSec) };
    }
    bucket.tokens -= cost;
    this.buckets.set(key, bucket);
    return { allowed: true, retryAfterSec: 0 };
  }
}

/** For tests: behaves like Redis being down. */
export class FailingStore implements RateLimitStore {
  slidingWindow(): Promise<SlidingResult> {
    return Promise.reject(new Error('redis unavailable'));
  }
  tokenBucket(): Promise<BucketResult> {
    return Promise.reject(new Error('redis unavailable'));
  }
}

let store: RateLimitStore | null = null;

export function getRateLimitStore(): RateLimitStore {
  if (!store) store = getEnv().NODE_ENV === 'test' ? new MemoryStore() : new RedisStore();
  return store;
}

/** Test hook — swap the store (e.g. FailingStore to simulate a Redis outage). */
export function setRateLimitStore(next: RateLimitStore | null): void {
  store = next;
}
