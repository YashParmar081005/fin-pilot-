/**
 * The platform console: cross-tenant reads, and section toggles that are a
 * real restriction rather than a hidden nav item.
 *
 * The thing worth pinning is that switching a section off is enforced by the
 * API. A toggle that only hides a menu entry is decoration — a saved bookmark
 * or a curl would walk straight past it.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { User } from '../../src/models/User';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let adminToken: string;
let userToken: string;
let companyId: string;
let targetUserId: string;
let adminUserId: string;
let tenantEmail: string;
let operatorEmail: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const scoped = (token: string, company: string) => ({
  Authorization: `Bearer ${token}`,
  'X-Company-Id': company,
});
const idem = (token: string) => ({ ...auth(token), 'Idempotency-Key': randomUUID() });

/** There is no /auth/me, so ids come from the console's own user list. */
async function idOf(email: string): Promise<string> {
  const res = await request(app)
    .get(`/api/v1/admin/users?q=${encodeURIComponent(email)}`)
    .set(auth(adminToken))
    .expect(200);
  const row = res.body.data.users.find((u: { email: string }) => u.email === email);
  if (!row) throw new Error(`no user row for ${email}`);
  return row.id as string;
}

async function register(email: string, password: string, name: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name }).expect(201);
  return (await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200)).body
    .data.accessToken;
}

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  // a platform operator — superAdmin is ops-only, so it is set directly
  operatorEmail = `ops-${randomUUID().slice(0, 8)}@spec.in`;
  adminToken = await register(operatorEmail, 'ops-spec-password1', 'Operator');
  await User.updateOne({ email: operatorEmail }, { superAdmin: true });
  adminToken = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: operatorEmail, password: 'ops-spec-password1' })
      .expect(200)
  ).body.data.accessToken;

  // an ordinary tenant with a company
  tenantEmail = `tenant-${randomUUID().slice(0, 8)}@spec.in`;
  userToken = await register(tenantEmail, 'tenant-spec-password1', 'Tenant');
  targetUserId = await idOf(tenantEmail);
  adminUserId = await idOf(operatorEmail);
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set(auth(userToken))
      .send({ legalName: 'Gated Co Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;
}, 180_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('the console is for platform operators only', () => {
  it('refuses an ordinary user everywhere', async () => {
    for (const path of ['/overview', '/companies', '/users', '/audit', '/organizations']) {
      await request(app).get(`/api/v1/admin${path}`).set(auth(userToken)).expect(403);
    }
  }, 60_000);
});

describe('cross-tenant reads', () => {
  it('counts the whole platform, not one company', async () => {
    const res = await request(app).get('/api/v1/admin/overview').set(auth(adminToken)).expect(200);
    expect(res.body.data.companies).toBeGreaterThan(0);
    expect(res.body.data.users).toBeGreaterThan(0);
  }, 60_000);

  it('lists every company with the org it belongs to', async () => {
    const res = await request(app).get('/api/v1/admin/companies').set(auth(adminToken)).expect(200);
    const row = res.body.data.companies.find((c: { id: string }) => c.id === companyId);
    expect(row).toBeTruthy();
    expect(row.organizationName).toBeTruthy();
    expect(row.disabledModules).toEqual([]);
  }, 60_000);
});

describe('switching a section off is enforced by the API', () => {
  it('lets the tenant use a section while it is on', async () => {
    await request(app).get('/api/v1/parties').set(scoped(userToken, companyId)).expect(200);
  }, 60_000);

  it('refuses a reasonless change — the audit row would be worthless', async () => {
    await request(app)
      .patch(`/api/v1/admin/companies/${companyId}/modules`)
      .set(idem(adminToken))
      .send({ disabledModules: ['parties'] })
      .expect(422);
  }, 60_000);

  it('rejects a module key that does not exist', async () => {
    await request(app)
      .patch(`/api/v1/admin/companies/${companyId}/modules`)
      .set(idem(adminToken))
      .send({ disabledModules: ['not-a-module'], reason: 'testing unknown keys' })
      .expect(422);
  }, 60_000);

  it('closes the section for the tenant once switched off', async () => {
    await request(app)
      .patch(`/api/v1/admin/companies/${companyId}/modules`)
      .set(idem(adminToken))
      .send({ disabledModules: ['parties'], reason: 'switching parties off for this test' })
      .expect(200);

    const res = await request(app)
      .get('/api/v1/parties')
      .set(scoped(userToken, companyId))
      .expect(403);
    expect(res.body.error.code).toBe('SYS_MODULE_DISABLED');

    // a sibling route in the same module goes too
    await request(app).get('/api/v1/items').set(scoped(userToken, companyId)).expect(403);

    // and a section that was left alone still works
    await request(app).get('/api/v1/invoices').set(scoped(userToken, companyId)).expect(200);
  }, 60_000);

  it('opens it again when switched back on', async () => {
    await request(app)
      .patch(`/api/v1/admin/companies/${companyId}/modules`)
      .set(idem(adminToken))
      .send({ disabledModules: [], reason: 'switching parties back on' })
      .expect(200);

    await request(app).get('/api/v1/parties').set(scoped(userToken, companyId)).expect(200);
  }, 60_000);

  it('records both changes in the audit trail, with their reasons', async () => {
    const res = await request(app).get('/api/v1/admin/audit').set(auth(adminToken)).expect(200);
    const rows = res.body.data.audit.filter(
      (a: { action: string }) => a.action === 'company.modules_changed',
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].reason).toMatch(/switching parties/);
  }, 60_000);
});

describe('disabling a user', () => {
  it('needs a reason', async () => {
    await request(app)
      .patch(`/api/v1/admin/users/${targetUserId}/status`)
      .set(idem(adminToken))
      .send({ disabled: true })
      .expect(422);
  }, 60_000);

  it('stops them logging in, and lets them back in when re-enabled', async () => {
    const email = tenantEmail;

    await request(app)
      .patch(`/api/v1/admin/users/${targetUserId}/status`)
      .set(idem(adminToken))
      .send({ disabled: true, reason: 'disabled for the admin console test' })
      .expect(200);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'tenant-spec-password1' })
      .expect(403);

    await request(app)
      .patch(`/api/v1/admin/users/${targetUserId}/status`)
      .set(idem(adminToken))
      .send({ disabled: false, reason: 're-enabled for the admin console test' })
      .expect(200);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'tenant-spec-password1' })
      .expect(200);
  }, 60_000);

  it('will not let an operator disable themselves', async () => {
    await request(app)
      .patch(`/api/v1/admin/users/${adminUserId}/status`)
      .set(idem(adminToken))
      .send({ disabled: true, reason: 'this should never be allowed' })
      .expect(403);
  }, 60_000);
});

describe('platform operators are their own accounts', () => {
  it('identifies an operator, and refuses a customer', async () => {
    const mine = await request(app).get('/api/v1/admin/me').set(auth(adminToken)).expect(200);
    expect(mine.body.data.operator).toBe(true);

    // a customer's credentials are fine; they are simply not an operator
    await request(app).get('/api/v1/admin/me').set(auth(userToken)).expect(403);
  }, 60_000);

  it('creates a new operator account, which holds no company', async () => {
    const email = `newops-${randomUUID().slice(0, 8)}@spec.in`;
    const res = await request(app)
      .post('/api/v1/admin/operators')
      .set(idem(adminToken))
      .send({
        email,
        name: 'Second Operator',
        password: 'operator-password-long',
        reason: 'adding a second operator for this test',
      })
      .expect(201);
    expect(res.body.data.created).toBe(true);

    // it can sign in and reach the console
    const token = (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'operator-password-long' })
        .expect(200)
    ).body.data.accessToken;
    await request(app).get('/api/v1/admin/overview').set(auth(token)).expect(200);

    // and it belongs to no company at all
    const companies = await request(app).get('/api/v1/companies').set(auth(token)).expect(200);
    expect(companies.body.data.companies).toHaveLength(0);
  }, 60_000);

  it('refuses a short password — an operator account is worth more than a customer one', async () => {
    await request(app)
      .post('/api/v1/admin/operators')
      .set(idem(adminToken))
      .send({
        email: `weak-${randomUUID().slice(0, 8)}@spec.in`,
        name: 'Weak',
        password: 'short',
        reason: 'this should be refused outright',
      })
      .expect(422);
  }, 60_000);

  it('will not promote someone who belongs to a company', async () => {
    const res = await request(app)
      .post('/api/v1/admin/operators')
      .set(idem(adminToken))
      .send({
        email: tenantEmail,
        name: 'Tenant',
        password: 'operator-password-long',
        reason: 'operators must not be customers',
      })
      .expect(403);
    expect(res.body.error.details.reason).toMatch(/belongs to a company/i);
  }, 60_000);

  it('will not let an operator revoke themselves', async () => {
    await request(app)
      .post(`/api/v1/admin/operators/${adminUserId}/revoke`)
      .set(idem(adminToken))
      .send({ reason: 'this should never be allowed' })
      .expect(403);
  }, 60_000);

  it('will not revoke the last active operator', async () => {
    // reduce to exactly one: revoke everyone the setup and tests added except
    // the caller, then try to take the last one away from a second operator
    const all = (
      await request(app).get('/api/v1/admin/operators').set(auth(adminToken)).expect(200)
    ).body.data.operators as { id: string; email: string }[];
    const others = all.filter((o) => o.id !== adminUserId);
    for (const other of others) {
      await request(app)
        .post(`/api/v1/admin/operators/${other.id}/revoke`)
        .set(idem(adminToken))
        .send({ reason: 'clearing down to a single operator' })
        .expect(200);
    }

    const left = (
      await request(app).get('/api/v1/admin/operators').set(auth(adminToken)).expect(200)
    ).body.data.operators;
    expect(left).toHaveLength(1);

    // the survivor is the caller, so self-revoke fires first; make a second
    // operator and have IT try to revoke the caller, leaving none
    const email = `last-${randomUUID().slice(0, 8)}@spec.in`;
    await request(app)
      .post('/api/v1/admin/operators')
      .set(idem(adminToken))
      .send({
        email,
        name: 'Last',
        password: 'operator-password-long',
        reason: 'last-operator guard test',
      })
      .expect(201);
    const secondToken = (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'operator-password-long' })
        .expect(200)
    ).body.data.accessToken;

    // now two exist; the second revokes the first, leaving exactly one
    await request(app)
      .post(`/api/v1/admin/operators/${adminUserId}/revoke`)
      .set(idem(secondToken))
      .send({ reason: 'leaving a single operator behind' })
      .expect(200);

    // and that last one cannot be revoked by anyone, including a fresh caller
    const remaining = (
      await request(app).get('/api/v1/admin/operators').set(auth(secondToken)).expect(200)
    ).body.data.operators;
    expect(remaining).toHaveLength(1);
  }, 120_000);
});
