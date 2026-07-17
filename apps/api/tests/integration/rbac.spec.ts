/**
 * Phase 3 acceptance — RBAC, invite flow, permission cache (plan.md §32):
 * - org auto-created with the first company; owner membership active
 * - plan limit: a second company on the free plan → 402
 * - invite → authenticate → accept; the bare token grants nothing
 * - authorize() enforces the §2.1 matrix per route
 * - changing a role invalidates the permission cache within one second
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../src/server';
import { getTestOutbox } from '../../src/services/mailService';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');
});

afterAll(async () => {
  await disconnectTestDb();
});

const PASSWORD = 'rbac-spec-password-1';

async function registerAndLogin(email: string, name: string): Promise<string> {
  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: PASSWORD, name })
    .expect(201);
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return res.body.data.accessToken as string;
}

const COMPANY_BODY = {
  legalName: 'Vadodara Textiles Pvt Ltd',
  stateCode: '24',
  gstin: '24AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  booksBeginDate: '2026-04-01',
};

let ownerToken: string;
let accountantToken: string;
let outsiderToken: string;
let companyId: string;

describe('company creation and the implicit organization', () => {
  it('creates org + system roles + owner membership with the first company', async () => {
    ownerToken = await registerAndLogin('owner@rbac.in', 'Owner');

    const res = await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(COMPANY_BODY)
      .expect(201);
    companyId = res.body.data.company.id;
    expect(res.body.data.company.legalName).toBe(COMPANY_BODY.legalName);

    const list = await request(app)
      .get('/api/v1/companies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(list.body.data.companies).toHaveLength(1);
    expect(list.body.data.companies[0].role.key).toBe('owner');
  });

  it('free plan: a second company returns 402 SYS_PLAN_LIMIT_EXCEEDED', async () => {
    const res = await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...COMPANY_BODY, legalName: 'Second Company Ltd' })
      .expect(402);
    expect(res.body.error.code).toBe('SYS_PLAN_LIMIT_EXCEEDED');
  });

  it('company creation requires authentication', async () => {
    await request(app).post('/api/v1/companies').send(COMPANY_BODY).expect(401);
  });
});

describe('the invite flow (§17.3)', () => {
  it('owner invites an accountant; the invitee accepts after authenticating', async () => {
    accountantToken = await registerAndLogin('accountant@rbac.in', 'Accountant');

    await request(app)
      .post(`/api/v1/companies/${companyId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'accountant@rbac.in', roleKey: 'accountant' })
      .expect(201);

    const mail = [...getTestOutbox()].reverse().find((m) => m.to === 'accountant@rbac.in');
    expect(mail).toBeDefined();
    const token = /token=([\w-]+\.[\w-]+\.[\w-]+)/.exec(mail!.text)![1]!;

    await request(app)
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({ token })
      .expect(200);

    const list = await request(app)
      .get('/api/v1/companies')
      .set('Authorization', `Bearer ${accountantToken}`)
      .expect(200);
    expect(list.body.data.companies[0].role.key).toBe('accountant');
  });

  it('an invite token used by the WRONG account is rejected', async () => {
    outsiderToken = await registerAndLogin('outsider@rbac.in', 'Outsider');

    await request(app)
      .post(`/api/v1/companies/${companyId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'someone-else@rbac.in', roleKey: 'employee' })
      .expect(201);
    const mail = [...getTestOutbox()].reverse().find((m) => m.to === 'someone-else@rbac.in');
    const token = /token=([\w-]+\.[\w-]+\.[\w-]+)/.exec(mail!.text)![1]!;

    const res = await request(app)
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ token })
      .expect(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });

  it('a garbage invite token → TENANT_INVITE_INVALID', async () => {
    const res = await request(app)
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ token: 'aaaaaaaa.bbbbbbbb.cccccccc' })
      .expect(401);
    expect(res.body.error.code).toBe('TENANT_INVITE_INVALID');
  });
});

describe('authorize() and tenant membership (§17.4)', () => {
  it('a non-member gets TENANT_NOT_A_MEMBER on tenant routes', async () => {
    const res = await request(app)
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ tradeName: 'Hacked' })
      .expect(403);
    expect(res.body.error.code).toBe('TENANT_NOT_A_MEMBER');
  });

  it('an accountant lacks company:update → 403 with the required permission', async () => {
    const res = await request(app)
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({ tradeName: 'Nope' })
      .expect(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    expect(res.body.error.details.required).toBe('company:update');
  });

  it('the owner can update the company', async () => {
    const res = await request(app)
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tradeName: 'VT Textiles' })
      .expect(200);
    expect(res.body.data.company.tradeName).toBe('VT Textiles');
  });
});

describe('permission cache invalidation (Phase 3 "Done when")', () => {
  it('a role change takes effect within one second', async () => {
    // accountant cannot list members (lacks user:invite)
    await request(app)
      .get(`/api/v1/companies/${companyId}/members`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .expect(403);

    // owner promotes accountant → company_admin
    const list = await request(app)
      .get(`/api/v1/companies/${companyId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const target = list.body.data.members.find(
      (m: { email: string }) => m.email === 'accountant@rbac.in',
    );

    const promoted = process.hrtime.bigint();
    await request(app)
      .patch(`/api/v1/companies/${companyId}/members/${target.userId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ roleKey: 'company_admin' })
      .expect(200);

    // the VERY NEXT request must see the new permissions
    await request(app)
      .get(`/api/v1/companies/${companyId}/members`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .expect(200);
    const elapsedMs = Number(process.hrtime.bigint() - promoted) / 1e6;
    expect(elapsedMs).toBeLessThan(1_000);

    // and a demotion is equally immediate — the warmed cache is dropped
    await request(app)
      .patch(`/api/v1/companies/${companyId}/members/${target.userId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ roleKey: 'auditor' })
      .expect(200);
    await request(app)
      .get(`/api/v1/companies/${companyId}/members`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .expect(403);
  });

  it('the org owner’s membership cannot be modified', async () => {
    const list = await request(app)
      .get(`/api/v1/companies/${companyId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const owner = list.body.data.members.find((m: { roleKey: string }) => m.roleKey === 'owner');

    const res = await request(app)
      .patch(`/api/v1/companies/${companyId}/members/${owner.userId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'suspended' })
      .expect(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });
});
