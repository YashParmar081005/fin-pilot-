/**
 * Phase 23 acceptance (plan.md §32): exceeding a plan limit returns 402 WITH
 * an upgrade path; impersonation is IMPOSSIBLE without a written reason, and
 * every action during it is tagged. Plus Razorpay subscribe → webhook
 * activation raising the org's limits, and the nightly usage rollup.
 */
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';

const WEBHOOK_SECRET = 'test-razorpay-webhook-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

import { setRazorpaySubscriptionClient } from '../../src/integrations/razorpay/subscriptions';
import { AdminAudit } from '../../src/models/AdminAudit';
import { AuditLog } from '../../src/models/AuditLog';
import { ImpersonationSession } from '../../src/models/ImpersonationSession';
import { Organization } from '../../src/models/Organization';
import { Subscription } from '../../src/models/Subscription';
import { User } from '../../src/models/User';
import { subscriptionService } from '../../src/services/admin/subscriptionService';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let ownerToken: string;
let adminToken: string;
let adminUserId: string;
let ownerUserId: string;
let companyId: string;
let orgId: string;
let customerId: string;

const auth = (token = ownerToken) => ({
  Authorization: `Bearer ${token}`,
  'X-Company-Id': companyId,
});
const idem = (token = ownerToken) => ({ ...auth(token), 'Idempotency-Key': randomUUID() });

async function registerAndLogin(
  email: string,
  name: string,
): Promise<{ id: string; token: string }> {
  const reg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'subs-spec-pass1', name })
    .expect(201);
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'subs-spec-pass1' })
    .expect(200);
  return { id: reg.body.data.user.id, token: login.body.data.accessToken };
}

function createInvoice(headers: Record<string, string>) {
  return request(app)
    .post('/api/v1/invoices')
    .set(headers)
    .send({
      partyId: customerId,
      issueDate: '2026-07-10',
      lines: [{ description: 'Goods', qty: 1, ratePaise: 10_00_000, gstRate: 18 }],
    });
}

function signedWebhook(body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
  return request(app)
    .post('/api/v1/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', signature)
    .send(raw);
}

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');
  setRazorpaySubscriptionClient({
    createSubscription: async ({ plan }) => ({
      id: `sub_mock_${plan}`,
      shortUrl: 'https://rzp.io/i/mock-checkout',
    }),
  });

  const owner = await registerAndLogin('subs@spec.in', 'Subs Owner');
  ownerToken = owner.token;
  ownerUserId = owner.id;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        legalName: 'Subs Spec Pvt Ltd',
        stateCode: '24',
        gstin: '24AAAAA0000A1Z8',
        booksBeginDate: '2026-04-01',
      })
      .expect(201)
  ).body.data.company.id;
  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);
  customerId = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({ type: ['customer'], name: 'Metered Buyer', placeOfSupplyStateCode: '24' })
      .expect(201)
  ).body.data.party.id;

  const org = await Organization.findOne({ ownerUserId: owner.id }).lean();
  orgId = String(org!._id);

  // the platform operator — the flag is seed/ops-only, so the test seeds it
  const admin = await registerAndLogin('admin@spec.in', 'Platform Operator');
  adminToken = admin.token;
  adminUserId = admin.id;
  await User.updateOne({ _id: admin.id }, { superAdmin: true });
}, 180_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('plan limits (§32 Phase 23)', () => {
  it('exceeding maxInvoicesMonth returns 402 with an upgrade path', async () => {
    // limits are DATA (§19.4) — shrink this org's cap without a deploy
    await Organization.updateOne({ _id: orgId }, { 'limits.maxInvoicesMonth': 2 });

    await createInvoice(idem()).expect(201);
    await createInvoice(idem()).expect(201);
    const res = await createInvoice(idem()).expect(402);

    expect(res.body.error.code).toBe('SYS_PLAN_LIMIT_EXCEEDED');
    expect(res.body.error.details).toMatchObject({
      limit: 'maxInvoicesMonth',
      used: 2,
      max: 2,
      plan: 'free',
      upgrade: { currentPlan: 'free', nextPlan: 'starter', url: '/settings/billing' },
    });
  });

  it('exceeding maxUsers (seats) returns 402 with an upgrade path', async () => {
    await Organization.updateOne({ _id: orgId }, { 'limits.maxUsers': 1 });
    const res = await request(app)
      .post(`/api/v1/companies/${companyId}/members`)
      .set({ Authorization: `Bearer ${ownerToken}` })
      .send({ email: 'newseat@spec.in', roleKey: 'accountant' })
      .expect(402);
    expect(res.body.error.code).toBe('SYS_PLAN_LIMIT_EXCEEDED');
    expect(res.body.error.details.limit).toBe('maxUsers');
    expect(res.body.error.details.upgrade.nextPlan).toBe('starter');
  });

  it('subscribe → Razorpay webhook activates → limits rise and the blocked call succeeds', async () => {
    const created = (
      await request(app)
        .post('/api/v1/billing/subscribe')
        .set(idem())
        .send({ plan: 'starter' })
        .expect(201)
    ).body.data.subscription;
    expect(created).toMatchObject({ id: 'sub_mock_starter', plan: 'starter' });
    expect(created.shortUrl).toContain('rzp.io');

    // until the customer completes checkout, nothing changes
    expect((await request(app).get('/api/v1/billing').set(auth()).expect(200)).body.data.plan).toBe(
      'free',
    );

    await signedWebhook({
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: 'sub_mock_starter', current_end: 1_790_000_000 } } },
    }).expect(200);

    const billing = (await request(app).get('/api/v1/billing').set(auth()).expect(200)).body.data;
    expect(billing.plan).toBe('starter');
    expect(billing.status).toBe('active');
    expect(billing.limits.maxInvoicesMonth).toBe(500);
    expect(billing.limits.maxUsers).toBe(10);

    // the exact calls that 402'd now go through
    await createInvoice(idem()).expect(201);
    await request(app)
      .post(`/api/v1/companies/${companyId}/members`)
      .set({ Authorization: `Bearer ${ownerToken}` })
      .send({ email: 'newseat@spec.in', roleKey: 'accountant' })
      .expect(201);

    // replayed webhook is a no-op (state converges to the same place)
    await signedWebhook({
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: 'sub_mock_starter' } } },
    }).expect(200);
  });

  it('the nightly rollup meters org-wide usage into the subscription', async () => {
    await subscriptionService.rollupUsage(new Date());
    const sub = await Subscription.findOne({ organizationId: orgId }).lean();
    const month = new Date().toISOString().slice(0, 7);
    const usage = (sub!.usage as unknown as Record<string, { invoices: number }>)[month];
    expect(usage!.invoices).toBeGreaterThanOrEqual(3);
  });
});

describe('super-admin console + impersonation (§32 Phase 23)', () => {
  it('a non-super-admin is refused; the console lists organizations for the operator', async () => {
    await request(app)
      .get('/api/v1/admin/organizations')
      .set({ Authorization: `Bearer ${ownerToken}` })
      .expect(403);

    const list = (
      await request(app)
        .get('/api/v1/admin/organizations')
        .set({ Authorization: `Bearer ${adminToken}` })
        .expect(200)
    ).body.data.organizations;
    const row = list.find((o: { id: string }) => o.id === orgId);
    expect(row).toMatchObject({ plan: 'starter', companies: 1 });
  });

  it('impersonation is impossible without a written reason', async () => {
    await request(app)
      .post('/api/v1/admin/impersonate')
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ targetUserId: ownerUserId })
      .expect(422);
    await request(app)
      .post('/api/v1/admin/impersonate')
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ targetUserId: ownerUserId, reason: 'too short' })
      .expect(422);
  });

  it('every action during impersonation is tagged; ending the session kills the token', async () => {
    const { token, sessionId } = (
      await request(app)
        .post('/api/v1/admin/impersonate')
        .set({ Authorization: `Bearer ${adminToken}` })
        .send({ targetUserId: ownerUserId, reason: 'GH-1042: verify reported invoice-total bug' })
        .expect(201)
    ).body.data;

    // acting as the owner: draft AND issue an invoice — a ledger posting
    const draftRes = await createInvoice(idem(token)).expect(201);
    expect(draftRes.headers['x-impersonation-session']).toBe(sessionId);
    expect(draftRes.headers['x-impersonated-by']).toBe(adminUserId);
    const issueRes = await request(app)
      .post(`/api/v1/invoices/${draftRes.body.data.invoice.id}/issue`)
      .set(idem(token))
      .expect(201);
    expect(issueRes.headers['x-impersonation-session']).toBe(sessionId);

    // 1) the session's action log has every request
    const session = await ImpersonationSession.findById(sessionId).lean();
    expect(session!.reason).toContain('GH-1042');
    const paths = session!.actions.map((a) => `${a.method} ${a.path}`);
    expect(paths).toContain('POST /api/v1/invoices');
    expect(paths.some((p) => p.endsWith('/issue'))).toBe(true);

    // 2) the ledger audit row carries impersonatedBy
    const audit = await AuditLog.findOne({
      action: 'journal.posted',
      'meta.impersonatedBy': { $exists: true },
    })
      .setOptions({ skipTenantScope: true } as never)
      .lean();
    expect(String(audit!.meta!.impersonatedBy)).toBe(adminUserId);

    // 3) start was audited platform-side
    const started = await AdminAudit.findOne({ action: 'impersonation.started' }).lean();
    expect(started!.reason).toContain('GH-1042');
    expect(String(started!.adminUserId)).toBe(adminUserId);

    // 4) impersonation tokens cannot reach the admin console
    await request(app)
      .get('/api/v1/admin/organizations')
      .set({ Authorization: `Bearer ${token}` })
      .expect(403);

    // 5) ending the session kills the token IMMEDIATELY (before its 15-min exp)
    await request(app)
      .post(`/api/v1/admin/impersonate/${sessionId}/end`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .expect(200);
    await createInvoice(idem(token)).expect(401);
    const ended = await AdminAudit.findOne({ action: 'impersonation.ended' }).lean();
    expect(ended).toBeTruthy();
  });

  it('the operator can change a plan with a reason — audited', async () => {
    await request(app)
      .patch(`/api/v1/admin/organizations/${orgId}/plan`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ plan: 'professional', reason: 'support: annual deal closed offline' })
      .expect(200);
    const org = await Organization.findById(orgId).lean();
    expect(org!.plan).toBe('professional');
    expect(org!.limits.maxInvoicesMonth).toBe(5_000);
    const audit = await AdminAudit.findOne({ action: 'org.plan_changed' }).lean();
    expect(audit!.meta).toMatchObject({ from: 'starter', to: 'professional' });
  });
});
