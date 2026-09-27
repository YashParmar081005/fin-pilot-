/**
 * The plan catalogue.
 *
 * PLAN_PRICE_PAISE existed from the start and nothing ever sent it to a
 * client, so the billing screen offered "Upgrade to starter" with no price and
 * no statement of what changed. These pin that the catalogue reaches the
 * client priced, and that an unconfigured Razorpay is reported as such rather
 * than only failing once somebody clicks Subscribe.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { PLAN_PRICE_PAISE } from '@finpilot/shared';
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

  const email = `billing-${randomUUID().slice(0, 8)}@spec.in`;
  const password = 'billing-spec-password1';
  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, name: 'Billing Owner' })
    .expect(201);
  token = (await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200)).body
    .data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set({ Authorization: `Bearer ${token}` })
      .send({ legalName: 'Billing Co Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;
}, 180_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('the plan catalogue', () => {
  it('reaches the client priced, with each tier"s limits', async () => {
    const res = await request(app).get('/api/v1/billing/plans').set(auth()).expect(200);
    const { plans, currentPlan } = res.body.data;

    expect(currentPlan).toBe('free');
    expect(plans).toHaveLength(4);

    const starter = plans.find((p: { key: string }) => p.key === 'starter');
    // the number a customer is being asked to pay, not a placeholder
    expect(starter.pricePaise).toBe(PLAN_PRICE_PAISE.starter);
    expect(starter.limits.maxInvoicesMonth).toBeGreaterThan(0);
    expect(starter.limits.maxCompanies).toBeGreaterThan(0);

    const free = plans.find((p: { key: string }) => p.key === 'free');
    expect(free.pricePaise).toBe(0);
    expect(free.current).toBe(true);
  }, 60_000);

  it('prices rise with the tier, so the ladder makes sense', async () => {
    const res = await request(app).get('/api/v1/billing/plans').set(auth()).expect(200);
    const prices = (res.body.data.plans as { pricePaise: number }[]).map((p) => p.pricePaise);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]!).toBeGreaterThan(prices[i - 1]!);
    }
  }, 60_000);

  it('says Razorpay is unconfigured rather than pretending a tier is buyable', async () => {
    // the test environment sets no Razorpay keys
    const res = await request(app).get('/api/v1/billing/plans').set(auth()).expect(200);
    expect(res.body.data.razorpayConfigured).toBe(false);
    for (const plan of res.body.data.plans as { key: string; subscribable: boolean }[]) {
      expect(plan.subscribable).toBe(false);
    }
  }, 60_000);

  it('refuses to subscribe to free — there is nothing to charge for', async () => {
    await request(app)
      .post('/api/v1/billing/subscribe')
      .set(idem())
      .send({ plan: 'free' })
      .expect(422);
  }, 60_000);

  it('reports the provider as unavailable, not as a generic failure', async () => {
    const res = await request(app)
      .post('/api/v1/billing/subscribe')
      .set(idem())
      .send({ plan: 'starter' })
      .expect(503);
    expect(res.body.error.details.service).toBe('razorpay');
  }, 60_000);
});
