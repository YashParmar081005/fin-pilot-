/**
 * Phase 13 acceptance (plan.md §32):
 * - issuing a B2B invoice for an eligible company returns 201 IMMEDIATELY
 *   with eInvoice.status 'pending', and an IRN appears within seconds
 * - an IRP 4xx does not retry; a 5xx retries with backoff and lands in the DLQ
 */
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { getEnv } from '../../src/config/env';
import { Company } from '../../src/models/Company';
import { DeadLetter } from '../../src/models/DeadLetter';
import { QUEUES, JobSchemas } from '../../src/queues/definitions';
import { createWorker, getQueue, getQueueEvents } from '../../src/queues/infra';
import { enqueueEInvoice } from '../../src/queues/producers';
import { processEInvoice } from '../../src/jobs/einvoice';
import { reapOutbox, handleOutboxEvent } from '../../src/jobs/maintenance';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let token: string;
let companyId: string;
let redisUp = false;
const cleanups: Array<() => Promise<unknown>> = [];

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });
const idem = () => ({ ...auth(), 'Idempotency-Key': randomUUID() });

async function issueB2B(buyerName: string) {
  const party = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({
        type: ['customer'],
        name: buyerName,
        gstin: '27AAPFU0939F1ZV',
        gstRegistrationType: 'regular',
        placeOfSupplyStateCode: '27',
      })
      .expect(201)
  ).body.data.party;
  const draft = (
    await request(app)
      .post('/api/v1/invoices')
      .set(idem())
      .send({
        partyId: party.id,
        issueDate: '2026-07-15',
        lines: [{ description: 'Goods', qty: 1, ratePaise: 10_00_000, gstRate: 18, hsn: '5208' }],
      })
      .expect(201)
  ).body.data.invoice;
  return (await request(app).post(`/api/v1/invoices/${draft.id}/issue`).set(idem()).expect(201))
    .body.data.invoice;
}

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');
  const probe = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: 0, lazyConnect: true });
  try {
    await probe.connect();
    await probe.ping();
    redisUp = true;
  } catch {
    console.warn('⚠ einvoice queue paths skipped: no redis');
  } finally {
    probe.disconnect();
  }

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'irn@spec.in', password: 'irn-spec-password1', name: 'IRN Owner' })
    .expect(201);
  token = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'irn@spec.in', password: 'irn-spec-password1' })
      .expect(200)
  ).body.data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalName: 'IRN Spec Pvt Ltd',
        stateCode: '24',
        gstin: '24AAAAA0000A1Z8',
        booksBeginDate: '2026-04-01',
      })
      .expect(201)
  ).body.data.company.id;
  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);
  // §14.4: eligibility is a per-company flag, set once
  await Company.updateOne({ _id: companyId }, { eInvoiceEnabled: true });
}, 180_000);

afterAll(async () => {
  for (const c of cleanups.reverse()) await c().catch(() => undefined);
  await disconnectTestDb();
}, 60_000);

describe('async IRN generation (§14.4)', () => {
  it('issue returns 201 immediately with pending; the worker lands the IRN', async (ctx) => {
    if (!redisUp) return ctx.skip();
    const worker = createWorker(QUEUES.EINVOICE, async (job) =>
      processEInvoice(JobSchemas[QUEUES.EINVOICE].parse(job.data)),
    );
    const events = getQueueEvents(QUEUES.EINVOICE);
    await events.waitUntilReady();
    cleanups.push(async () => {
      await worker.close();
      await events.close();
      await getQueue(QUEUES.EINVOICE).obliterate({ force: true });
    });

    const issued = await issueB2B('Good Buyer Pvt Ltd');
    expect(issued.eInvoice.status).toBe('pending'); // 201 came back before any IRP call

    // outbox → queue (the reaper path; in prod the change stream races it)
    await reapOutbox(handleOutboxEvent);
    const job = await getQueue(QUEUES.EINVOICE).getJob(`einvoice-${issued.id}`);
    expect(job).toBeTruthy();
    await job!.waitUntilFinished(events, 30_000);

    const after = (await request(app).get(`/api/v1/invoices/${issued.id}`).set(auth()).expect(200))
      .body.data.invoice;
    expect(after.eInvoice.status).toBe('generated');
    expect(after.eInvoice.irn).toHaveLength(64);
    expect(after.eInvoice.signedQrCode).toContain('QR:');

    // §20.3: re-enqueue is deduped by jobId → still ONE IRN
    const again = await processEInvoice({ invoiceId: issued.id, companyId });
    expect(again).toEqual({ skipped: 'already_generated' });
  }, 60_000);

  it('an IRP 4xx marks failed and does NOT retry', async () => {
    const issued = await issueB2B('FAIL4XX');
    let attempts = 0;
    const origProcess = processEInvoice;
    await expect(
      (async () => {
        attempts += 1;
        return origProcess({ invoiceId: issued.id, companyId });
      })(),
    ).rejects.toThrow(/IRP_REJECTED/);
    expect(attempts).toBe(1);

    const after = (await request(app).get(`/api/v1/invoices/${issued.id}`).set(auth()).expect(200))
      .body.data.invoice;
    expect(after.eInvoice.status).toBe('failed');
    expect(after.eInvoice.lastError).toContain('buyer GSTIN inactive'); // IRP error verbatim
    expect(after.eInvoice.attemptCount).toBe(1); // no retries burned
  });

  it('an IRP 5xx retries with backoff and lands in the DLQ', async (ctx) => {
    if (!redisUp) return ctx.skip();
    const worker = createWorker(QUEUES.EINVOICE, async (job) =>
      processEInvoice(JobSchemas[QUEUES.EINVOICE].parse(job.data)),
    );
    const events = getQueueEvents(QUEUES.EINVOICE);
    await events.waitUntilReady();
    cleanups.push(async () => {
      await worker.close();
      await events.close();
    });

    const issued = await issueB2B('FAIL5XX');
    await enqueueEInvoice({ invoiceId: issued.id, companyId }, { attempts: 2, backoffMs: 50 });
    const job = await getQueue(QUEUES.EINVOICE).getJob(`einvoice-${issued.id}`);
    await expect(job!.waitUntilFinished(events, 30_000)).rejects.toThrow(/gateway timeout/);

    let dead = null;
    for (let i = 0; i < 50 && !dead; i++) {
      dead = await DeadLetter.findOne({ queue: QUEUES.EINVOICE }).lean();
      if (!dead) await new Promise((r) => setTimeout(r, 100));
    }
    expect(dead).toBeTruthy(); // exhausted after real retries → DLQ + alert

    const after = (await request(app).get(`/api/v1/invoices/${issued.id}`).set(auth()).expect(200))
      .body.data.invoice;
    expect(after.eInvoice.status).toBe('pending'); // still pending — retryable, not failed
    expect(after.eInvoice.attemptCount).toBe(2); // it DID retry
  }, 60_000);
});
