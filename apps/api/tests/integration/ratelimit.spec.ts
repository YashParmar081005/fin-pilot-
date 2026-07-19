/**
 * Phase 10 acceptance — §29.2 ratelimit.spec.ts:
 * - the token bucket refills at the configured rate
 * - cost weighting is applied
 * - login fails CLOSED when Redis is unavailable
 * - /invoices fails OPEN when Redis is unavailable
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { FailingStore, MemoryStore, setRateLimitStore } from '../../src/ratelimit/store';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let token: string;
let companyId: string;

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'rl@spec.in', password: 'rl-spec-password1', name: 'RL Owner' })
    .expect(201);
  token = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rl@spec.in', password: 'rl-spec-password1' })
      .expect(200)
  ).body.data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'RL Spec Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;
});

afterEach(() => setRateLimitStore(null)); // back to the default store

afterAll(async () => {
  await disconnectTestDb();
});

describe('the token bucket engine (§19.3 semantics)', () => {
  it('refills at the configured rate', async () => {
    let now = 1_000_000;
    const store = new MemoryStore(() => now);
    // capacity 10, refill 2/s, cost 1
    for (let i = 0; i < 10; i++) {
      expect((await store.tokenBucket('k', 10, 2, 1)).allowed).toBe(true);
    }
    const denied = await store.tokenBucket('k', 10, 2, 1);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBe(1); // ceil(1 token / 2 per sec)

    now += 500; // +0.5 s → +1 token
    expect((await store.tokenBucket('k', 10, 2, 1)).allowed).toBe(true);
    expect((await store.tokenBucket('k', 10, 2, 1)).allowed).toBe(false);

    now += 5_000; // +10 tokens, capped at capacity
    for (let i = 0; i < 10; i++) {
      expect((await store.tokenBucket('k', 10, 2, 1)).allowed).toBe(true);
    }
    expect((await store.tokenBucket('k', 10, 2, 1)).allowed).toBe(false);
  });

  it('applies cost weighting — an expensive call drains the bucket faster', async () => {
    let now = 2_000_000;
    const store = new MemoryStore(() => now);
    // capacity 60: six cost-10 report calls exhaust what sixty cost-1 GETs would
    for (let i = 0; i < 6; i++) {
      expect((await store.tokenBucket('w', 60, 1, 10)).allowed).toBe(true);
    }
    expect((await store.tokenBucket('w', 60, 1, 10)).allowed).toBe(false);
    // …but a cheap call still cannot sneak through an empty bucket
    expect((await store.tokenBucket('w', 60, 1, 1)).allowed).toBe(false);
    now += 1_000; // 1 token back
    expect((await store.tokenBucket('w', 60, 1, 1)).allowed).toBe(true);
  });

  it('the sliding window blocks over-limit and recovers after the window', async () => {
    let now = 3_000_000;
    const store = new MemoryStore(() => now);
    for (let i = 0; i < 5; i++) {
      expect((await store.slidingWindow('s', 60_000, 5)).allowed).toBe(true);
    }
    expect((await store.slidingWindow('s', 60_000, 5)).allowed).toBe(false);
    now += 61_000;
    expect((await store.slidingWindow('s', 60_000, 5)).allowed).toBe(true);
  });
});

describe('fail-open vs fail-closed (§19.6) — Redis is down', () => {
  it('login fails CLOSED with 503', async () => {
    setRateLimitStore(new FailingStore());
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rl@spec.in', password: 'rl-spec-password1' })
      .expect(503);
    expect(res.body.error.code).toBe('SYS_SERVICE_UNAVAILABLE');
  });

  it('/invoices fails OPEN — the accountant keeps working', async () => {
    setRateLimitStore(new FailingStore());
    const res = await request(app).get('/api/v1/invoices').set(auth()).expect(200);
    expect(res.body.data.invoices).toBeDefined();
  });

  it('and a mutating money route also stays available (fallback still counts)', async () => {
    setRateLimitStore(new FailingStore());
    const party = (
      await request(app)
        .post('/api/v1/parties')
        .set(auth())
        .send({ type: ['customer'], name: 'RL Customer' })
        .expect(201)
    ).body.data.party;
    await request(app)
      .post('/api/v1/invoices')
      .set({ ...auth(), 'Idempotency-Key': randomUUID() })
      .send({
        partyId: party.id,
        issueDate: '2026-07-01',
        lines: [{ description: 'Goods', qty: 1, ratePaise: 1_00_000, gstRate: 18 }],
      })
      .expect(201);
  });
});

describe('the response contract (§19.5)', () => {
  it('RateLimit-* headers ride on limited responses; 429 carries Retry-After', async () => {
    const listed = await request(app).get('/api/v1/invoices').set(auth()).expect(200);
    expect(listed.headers['ratelimit-limit']).toBeDefined();
    expect(listed.headers['ratelimit-remaining']).toBeDefined();

    // free tier: capacity 60 — drain it with cost-2 creates until 429
    setRateLimitStore(new MemoryStore());
    let last: request.Response | null = null;
    for (let i = 0; i < 40; i++) {
      last = await request(app).get('/api/v1/invoices').set(auth());
      if (last.status === 429) break;
    }
    // 60 capacity / cost 1 → 61st call in the same instant would 429; the
    // loop above shares the bucket with earlier calls in this file, so we
    // assert the contract on whichever request tripped it (if any did) or
    // force one via a burst.
    if (last?.status !== 429) {
      for (let i = 0; i < 70 && last?.status !== 429; i++) {
        last = await request(app).get('/api/v1/invoices').set(auth());
      }
    }
    expect(last?.status).toBe(429);
    expect(last?.headers['retry-after']).toBeDefined();
    expect(last?.body.error.code).toBe('SYS_RATE_LIMIT_EXCEEDED');
    expect(last?.body.error.details.scope).toBe('user');
  });
});
