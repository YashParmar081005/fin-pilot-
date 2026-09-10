/**
 * Aggregate turnover drives two GST rules (§14.3 and e-invoicing), and both
 * were dormant: the field could not be set through the create-company
 * contract, so it stayed 0 and the thresholds never fired. A business legally
 * required to quote 6-digit HSN could save 4-digit codes unchallenged.
 *
 * The free plan allows ONE company per organisation, so each case registers
 * its own owner rather than piling companies onto one.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;

const FIVE_CRORE_PAISE = 5_00_00_000 * 100;

/** A fresh owner, org and company — the only way to get a second company. */
async function newCompany(
  turnoverPaise: number | undefined,
  label: string,
): Promise<{ token: string; companyId: string; company: Record<string, unknown> }> {
  const email = `turnover-${randomUUID().slice(0, 8)}@spec.in`;
  const password = 'turnover-spec-pass1';

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, name: label })
    .expect(201);
  const token = (
    await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200)
  ).body.data.accessToken;

  const res = await request(app)
    .post('/api/v1/companies')
    .set('Authorization', `Bearer ${token}`)
    .send({
      legalName: `${label} Pvt Ltd`,
      stateCode: '24',
      booksBeginDate: '2026-04-01',
      ...(turnoverPaise === undefined ? {} : { aggregateTurnoverPaise: turnoverPaise }),
    })
    .expect(201);

  return { token, companyId: res.body.data.company.id, company: res.body.data.company };
}

const auth = (token: string, companyId: string) => ({
  Authorization: `Bearer ${token}`,
  'X-Company-Id': companyId,
  'Idempotency-Key': randomUUID(),
});

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');
}, 180_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('aggregate turnover reaches the company', () => {
  it('is stored from the create contract instead of being dropped', async () => {
    const { company } = await newCompany(FIVE_CRORE_PAISE * 2, 'Big Turnover');
    expect(company.aggregateTurnoverPaise).toBe(FIVE_CRORE_PAISE * 2);
  }, 60_000);

  it('defaults to zero when omitted, so existing callers are unaffected', async () => {
    const { company } = await newCompany(undefined, 'No Turnover');
    expect(company.aggregateTurnoverPaise).toBe(0);
  }, 60_000);
});

describe('the §14.3 six-digit HSN rule', () => {
  it('rejects a 4-digit HSN once turnover is above ₹5 crore', async () => {
    const { token, companyId } = await newCompany(FIVE_CRORE_PAISE * 2, 'Above Threshold');

    const res = await request(app)
      .post('/api/v1/items')
      .set(auth(token, companyId))
      .send({ kind: 'goods', name: 'Widget', hsn: '7307', gstRate: 18 })
      .expect(422);

    expect(res.body.error.code).toBe('GST_HSN_DIGITS_INSUFFICIENT');
    expect(res.body.error.details).toMatchObject({ required: 6, got: 4 });
  }, 60_000);

  it('accepts a 6-digit HSN from that same company', async () => {
    const { token, companyId } = await newCompany(FIVE_CRORE_PAISE * 2, 'Above Threshold Two');

    await request(app)
      .post('/api/v1/items')
      .set(auth(token, companyId))
      .send({ kind: 'goods', name: 'Widget', hsn: '730710', gstRate: 18 })
      .expect(201);
  }, 60_000);

  it('leaves a small business alone — 4 digits is legal below the threshold', async () => {
    const { token, companyId } = await newCompany(1_00_000_00, 'Small Turnover');

    await request(app)
      .post('/api/v1/items')
      .set(auth(token, companyId))
      .send({ kind: 'goods', name: 'Widget', hsn: '7307', gstRate: 18 })
      .expect(201);
  }, 60_000);
});
