/**
 * Phase 17 acceptance (plan.md §32): every report matches the hand-computed
 * golden file TO THE PAISE; the balance sheet balances; exports arrive as a
 * downloadable artefact with progress.
 *
 * Golden dataset (hand-computed):
 *  invoice  ₹10,000 @18% intra → AR 11,80,000p, sales 10,00,000p, tax 1,80,000p
 *  payment  half received      → bank +5,90,000p, AR 5,90,000p left
 *  bill     ₹2,000 @18% intra  → purchases 2,00,000p, input tax 36,000p, AP 2,36,000p
 *  expense  ₹500 travel        → travel 50,000p, staff payable 50,000p
 * P&L: income 10,00,000 − (2,00,000 + 50,000) = net 7,50,000p
 * BS: assets 5,90,000(bank) + 5,90,000(AR) + 36,000(ITC) = 12,16,000p
 *     liab 2,36,000(AP) + 1,80,000(GST out) + 50,000(2160) = 4,66,000p
 *     equity 0 + retained 7,50,000p → 4,66,000 + 7,50,000 = 12,16,000p ✓
 */
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { getEnv } from '../../src/config/env';
import { QUEUES, JobSchemas } from '../../src/queues/definitions';
import { createWorker, getQueue, getQueueEvents } from '../../src/queues/infra';
import { processReportExport } from '../../src/jobs/reportExport';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let token: string;
let companyId: string;
let accountIdByCode: Record<string, string> = {};
let redisUp = false;
const cleanups: Array<() => Promise<unknown>> = [];

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });
const idem = () => ({ ...auth(), 'Idempotency-Key': randomUUID() });

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');
  const probe = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: 0, lazyConnect: true });
  try {
    await probe.connect();
    await probe.ping();
    redisUp = true;
  } catch {
    /* export test skips */
  } finally {
    probe.disconnect();
  }

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'rep@spec.in', password: 'rep-spec-password1', name: 'Report Owner' })
    .expect(201);
  token = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rep@spec.in', password: 'rep-spec-password1' })
      .expect(200)
  ).body.data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'Report Spec Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;
  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);
  const accounts = await request(app).get('/api/v1/accounts').set(auth()).expect(200);
  accountIdByCode = Object.fromEntries(
    accounts.body.data.accounts.map((a: { code: string; id: string }) => [a.code, a.id]),
  );

  // second user so the expense can be approved (no self-approval)
  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'rep2@spec.in', password: 'rep-spec-password1', name: 'Approver' })
    .expect(201);
  const approverToken = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rep2@spec.in', password: 'rep-spec-password1' })
      .expect(200)
  ).body.data.accessToken;
  await request(app)
    .post(`/api/v1/companies/${companyId}/members`)
    .set('Authorization', `Bearer ${token}`)
    .send({ email: 'rep2@spec.in', roleKey: 'accountant' })
    .expect(201);
  const { getTestOutbox } = await import('../../src/services/mailService');
  const mail = [...getTestOutbox()].reverse().find((m) => m.to === 'rep2@spec.in');
  const inviteToken = /token=([\w-]+\.[\w-]+\.[\w-]+)/.exec(mail!.text)![1]!;
  await request(app)
    .post('/api/v1/invites/accept')
    .set('Authorization', `Bearer ${approverToken}`)
    .send({ token: inviteToken })
    .expect(200);

  const customer = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({ type: ['customer'], name: 'Golden Customer', placeOfSupplyStateCode: '24' })
      .expect(201)
  ).body.data.party.id;
  const vendor = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({ type: ['vendor'], name: 'Golden Vendor', placeOfSupplyStateCode: '24' })
      .expect(201)
  ).body.data.party.id;

  // invoice + half payment
  const draft = (
    await request(app)
      .post('/api/v1/invoices')
      .set(idem())
      .send({
        partyId: customer,
        issueDate: '2026-07-01',
        lines: [{ description: 'Goods', qty: 1, ratePaise: 10_00_000, gstRate: 18 }],
      })
      .expect(201)
  ).body.data.invoice;
  const invoice = (
    await request(app).post(`/api/v1/invoices/${draft.id}/issue`).set(idem()).expect(201)
  ).body.data.invoice;
  await request(app)
    .post('/api/v1/payments')
    .set(idem())
    .send({
      direction: 'inflow',
      partyId: customer,
      date: '2026-07-03',
      amountPaise: 5_90_000,
      depositAccountId: accountIdByCode['1120'],
      allocations: [{ documentModel: 'Invoice', documentId: invoice.id, amountPaise: 5_90_000 }],
    })
    .expect(201);

  // bill (kept unpaid, due 2026-07-10 → aged)
  const bill = (
    await request(app)
      .post('/api/v1/bills')
      .set(idem())
      .send({
        partyId: vendor,
        vendorBillNumber: 'GV-1',
        billDate: '2026-06-25',
        dueDate: '2026-07-10',
        lines: [{ description: 'Inputs', qty: 1, ratePaise: 2_00_000, gstRate: 18 }],
      })
      .expect(201)
  ).body.data.bill;
  await request(app).post(`/api/v1/bills/${bill.id}/approve`).set(idem()).expect(201);

  // expense approved by the second user
  const expense = (
    await request(app)
      .post('/api/v1/expenses')
      .set(idem())
      .send({
        date: '2026-07-02',
        amountPaise: 50_000,
        expenseAccountId: accountIdByCode['5350'],
        description: 'Site visit',
      })
      .expect(201)
  ).body.data.expense;
  await request(app)
    .post(`/api/v1/expenses/${expense.id}/approve`)
    .set({
      Authorization: `Bearer ${approverToken}`,
      'X-Company-Id': companyId,
      'Idempotency-Key': randomUUID(),
    })
    .expect(201);
}, 240_000);

afterAll(async () => {
  for (const c of cleanups.reverse()) await c().catch(() => undefined);
  await disconnectTestDb();
}, 60_000);

const AS_OF = '?asOf=2026-08-01';

describe('reports match the golden file to the paise', () => {
  it('P&L: income 10,00,000 − expenses 2,50,000 = net 7,50,000', async () => {
    const pnl = (
      await request(app).get(`/api/v1/reports/profit-loss${AS_OF}`).set(auth()).expect(200)
    ).body.data;
    expect(pnl.totalIncomePaise).toBe(10_00_000);
    expect(pnl.totalExpensesPaise).toBe(2_50_000);
    expect(pnl.netProfitPaise).toBe(7_50_000);
  });

  it('balance sheet BALANCES: 12,16,000 = 4,66,000 + 7,50,000', async () => {
    const bs = (
      await request(app).get(`/api/v1/reports/balance-sheet${AS_OF}`).set(auth()).expect(200)
    ).body.data;
    expect(bs.totalAssetsPaise).toBe(12_16_000);
    expect(bs.totalLiabilitiesPaise).toBe(4_66_000);
    expect(bs.retainedEarningsPaise).toBe(7_50_000);
    expect(bs.totalEquityPaise).toBe(7_50_000);
    expect(bs.balances).toBe(true);
  });

  it('cash flow ties: closing cash 5,90,000', async () => {
    const cf = (await request(app).get(`/api/v1/reports/cash-flow${AS_OF}`).set(auth()).expect(200))
      .body.data;
    expect(cf.closingCashPaise).toBe(5_90_000);
    expect(cf.netProfitPaise).toBe(7_50_000);
  });

  it('aged AR/AP bucket to the paise', async () => {
    const ar = (
      await request(app).get(`/api/v1/reports/aged-receivables${AS_OF}`).set(auth()).expect(200)
    ).body.data;
    expect(ar.totalPaise).toBe(5_90_000); // half the invoice unpaid
    const ap = (
      await request(app).get(`/api/v1/reports/aged-payables${AS_OF}`).set(auth()).expect(200)
    ).body.data;
    expect(ap.totalPaise).toBe(2_36_000);
    expect(ap.buckets.d30).toBe(2_36_000); // due 10 Jul, asOf 1 Aug → 22 days
  });
});

describe('exports via the queue (§32)', () => {
  it('an export lands as a downloadable artefact with progress', async (ctx) => {
    if (!redisUp) return ctx.skip();
    const worker = createWorker(QUEUES.REPORT_EXPORT, async (job) =>
      processReportExport(JobSchemas[QUEUES.REPORT_EXPORT].parse(job.data)),
    );
    const events = getQueueEvents(QUEUES.REPORT_EXPORT);
    await events.waitUntilReady();
    cleanups.push(async () => {
      await worker.close();
      await events.close();
      await getQueue(QUEUES.REPORT_EXPORT).obliterate({ force: true });
    });

    const queued = await request(app)
      .post(`/api/v1/reports/trial-balance/export${AS_OF}`)
      .set(auth())
      .expect(202);
    const jobId = queued.body.data.jobId;

    const bullJob = await getQueue(QUEUES.REPORT_EXPORT).getJob(`report-${jobId}`);
    await bullJob!.waitUntilFinished(events, 30_000);

    const status = (await request(app).get(`/api/v1/jobs/${jobId}`).set(auth()).expect(200)).body
      .data;
    expect(status.status).toBe('completed');
    expect(status.progress).toBe(100);

    const download = await request(app)
      .get(`/api/v1/jobs/${jobId}/download`)
      .set(auth())
      .expect(200);
    expect(download.headers['content-type']).toContain('text/csv');
    expect(download.text).toContain('code,name,type');
    expect(download.text).toContain('4100'); // sales row present
  }, 60_000);
});
