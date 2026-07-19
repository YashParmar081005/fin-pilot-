/**
 * Phase 8 acceptance (plan.md §32):
 * - a bill posts input CGST/SGST to the right accounts (§12.2)
 * - an expense cannot be approved by its own submitter
 * Plus: inter-state input IGST, ITC-ineligible capitalisation, cancel
 * reversal, reject flow, duplicate vendor bill.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { getTestOutbox } from '../../src/services/mailService';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let ownerToken: string;
let accountantToken: string;
let companyId: string;
let accountIdByCode: Record<string, string> = {};
let vendorGujId: string;
let vendorMahId: string;

const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'X-Company-Id': companyId });
const idem = (t: string) => ({ ...auth(t), 'Idempotency-Key': randomUUID() });

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'be-owner@spec.in', password: 'be-spec-password1', name: 'BE Owner' })
    .expect(201);
  ownerToken = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'be-owner@spec.in', password: 'be-spec-password1' })
      .expect(200)
  ).body.data.accessToken;

  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ legalName: 'BE Spec Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;

  await request(app).post('/api/v1/accounts/import-template').set(auth(ownerToken)).expect(201);
  const accounts = await request(app).get('/api/v1/accounts').set(auth(ownerToken)).expect(200);
  accountIdByCode = Object.fromEntries(
    accounts.body.data.accounts.map((a: { code: string; id: string }) => [a.code, a.id]),
  );

  // second user: accountant (can approve) — invited and accepted
  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'be-acct@spec.in', password: 'be-spec-password1', name: 'BE Accountant' })
    .expect(201);
  accountantToken = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'be-acct@spec.in', password: 'be-spec-password1' })
      .expect(200)
  ).body.data.accessToken;
  await request(app)
    .post(`/api/v1/companies/${companyId}/members`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ email: 'be-acct@spec.in', roleKey: 'accountant' })
    .expect(201);
  const mail = [...getTestOutbox()].reverse().find((m) => m.to === 'be-acct@spec.in');
  const token = /token=([\w-]+\.[\w-]+\.[\w-]+)/.exec(mail!.text)![1]!;
  await request(app)
    .post('/api/v1/invites/accept')
    .set('Authorization', `Bearer ${accountantToken}`)
    .send({ token })
    .expect(200);

  const mkVendor = async (name: string, state: string) =>
    (
      await request(app)
        .post('/api/v1/parties')
        .set(auth(ownerToken))
        .send({
          type: ['vendor'],
          name,
          gstRegistrationType: 'regular',
          placeOfSupplyStateCode: state,
        })
        .expect(201)
    ).body.data.party.id;
  vendorGujId = await mkVendor('Gujarat Supplier', '24');
  vendorMahId = await mkVendor('Maharashtra Supplier', '27');
}, 120_000);

afterAll(async () => {
  await disconnectTestDb();
});

const TEN_K_LINE = { description: 'Raw material', qty: 1, ratePaise: 10_00_000, gstRate: 18 };

async function mkBill(
  partyId: string,
  lines: Array<Record<string, unknown>>,
  vendorBillNumber?: string,
) {
  const res = await request(app)
    .post('/api/v1/bills')
    .set(idem(ownerToken))
    .send({
      partyId,
      vendorBillNumber: vendorBillNumber ?? `VB-${randomUUID().slice(0, 8)}`,
      billDate: '2026-07-01',
      lines,
    })
    .expect(201);
  return res.body.data.bill;
}

describe('purchase bills (§12.2)', () => {
  it('intra-state approve: Dr 5110 + Dr input CGST 1150 + Dr input SGST 1151, Cr AP 2110', async () => {
    const bill = await mkBill(vendorGujId, [TEN_K_LINE]);
    expect(bill.cgstPaise).toBe(90_000);
    expect(bill.sgstPaise).toBe(90_000);
    expect(bill.igstPaise).toBe(0);

    const approved = (
      await request(app).post(`/api/v1/bills/${bill.id}/approve`).set(idem(ownerToken)).expect(201)
    ).body.data.bill;

    const entry = (
      await request(app)
        .get(`/api/v1/journal-entries/${approved.journalEntryId}`)
        .set(auth(ownerToken))
        .expect(200)
    ).body.data.entry;
    const by = (code: string) =>
      entry.lines.find((l: { accountId: string }) => l.accountId === accountIdByCode[code]);

    expect(by('5110')).toMatchObject({ debitPaise: 10_00_000 });
    expect(by('1150')).toMatchObject({ debitPaise: 90_000 }); // Input CGST
    expect(by('1151')).toMatchObject({ debitPaise: 90_000 }); // Input SGST
    expect(by('1152')).toBeUndefined(); // no IGST intra
    expect(by('2110')).toMatchObject({ creditPaise: 11_80_000 }); // AP
    expect(entry.totalDebitPaise).toBe(entry.totalCreditPaise);
  });

  it('inter-state: input IGST to 1152', async () => {
    const bill = await mkBill(vendorMahId, [TEN_K_LINE]);
    expect(bill.igstPaise).toBe(1_80_000);
    const approved = (
      await request(app).post(`/api/v1/bills/${bill.id}/approve`).set(idem(ownerToken)).expect(201)
    ).body.data.bill;
    const entry = (
      await request(app)
        .get(`/api/v1/journal-entries/${approved.journalEntryId}`)
        .set(auth(ownerToken))
        .expect(200)
    ).body.data.entry;
    const igstLine = entry.lines.find(
      (l: { accountId: string }) => l.accountId === accountIdByCode['1152'],
    );
    expect(igstLine).toMatchObject({ debitPaise: 1_80_000 });
  });

  it('ITC-ineligible tax capitalises into the expense — no input tax lines', async () => {
    const bill = await mkBill(vendorGujId, [{ ...TEN_K_LINE, itcEligible: false }]);
    const approved = (
      await request(app).post(`/api/v1/bills/${bill.id}/approve`).set(idem(ownerToken)).expect(201)
    ).body.data.bill;
    const entry = (
      await request(app)
        .get(`/api/v1/journal-entries/${approved.journalEntryId}`)
        .set(auth(ownerToken))
        .expect(200)
    ).body.data.entry;
    const by = (code: string) =>
      entry.lines.find((l: { accountId: string }) => l.accountId === accountIdByCode[code]);
    expect(by('5110')).toMatchObject({ debitPaise: 11_80_000 }); // cost incl. tax
    expect(by('1150')).toBeUndefined();
    expect(by('1151')).toBeUndefined();
  });

  it('cancel reverses; the same vendor bill number cannot be recorded twice', async () => {
    const bill = await mkBill(vendorGujId, [TEN_K_LINE], 'VB-DUP-1');
    await request(app).post(`/api/v1/bills/${bill.id}/approve`).set(idem(ownerToken)).expect(201);
    const cancelled = (
      await request(app)
        .post(`/api/v1/bills/${bill.id}/cancel`)
        .set(idem(ownerToken))
        .send({ reason: 'wrong vendor' })
        .expect(200)
    ).body.data.bill;
    expect(cancelled.status).toBe('cancelled');

    await request(app)
      .post('/api/v1/bills')
      .set(idem(ownerToken))
      .send({
        partyId: vendorGujId,
        vendorBillNumber: 'VB-DUP-1',
        billDate: '2026-07-01',
        lines: [TEN_K_LINE],
      })
      .expect(409); // duplicate vendor bill = double-payment risk
  });
});

describe('expense approval state machine', () => {
  async function submitExpense(token: string) {
    const res = await request(app)
      .post('/api/v1/expenses')
      .set(idem(token))
      .send({
        date: '2026-07-01',
        amountPaise: 2_50_000,
        expenseAccountId: accountIdByCode['5350'], // Travel and Conveyance
        description: 'Client visit — Ahmedabad',
      })
      .expect(201);
    return res.body.data.expense;
  }

  it('an expense cannot be approved by its own submitter', async () => {
    const expense = await submitExpense(ownerToken);
    const res = await request(app)
      .post(`/api/v1/expenses/${expense.id}/approve`)
      .set(idem(ownerToken)) // same user — even the org owner
      .expect(403);
    expect(res.body.error.code).toBe('DOC_SELF_APPROVAL_FORBIDDEN');
  });

  it('a different approver approves; the GL entry posts Dr expense / Cr 2160', async () => {
    const expense = await submitExpense(ownerToken);
    const approved = (
      await request(app)
        .post(`/api/v1/expenses/${expense.id}/approve`)
        .set(idem(accountantToken))
        .expect(201)
    ).body.data.expense;
    expect(approved.status).toBe('approved');

    const entry = (
      await request(app)
        .get(`/api/v1/journal-entries/${approved.journalEntryId}`)
        .set(auth(ownerToken))
        .expect(200)
    ).body.data.entry;
    const by = (code: string) =>
      entry.lines.find((l: { accountId: string }) => l.accountId === accountIdByCode[code]);
    expect(by('5350')).toMatchObject({ debitPaise: 2_50_000 });
    expect(by('2160')).toMatchObject({ creditPaise: 2_50_000 });

    // double approve → 409
    await request(app)
      .post(`/api/v1/expenses/${expense.id}/approve`)
      .set(idem(accountantToken))
      .expect(409);
  });

  it('reject requires a different user too, and ends the machine', async () => {
    const expense = await submitExpense(ownerToken);
    await request(app)
      .post(`/api/v1/expenses/${expense.id}/reject`)
      .set(auth(ownerToken))
      .send({ reason: 'own claim' })
      .expect(403);
    const rejected = (
      await request(app)
        .post(`/api/v1/expenses/${expense.id}/reject`)
        .set(auth(accountantToken))
        .send({ reason: 'no receipts' })
        .expect(200)
    ).body.data.expense;
    expect(rejected.status).toBe('rejected');
    await request(app)
      .post(`/api/v1/expenses/${expense.id}/approve`)
      .set(idem(accountantToken))
      .expect(409);
  });
});
