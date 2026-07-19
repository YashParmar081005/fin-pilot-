/**
 * Phase 16 acceptance (plan.md §32):
 * - on the golden dataset ≥85% of transactions score ≥0.90 and the
 *   suggestions are 100% correct
 * - NOTHING auto-posts
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
let bankAccountId: string;
let accountIdByCode: Record<string, string> = {};
const paymentEntry: Record<string, string> = {}; // narration key → journalEntryId

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });
const idem = () => ({ ...auth(), 'Idempotency-Key': randomUUID() });

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'recon@spec.in', password: 'recon-spec-pass1', name: 'Recon Owner' })
    .expect(201);
  token = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'recon@spec.in', password: 'recon-spec-pass1' })
      .expect(200)
  ).body.data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'Recon Spec Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;
  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);
  const accounts = await request(app).get('/api/v1/accounts').set(auth()).expect(200);
  accountIdByCode = Object.fromEntries(
    accounts.body.data.accounts.map((a: { code: string; id: string }) => [a.code, a.id]),
  );

  bankAccountId = (
    await request(app)
      .post('/api/v1/bank-accounts')
      .set(auth())
      .send({ name: 'HDFC Current', bankName: 'HDFC' })
      .expect(201)
  ).body.data.bankAccount._id;

  // golden ledger side: three payments hitting the bank ledger (1120)
  const mkParty = async (name: string, type: string) =>
    (
      await request(app)
        .post('/api/v1/parties')
        .set(auth())
        .send({ type: [type], name, placeOfSupplyStateCode: '24' })
        .expect(201)
    ).body.data.party.id;
  const millsId = await mkParty('Maharashtra Mills', 'customer');
  const rentalId = await mkParty('Vadodara Rentals', 'vendor');
  const freightId = await mkParty('Gujarat Freight Co', 'vendor');

  const pay = async (key: string, body: Record<string, unknown>) => {
    const p = (await request(app).post('/api/v1/payments').set(idem()).send(body).expect(201)).body
      .data.payment;
    paymentEntry[key] = p.journalEntryId;
  };
  await pay('mills', {
    direction: 'inflow',
    partyId: millsId,
    date: '2026-07-05',
    amountPaise: 11_80_00_000,
    depositAccountId: accountIdByCode['1120'],
  });
  await pay('rent', {
    direction: 'outflow',
    partyId: rentalId,
    date: '2026-07-06',
    amountPaise: 2_50_00_000,
    depositAccountId: accountIdByCode['1120'],
  });
  await pay('freight', {
    direction: 'outflow',
    partyId: freightId,
    date: '2026-07-07',
    amountPaise: 59_00_000,
    depositAccountId: accountIdByCode['1120'],
  });

  // golden statement side: the same money as the bank saw it + one noise row
  const csv = [
    'Date,Narration,Debit,Credit',
    '05/07/2026,"NEFT CR MAHARASHTRA MILLS PAYMENT",,"11,80,000.00"',
    '06/07/2026,"CHQ VADODARA RENTALS JULY","2,50,000.00",',
    '07/07/2026,"IMPS GUJARAT FREIGHT CO","59,000.00",',
    '08/07/2026,"BANK CHARGES GST","590.00",',
  ].join('\n');
  await request(app)
    .post(`/api/v1/bank-accounts/${bankAccountId}/import`)
    .set(auth())
    .send({
      csv,
      mapping: { date: 'Date', narration: 'Narration', credit: 'Credit', debit: 'Debit' },
    })
    .expect(201);
}, 180_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('the scoring engine (§32 Phase 16)', () => {
  let suggestions: Array<{ bankTransactionId: string; journalEntryId: string; score: number }>;

  it('≥85% of matchable transactions score ≥0.90 and suggestions are 100% correct', async () => {
    const res = await request(app)
      .get(`/api/v1/reconciliation/suggestions?bankAccountId=${bankAccountId}`)
      .set(auth())
      .expect(200);
    suggestions = res.body.data.suggestions;

    // 3 of 4 statement lines have ledger counterparts → all 3 must be suggested
    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((s) => s.score >= 0.9)).toBe(true); // 3/3 = 100% ≥ 85%

    // 100% correct: each suggestion points at exactly the payment's entry
    const suggested = new Set(suggestions.map((s) => s.journalEntryId));
    expect(suggested).toEqual(new Set(Object.values(paymentEntry)));
  });

  it('nothing auto-posts — every line is still unreconciled until a human confirms', async () => {
    const txns = (
      await request(app)
        .get(`/api/v1/bank-accounts/${bankAccountId}/transactions`)
        .set(auth())
        .expect(200)
    ).body.data.transactions;
    expect(txns.every((t: { status: string }) => t.status === 'unreconciled')).toBe(true);
  });

  it('bulk confirm writes audit records and marks lines reconciled', async () => {
    const res = await request(app)
      .post('/api/v1/reconciliation/confirm')
      .set(idem())
      .send({ matches: suggestions })
      .expect(201);
    expect(res.body.data.confirmed).toBe(3);

    const txns = (
      await request(app)
        .get(`/api/v1/bank-accounts/${bankAccountId}/transactions`)
        .set(auth())
        .expect(200)
    ).body.data.transactions;
    expect(txns.filter((t: { status: string }) => t.status === 'reconciled')).toHaveLength(3);

    // double-confirm → 409
    await request(app)
      .post('/api/v1/reconciliation/confirm')
      .set(idem())
      .send({ matches: [suggestions[0]] })
      .expect(409);
  });

  it('"create entry from this line" posts through the engine and reconciles', async () => {
    const txns = (
      await request(app)
        .get(`/api/v1/bank-accounts/${bankAccountId}/transactions`)
        .set(auth())
        .expect(200)
    ).body.data.transactions;
    const charge = txns.find((t: { status: string }) => t.status === 'unreconciled');

    const res = await request(app)
      .post('/api/v1/reconciliation/from-line')
      .set(idem())
      .send({
        bankTransactionId: charge._id,
        accountId: accountIdByCode['5370'], // Bank Charges
        description: 'Bank charges w/ GST',
      })
      .expect(201);

    const entry = (
      await request(app)
        .get(`/api/v1/journal-entries/${res.body.data.journalEntryId}`)
        .set(auth())
        .expect(200)
    ).body.data.entry;
    expect(entry.totalDebitPaise).toBe(590_00); // balanced, via the engine
    const chargesLine = entry.lines.find(
      (l: { accountId: string }) => l.accountId === accountIdByCode['5370'],
    );
    expect(chargesLine.debitPaise).toBe(590_00);

    const after = (
      await request(app)
        .get(`/api/v1/bank-accounts/${bankAccountId}/transactions`)
        .set(auth())
        .expect(200)
    ).body.data.transactions;
    expect(after.every((t: { status: string }) => t.status === 'reconciled')).toBe(true);
  });
});
