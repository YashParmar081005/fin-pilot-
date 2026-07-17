/**
 * Phase 4 acceptance (plan.md §32):
 * - a system account cannot be deleted
 * - the tree renders 60 accounts (seed produces exactly 60, idempotently)
 * - `path` is correct after a reparent (whole subtree rewritten)
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let token: string;
let companyId: string;

interface AccountDto {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  path: string;
  depth: number;
  isSystem: boolean;
}

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });

async function listAccounts(): Promise<AccountDto[]> {
  const res = await request(app).get('/api/v1/accounts').set(auth()).expect(200);
  return res.body.data.accounts as AccountDto[];
}

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'coa@spec.in', password: 'coa-spec-password', name: 'COA Owner' })
    .expect(201);
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'coa@spec.in', password: 'coa-spec-password' })
    .expect(200);
  token = login.body.data.accessToken;

  const company = await request(app)
    .post('/api/v1/companies')
    .set('Authorization', `Bearer ${token}`)
    .send({ legalName: 'COA Spec Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
    .expect(201);
  companyId = company.body.data.company.id;
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('the Indian SME COA seed', () => {
  it('seeds exactly 60 system-flagged accounts', async () => {
    const res = await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);
    expect(res.body.data.created).toBe(60);

    const accounts = await listAccounts();
    expect(accounts).toHaveLength(60);
    expect(accounts.every((a) => a.isSystem)).toBe(true);
  });

  it('re-seeding is idempotent — still 60', async () => {
    const res = await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);
    expect(res.body.data.created).toBe(0);
    expect(res.body.data.existing).toBe(60);
    expect(await listAccounts()).toHaveLength(60);
  });

  it('every path is parent.path + "/" + code, depth matches', async () => {
    const accounts = await listAccounts();
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const account of accounts) {
      if (account.parentId) {
        const parent = byId.get(account.parentId)!;
        expect(account.path).toBe(`${parent.path}/${account.code}`);
        expect(account.depth).toBe(parent.depth + 1);
      } else {
        expect(account.path).toBe(`/${account.code}`);
        expect(account.depth).toBe(0);
      }
    }
  });
});

describe('deletion rules', () => {
  it('a system account cannot be deleted', async () => {
    const accounts = await listAccounts();
    const cash = accounts.find((a) => a.code === '1110')!;
    const res = await request(app).delete(`/api/v1/accounts/${cash.id}`).set(auth()).expect(403);
    expect(res.body.error.code).toBe('COA_SYSTEM_ACCOUNT_IMMUTABLE');
    expect(await listAccounts()).toHaveLength(60);
  });

  it('an account with children cannot be deleted', async () => {
    const accounts = await listAccounts();
    const parent = accounts.find((a) => a.code === '1100')!;
    // even if it were not system, children block deletion — create a custom
    // parent/child pair to prove the child rule alone
    await request(app)
      .post('/api/v1/accounts')
      .set(auth())
      .send({ code: '6000', name: 'Custom Group', type: 'expense', subType: 'other_expense' })
      .expect(201);
    const custom = await request(app)
      .post('/api/v1/accounts')
      .set(auth())
      .send({
        code: '6100',
        name: 'Custom Child',
        type: 'expense',
        subType: 'other_expense',
        parentId: (await listAccounts()).find((a) => a.code === '6000')!.id,
      })
      .expect(201);
    expect(custom.body.data.account.path).toBe('/6000/6100');

    const group = (await listAccounts()).find((a) => a.code === '6000')!;
    const blocked = await request(app)
      .delete(`/api/v1/accounts/${group.id}`)
      .set(auth())
      .expect(409);
    expect(blocked.body.error.code).toBe('COA_HAS_CHILDREN');
    expect(parent.isSystem).toBe(true);
  });

  it('a custom leaf CAN be deleted', async () => {
    const child = (await listAccounts()).find((a) => a.code === '6100')!;
    await request(app).delete(`/api/v1/accounts/${child.id}`).set(auth()).expect(200);
    expect((await listAccounts()).find((a) => a.code === '6100')).toBeUndefined();
  });
});

describe('reparenting (materialised path)', () => {
  it('moving a node rewrites its own and every descendant path', async () => {
    // build: /7000, /7000/7100, /7000/7100/7110
    const mk = async (code: string, parentCode: string | null) => {
      const parentId = parentCode
        ? (await listAccounts()).find((a) => a.code === parentCode)!.id
        : undefined;
      const res = await request(app)
        .post('/api/v1/accounts')
        .set(auth())
        .send({
          code,
          name: `Node ${code}`,
          type: 'expense',
          subType: 'other_expense',
          ...(parentId ? { parentId } : {}),
        })
        .expect(201);
      return res.body.data.account as AccountDto;
    };
    await mk('7000', null);
    const mid = await mk('7100', '7000');
    const leaf = await mk('7110', '7100');
    expect(leaf.path).toBe('/7000/7100/7110');

    // move 7100 (with its child) under the system expense group 5000
    const target = (await listAccounts()).find((a) => a.code === '5000')!;
    const moved = await request(app)
      .patch(`/api/v1/accounts/${mid.id}`)
      .set(auth())
      .send({ parentId: target.id })
      .expect(200);
    expect(moved.body.data.account.path).toBe('/5000/7100');
    expect(moved.body.data.account.depth).toBe(1);

    const after = await listAccounts();
    expect(after.find((a) => a.code === '7110')!.path).toBe('/5000/7100/7110');
    expect(after.find((a) => a.code === '7110')!.depth).toBe(2);
  });

  it('a cycle (moving under your own subtree) is rejected', async () => {
    const accounts = await listAccounts();
    const mid = accounts.find((a) => a.code === '7100')!;
    const leaf = accounts.find((a) => a.code === '7110')!;
    const res = await request(app)
      .patch(`/api/v1/accounts/${mid.id}`)
      .set(auth())
      .send({ parentId: leaf.id })
      .expect(422);
    expect(res.body.error.code).toBe('COA_REPARENT_CYCLE');
  });

  it('a system account cannot be reparented', async () => {
    const accounts = await listAccounts();
    const cash = accounts.find((a) => a.code === '1110')!;
    const expenses = accounts.find((a) => a.code === '5000')!;
    const res = await request(app)
      .patch(`/api/v1/accounts/${cash.id}`)
      .set(auth())
      .send({ parentId: expenses.id })
      .expect(403);
    expect(res.body.error.code).toBe('COA_SYSTEM_ACCOUNT_IMMUTABLE');
  });
});

describe('validation and tenancy', () => {
  it('rejects a subType from the wrong type family', async () => {
    const res = await request(app)
      .post('/api/v1/accounts')
      .set(auth())
      .send({ code: '8000', name: 'Bad', type: 'income', subType: 'cash' })
      .expect(422);
    expect(res.body.error.code).toBe('SYS_VALIDATION_FAILED');
  });

  it('duplicate code in the same company → 409', async () => {
    const res = await request(app)
      .post('/api/v1/accounts')
      .set(auth())
      .send({ code: '1110', name: 'Dup Cash', type: 'asset', subType: 'cash' })
      .expect(409);
    expect(res.body.error.code).toBe('SYS_DUPLICATE_KEY');
  });

  it('another tenant sees none of these accounts', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'other@spec.in', password: 'other-spec-pass1', name: 'Other' })
      .expect(201);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'other@spec.in', password: 'other-spec-pass1' })
      .expect(200);
    const otherToken = login.body.data.accessToken as string;
    const other = await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ legalName: 'Other Co', stateCode: '27', booksBeginDate: '2026-04-01' })
      .expect(201);

    // their own book is empty…
    const theirs = await request(app)
      .get('/api/v1/accounts')
      .set({
        Authorization: `Bearer ${otherToken}`,
        'X-Company-Id': other.body.data.company.id,
      })
      .expect(200);
    expect(theirs.body.data.accounts).toHaveLength(0);

    // …and pointing X-Company-Id at OUR company is rejected outright
    const res = await request(app)
      .get('/api/v1/accounts')
      .set({ Authorization: `Bearer ${otherToken}`, 'X-Company-Id': companyId })
      .expect(403);
    expect(res.body.error.code).toBe('TENANT_NOT_A_MEMBER');
  });

  it('missing X-Company-Id → TENANT_COMPANY_CONTEXT_REQUIRED', async () => {
    const res = await request(app)
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.error.code).toBe('TENANT_COMPANY_CONTEXT_REQUIRED');
  });
});
