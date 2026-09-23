/**
 * A newly created company must be usable straight away.
 *
 * It used to arrive with no chart of accounts, so the first thing anyone tried
 * failed on a missing ledger account — adding a bank account returned
 * LEDGER_ACCOUNT_INACTIVE {"missing":"1120"} with no hint that a chart had to
 * be seeded first. Every company needs the chart and the template is the only
 * one on offer, so creation seeds it.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;

async function freshCompany(): Promise<{ token: string; companyId: string }> {
  const email = `fresh-${randomUUID().slice(0, 8)}@spec.in`;
  const password = 'fresh-spec-password1';

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, name: 'Fresh Owner' })
    .expect(201);
  const token = (
    await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200)
  ).body.data.accessToken;

  const companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'Fresh Co Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;

  return { token, companyId };
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

describe('a company is usable the moment it exists', () => {
  it('arrives with the chart of accounts already seeded', async () => {
    const { token, companyId } = await freshCompany();

    const res = await request(app)
      .get('/api/v1/accounts')
      .set({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId })
      .expect(200);

    expect(res.body.data.accounts.length).toBeGreaterThan(50);
    // The specific account whose absence produced the dead end.
    expect(res.body.data.accounts.map((a: { code: string }) => a.code)).toContain('1120');
  }, 60_000);

  it('accepts a bank account without any setup step', async () => {
    const { token, companyId } = await freshCompany();

    await request(app)
      .post('/api/v1/bank-accounts')
      .set(auth(token, companyId))
      .send({ name: 'hdfc bank' })
      .expect(201);
  }, 60_000);

  it('still lets the template be imported again, changing nothing', async () => {
    const { token, companyId } = await freshCompany();

    const res = await request(app)
      .post('/api/v1/accounts/import-template')
      .set(auth(token, companyId))
      .expect(201);

    expect(res.body.data.created).toBe(0);
    expect(res.body.data.existing).toBeGreaterThan(50);
  }, 60_000);
});
