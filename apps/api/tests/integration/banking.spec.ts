/**
 * Phase 15 acceptance (plan.md §32):
 * - importing the same statement twice creates ZERO duplicate rows
 * - an AA sandbox consent completes and pulls transactions
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { MockAaClient, setAaClient } from '../../src/services/bankingService';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let token: string;
let companyId: string;
let bankAccountId: string;
const aa = new MockAaClient();

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });

const HDFC_CSV = [
  'Txn Date,Description,Debit,Credit,Ref',
  '05/07/2026,"NEFT CR MAHARASHTRA MILLS",,"11,80,000.00",UTR123',
  '06/07/2026,"CHQ PAID RENT JULY","2,50,000.00",,CHQ88',
  '07/07/2026,"UPI VENDOR PAYMENT","59,000.00",,UPI99',
].join('\n');

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');
  setAaClient(aa);

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'bank@spec.in', password: 'bank-spec-password1', name: 'Bank Owner' })
    .expect(201);
  token = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bank@spec.in', password: 'bank-spec-password1' })
      .expect(200)
  ).body.data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'Bank Spec Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;
  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);

  bankAccountId = (
    await request(app)
      .post('/api/v1/bank-accounts')
      .set(auth())
      .send({ name: 'HDFC Current 1234', bankName: 'HDFC', accountNumberMasked: 'XX1234' })
      .expect(201)
  ).body.data.bankAccount._id;
}, 120_000);

afterAll(async () => {
  await disconnectTestDb();
});

const HDFC_MAPPING = {
  date: 'Txn Date',
  narration: 'Description',
  credit: 'Credit',
  debit: 'Debit',
  reference: 'Ref',
};

describe('CSV import with fingerprint dedupe', () => {
  it('imports a mapped statement', async () => {
    const res = await request(app)
      .post(`/api/v1/bank-accounts/${bankAccountId}/import`)
      .set(auth())
      .send({ csv: HDFC_CSV, mapping: HDFC_MAPPING })
      .expect(201);
    expect(res.body.data).toEqual({ imported: 3, duplicates: 0 });

    const txns = (
      await request(app)
        .get(`/api/v1/bank-accounts/${bankAccountId}/transactions`)
        .set(auth())
        .expect(200)
    ).body.data.transactions;
    expect(txns).toHaveLength(3);
    const neft = txns.find((t: { reference: string }) => t.reference === 'UTR123');
    expect(neft).toMatchObject({ direction: 'credit' });
    expect(neft.amountPaise).toBe(11_80_00_000); // ₹11,80,000.00 in paise
  });

  it('importing the SAME statement twice creates zero duplicate rows', async () => {
    const res = await request(app)
      .post(`/api/v1/bank-accounts/${bankAccountId}/import`)
      .set(auth())
      .send({ csv: HDFC_CSV, mapping: HDFC_MAPPING })
      .expect(201);
    expect(res.body.data).toEqual({ imported: 0, duplicates: 3 });

    const txns = (
      await request(app)
        .get(`/api/v1/bank-accounts/${bankAccountId}/transactions`)
        .set(auth())
        .expect(200)
    ).body.data.transactions;
    expect(txns).toHaveLength(3); // still three
  });

  it('manual entry lands (and dedupes on retry too)', async () => {
    const body = {
      date: '2026-07-08',
      narration: 'Cash deposit at branch',
      amountPaise: 50_000_00,
      direction: 'credit',
    };
    const first = await request(app)
      .post(`/api/v1/bank-accounts/${bankAccountId}/transactions`)
      .set(auth())
      .send(body)
      .expect(201);
    expect(first.body.data.imported).toBe(1);
    const again = await request(app)
      .post(`/api/v1/bank-accounts/${bankAccountId}/transactions`)
      .set(auth())
      .send(body)
      .expect(201);
    expect(again.body.data).toEqual({ imported: 0, duplicates: 1 });
  });
});

describe('Account Aggregator sandbox (§15)', () => {
  it('consent completes via callback and pulls transactions, deduped', async () => {
    aa.transactions = [
      {
        date: '10/07/2026',
        narration: 'AA IMPORTED SALARY CREDIT',
        amountPaise: 3_00_000_00,
        direction: 'credit',
      },
      {
        date: '11/07/2026',
        narration: 'AA IMPORTED EMI DEBIT',
        amountPaise: 45_000_00,
        direction: 'debit',
        reference: 'EMI-1',
      },
    ];

    const consent = await request(app)
      .post('/api/v1/bank-accounts/aa/consent')
      .set(auth())
      .send({ bankAccountId })
      .expect(201);
    expect(consent.body.data.redirectUrl).toContain('aa.sandbox');
    const consentId = consent.body.data.consentId;

    // the user approves at their bank; the AA gateway calls back
    const callback = await request(app)
      .post('/api/v1/bank-accounts/aa/callback')
      .set(auth())
      .send({ consentId, status: 'active' })
      .expect(200);
    expect(callback.body.data.pulled).toBe(2);

    // a re-pull (same consent fires again) imports nothing new
    const again = await request(app)
      .post('/api/v1/bank-accounts/aa/callback')
      .set(auth())
      .send({ consentId, status: 'active' })
      .expect(200);
    expect(again.body.data.pulled).toBe(0);
    expect(again.body.data.duplicates).toBe(2);

    const txns = (
      await request(app)
        .get(`/api/v1/bank-accounts/${bankAccountId}/transactions`)
        .set(auth())
        .expect(200)
    ).body.data.transactions;
    expect(txns).toHaveLength(6); // 3 csv + 1 manual + 2 aa
  });
});
