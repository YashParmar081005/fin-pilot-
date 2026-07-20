/**
 * Phase 24 acceptance — the code-addressable §32 slice: metrics (§27.2),
 * readiness vs liveness (§27.5), the security headers (§28.5), log redaction
 * (§27.1), and DLQ replay through the admin console (§20.5). The staging-only
 * criteria (load targets, pen test, production-scale restore drill) live in
 * docs/runbooks/launch-checklist.md.
 */
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { REDACT_PATHS } from '../../src/config/logger';
import { DeadLetter } from '../../src/models/DeadLetter';
import { User } from '../../src/models/User';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let token: string;
let companyId: string;
let adminToken: string;

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });
const idem = () => ({ ...auth(), 'Idempotency-Key': randomUUID() });

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'obs@spec.in', password: 'obs-spec-pass1', name: 'Obs Owner' })
    .expect(201);
  token = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'obs@spec.in', password: 'obs-spec-pass1' })
      .expect(200)
  ).body.data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'Obs Spec Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;
  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);

  const adminReg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'obs-admin@spec.in', password: 'obs-spec-pass1', name: 'Obs Operator' })
    .expect(201);
  await User.updateOne({ _id: adminReg.body.data.user.id }, { superAdmin: true });
  adminToken = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'obs-admin@spec.in', password: 'obs-spec-pass1' })
      .expect(200)
  ).body.data.accessToken;
}, 180_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('metrics (§27.2)', () => {
  it('/metrics exposes RED metrics with matched-route labels, and a ledger posting lands in the domain counter', async () => {
    // drive a posting through the engine → journal counter + http histogram
    const accounts = (await request(app).get('/api/v1/accounts').set(auth()).expect(200)).body.data
      .accounts;
    const byCode = (code: string) =>
      accounts.find((a: { code: string }) => a.code === code).id as string;
    await request(app)
      .post('/api/v1/journal-entries')
      .set(idem())
      .send({
        date: '2026-07-10',
        narration: 'metrics probe',
        lines: [
          { accountId: byCode('1110'), debitPaise: 5_00_000 },
          { accountId: byCode('3100'), creditPaise: 5_00_000 },
        ],
      })
      .expect(201);

    const body = (await request(app).get('/metrics').expect(200)).text;
    expect(body).toContain('finpilot_journal_entries_posted_total');
    expect(body).toMatch(/finpilot_journal_entries_posted_total\s+[1-9]/);
    // route label is the matched pattern, not the raw URL (cardinality)
    expect(body).toContain('route="/api/v1/journal-entries"');
    expect(body).not.toContain(`route="/api/v1/companies/${companyId}`);
    expect(body).toContain('finpilot_http_request_duration_seconds_bucket');
    expect(body).toContain('finpilot_dlq_depth');
  });

  it('an error response lands in finpilot_http_errors_total with its canonical code', async () => {
    await request(app).get('/api/v1/invoices').expect(401); // no bearer at all
    const body = (await request(app).get('/metrics').expect(200)).text;
    expect(body).toMatch(
      /finpilot_http_errors_total\{[^}]*code="AUTH_UNAUTHORIZED"[^}]*\}\s+[1-9]/,
    );
  });
});

describe('readiness vs liveness (§27.5)', () => {
  it('/healthz is always 200 (liveness never checks dependencies)', async () => {
    const res = await request(app).get('/healthz').expect(200);
    expect(res.body.status).toBeDefined();
  });

  it('/readyz is 200 only with a writable replica-set primary and a Redis PONG', async () => {
    const res = await request(app).get('/readyz').expect(200);
    expect(res.body.ready).toBe(true);
  });
});

describe('security headers (§28.5)', () => {
  it('CSP has no unsafe-inline, frame-ancestors none; HSTS carries preload', async () => {
    const res = await request(app).get('/healthz').expect(200);
    const csp = res.headers['content-security-policy']!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('log redaction (§27.1)', () => {
  it('the never-log list is covered and pino actually censors those paths', async () => {
    for (const p of [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.passwordHash',
      '*.totpSecretEnc',
      '*.recoveryCodeHashes',
    ]) {
      expect(REDACT_PATHS).toContain(p);
    }

    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const testLogger = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, sink);
    testLogger.info(
      {
        user: { passwordHash: 'argon2id$SECRET', totpSecretEnc: 'enc$SECRET' },
        req: { headers: { authorization: 'Bearer SECRET' } },
      },
      'redaction probe',
    );
    const out = lines.join('');
    expect(out).not.toContain('SECRET');
    expect(out).toContain('[REDACTED]');
  });
});

describe('DLQ replay through the admin console (§20.5)', () => {
  it('a dead letter can be inspected and replayed; the row is marked replayed', async () => {
    await DeadLetter.create({
      queue: 'email',
      jobId: 'dead-job-1',
      name: 'send',
      data: { to: 'obs@spec.in', subject: 'probe', text: 'hello' },
      error: 'SMTP down',
      failedAt: new Date(),
    });

    const list = (
      await request(app)
        .get('/api/v1/admin/dlq')
        .set({ Authorization: `Bearer ${adminToken}` })
        .expect(200)
    ).body.data.deadLetters;
    const dead = list.find((d: { jobId: string }) => d.jobId === 'dead-job-1');
    expect(dead.error).toBe('SMTP down');

    const replay = await request(app)
      .post(`/api/v1/admin/dlq/${dead._id}/replay`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({})
      .expect(201);
    expect(replay.body.data.jobId).toContain('replay:');

    const after = await DeadLetter.findById(dead._id).lean();
    expect(after!.replayedAt).toBeTruthy();

    // a non-admin cannot touch the DLQ
    await request(app)
      .get('/api/v1/admin/dlq')
      .set({ Authorization: `Bearer ${token}` })
      .expect(403);
  });
});
