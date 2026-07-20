/**
 * Phase 21 acceptance (plan.md §32):
 * - the forecast is REPRODUCIBLE (same inputs → same output, no LLM)
 * - < 6 months of history shows the caveat
 * - every health component exposes its drivers
 * Plus: a fraud signal fires on a duplicate vendor amount.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let token: string;
let companyId: string;

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });
const idem = () => ({ ...auth(), 'Idempotency-Key': randomUUID() });

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'fc@spec.in', password: 'fc-spec-password1', name: 'Forecast Owner' })
    .expect(201);
  token = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'fc@spec.in', password: 'fc-spec-password1' })
      .expect(200)
  ).body.data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'Forecast Spec Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;
  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);

  const customer = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({ type: ['customer'], name: 'Forecast Customer', placeOfSupplyStateCode: '24' })
      .expect(201)
  ).body.data.party.id;
  const vendor = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({ type: ['vendor'], name: 'Forecast Vendor', placeOfSupplyStateCode: '24' })
      .expect(201)
  ).body.data.party.id;

  // open AR: one issued invoice due soon
  const draft = (
    await request(app)
      .post('/api/v1/invoices')
      .set(idem())
      .send({
        partyId: customer,
        issueDate: '2026-07-01',
        dueDate: '2026-07-25',
        lines: [{ description: 'Goods', qty: 1, ratePaise: 10_00_000, gstRate: 18 }],
      })
      .expect(201)
  ).body.data.invoice;
  await request(app).post(`/api/v1/invoices/${draft.id}/issue`).set(idem()).expect(201);

  // two same-amount vendor bills 2 days apart → duplicate_vendor_amount signal
  for (const [n, date] of [
    ['DUP-A', '2026-07-01'],
    ['DUP-B', '2026-07-03'],
  ] as const) {
    const bill = (
      await request(app)
        .post('/api/v1/bills')
        .set(idem())
        .send({
          partyId: vendor,
          vendorBillNumber: n,
          billDate: date,
          lines: [{ description: 'Suspicious', qty: 1, ratePaise: 2_00_000, gstRate: 18 }],
        })
        .expect(201)
    ).body.data.bill;
    await request(app).post(`/api/v1/bills/${bill.id}/approve`).set(idem()).expect(201);
  }
}, 180_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('the deterministic forecast (§32 Phase 21)', () => {
  it('is reproducible: two runs produce identical output', async () => {
    const a = (await request(app).get('/api/v1/forecast/cash-flow').set(auth()).expect(200)).body
      .data;
    const b = (await request(app).get('/api/v1/forecast/cash-flow').set(auth()).expect(200)).body
      .data;
    expect(a).toEqual(b); // same inputs → same output, no LLM in the number path
    expect(a.p10).toHaveLength(13);
    expect(a.p50).toHaveLength(13);
    expect(a.p90).toHaveLength(13);
    // scenarios are ordered: pessimistic ≤ median ≤ optimistic at the horizon
    expect(a.p10[12]).toBeLessThanOrEqual(a.p50[12]);
    expect(a.p50[12]).toBeLessThanOrEqual(a.p90[12]);
  });

  it('shows the caveat with < 6 months of history', async () => {
    const fc = (await request(app).get('/api/v1/forecast/cash-flow').set(auth()).expect(200)).body
      .data;
    expect(fc.monthsOfHistory).toBeLessThan(6);
    expect(fc.caveat).toContain('month(s) of history');
  });

  it('every health component exposes its drivers', async () => {
    const health = (await request(app).get('/api/v1/forecast/health').set(auth()).expect(200)).body
      .data;
    expect(health.components).toHaveLength(6);
    expect(health.components.map((c: { key: string }) => c.key).sort()).toEqual([
      'compliance',
      'concentration',
      'liquidity',
      'payables',
      'profitability',
      'receivables',
    ]);
    for (const component of health.components) {
      expect(component.score).toBeGreaterThanOrEqual(0);
      expect(component.score).toBeLessThanOrEqual(100);
      expect(component.drivers.length).toBeGreaterThan(0); // ← the done-when
      for (const driver of component.drivers) {
        expect(driver.name).toBeTruthy();
        expect(driver.value).toBeDefined();
      }
    }
    expect(health.overall).toBeGreaterThanOrEqual(0);
  });

  it('the fraud signal set flags the duplicate vendor amount', async () => {
    const anomalies = (await request(app).get('/api/v1/forecast/anomalies').set(auth()).expect(200))
      .body.data;
    const dup = anomalies.signals.find(
      (s: { signal: string }) => s.signal === 'duplicate_vendor_amount',
    );
    expect(dup).toBeTruthy();
    expect(dup.severity).toBe('high');
    expect(dup.refs).toHaveLength(2); // both bills referenced
  });
});
