/**
 * Phase 9 acceptance (plan.md §32):
 * - sum(allocations) <= amountPaise ALWAYS
 * - a replayed Razorpay webhook is a no-op
 * - an advance posts the liability + output tax lines (§12.2)
 * Plus: settle flow, advance application, outflow, refund.
 */
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

const WEBHOOK_SECRET = 'test-razorpay-webhook-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

let app: Express;
let token: string;
let companyId: string;
let accountIdByCode: Record<string, string> = {};
let customerId: string;
let vendorId: string;

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });
const idem = () => ({ ...auth(), 'Idempotency-Key': randomUUID() });

async function issuedInvoice(): Promise<{ id: string; journalEntryId: string; grand: number }> {
  const draft = (
    await request(app)
      .post('/api/v1/invoices')
      .set(idem())
      .send({
        partyId: customerId,
        issueDate: '2026-07-01',
        lines: [{ description: 'Goods', qty: 1, ratePaise: 10_00_000, gstRate: 18 }],
      })
      .expect(201)
  ).body.data.invoice;
  const issued = (
    await request(app).post(`/api/v1/invoices/${draft.id}/issue`).set(idem()).expect(201)
  ).body.data.invoice;
  return { id: issued.id, journalEntryId: issued.journalEntryId, grand: issued.grandTotalPaise };
}

async function entryLines(entryId: string) {
  const res = await request(app).get(`/api/v1/journal-entries/${entryId}`).set(auth()).expect(200);
  return res.body.data.entry;
}

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'pay@spec.in', password: 'pay-spec-password1', name: 'Pay Owner' })
    .expect(201);
  token = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'pay@spec.in', password: 'pay-spec-password1' })
      .expect(200)
  ).body.data.accessToken;

  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'Pay Spec Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;

  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);
  const accounts = await request(app).get('/api/v1/accounts').set(auth()).expect(200);
  accountIdByCode = Object.fromEntries(
    accounts.body.data.accounts.map((a: { code: string; id: string }) => [a.code, a.id]),
  );

  customerId = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({ type: ['customer'], name: 'Paying Customer', placeOfSupplyStateCode: '24' })
      .expect(201)
  ).body.data.party.id;
  vendorId = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({ type: ['vendor'], name: 'Paid Vendor', placeOfSupplyStateCode: '24' })
      .expect(201)
  ).body.data.party.id;
}, 120_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('inflow settle (§12.2 customer payment)', () => {
  it('posts Dr bank / Cr AR and drives invoice status to paid', async () => {
    const invoice = await issuedInvoice();
    const half = invoice.grand / 2;

    const p1 = (
      await request(app)
        .post('/api/v1/payments')
        .set(idem())
        .send({
          direction: 'inflow',
          partyId: customerId,
          date: '2026-07-05',
          amountPaise: half,
          depositAccountId: accountIdByCode['1120'],
          allocations: [{ documentModel: 'Invoice', documentId: invoice.id, amountPaise: half }],
        })
        .expect(201)
    ).body.data.payment;
    expect(p1.paymentNumber).toMatch(/^PAY\/2026-27\/\d{5}$/);
    expect(p1.unallocatedPaise).toBe(0);

    const entry = await entryLines(p1.journalEntryId);
    const by = (code: string) =>
      entry.lines.find((l: { accountId: string }) => l.accountId === accountIdByCode[code]);
    expect(by('1120')).toMatchObject({ debitPaise: half });
    expect(by('1130')).toMatchObject({ creditPaise: half });

    let inv = (await request(app).get(`/api/v1/invoices/${invoice.id}`).set(auth()).expect(200))
      .body.data.invoice;
    expect(inv.status).toBe('partially_paid');
    expect(inv.amountDuePaise).toBe(half);

    await request(app)
      .post('/api/v1/payments')
      .set(idem())
      .send({
        direction: 'inflow',
        partyId: customerId,
        date: '2026-07-06',
        amountPaise: half,
        depositAccountId: accountIdByCode['1120'],
        allocations: [{ documentModel: 'Invoice', documentId: invoice.id, amountPaise: half }],
      })
      .expect(201);
    inv = (await request(app).get(`/api/v1/invoices/${invoice.id}`).set(auth()).expect(200)).body
      .data.invoice;
    expect(inv.status).toBe('paid');
    expect(inv.amountDuePaise).toBe(0);
  });

  it('sum(allocations) can never exceed amountPaise or the amount due', async () => {
    const invoice = await issuedInvoice();
    // over-allocating the payment → 422 at the schema
    await request(app)
      .post('/api/v1/payments')
      .set(idem())
      .send({
        direction: 'inflow',
        partyId: customerId,
        date: '2026-07-05',
        amountPaise: 1_00_000,
        depositAccountId: accountIdByCode['1120'],
        allocations: [{ documentModel: 'Invoice', documentId: invoice.id, amountPaise: 2_00_000 }],
      })
      .expect(422);
    // allocating beyond the invoice's due → 422 in the service
    await request(app)
      .post('/api/v1/payments')
      .set(idem())
      .send({
        direction: 'inflow',
        partyId: customerId,
        date: '2026-07-05',
        amountPaise: 99_00_000,
        depositAccountId: accountIdByCode['1120'],
        allocations: [{ documentModel: 'Invoice', documentId: invoice.id, amountPaise: 99_00_000 }],
      })
      .expect(422);
  });
});

describe('advances (§12.2 — GST on advance)', () => {
  let advanceId: string;

  it('an advance posts the liability + output tax lines', async () => {
    // ₹1,18,000 advance incl. 18% GST → liability 1,00,000 + CGST 9,000 + SGST 9,000
    const payment = (
      await request(app)
        .post('/api/v1/payments')
        .set(idem())
        .send({
          direction: 'inflow',
          partyId: customerId,
          date: '2026-07-07',
          amountPaise: 1_18_000,
          depositAccountId: accountIdByCode['1120'],
          advanceGstRate: 18,
        })
        .expect(201)
    ).body.data.payment;
    advanceId = payment.id;
    expect(payment.unallocatedPaise).toBe(1_18_000);

    const entry = await entryLines(payment.journalEntryId);
    const by = (code: string) =>
      entry.lines.find((l: { accountId: string }) => l.accountId === accountIdByCode[code]);
    expect(by('1120')).toMatchObject({ debitPaise: 1_18_000 });
    expect(by('2140')).toMatchObject({ creditPaise: 1_00_000 }); // Advance from Customers
    expect(by('2120')).toMatchObject({ creditPaise: 9_000 }); // Output CGST on advance
    expect(by('2121')).toMatchObject({ creditPaise: 9_000 }); // Output SGST on advance
    expect(entry.totalDebitPaise).toBe(entry.totalCreditPaise);
  });

  it('applying the advance settles an invoice and reverses the advance tax', async () => {
    const invoice = await issuedInvoice(); // 11,80,000 due
    const applied = (
      await request(app)
        .post(`/api/v1/payments/${advanceId}/allocate`)
        .set(idem())
        .send({
          allocations: [
            { documentModel: 'Invoice', documentId: invoice.id, amountPaise: 1_18_000 },
          ],
        })
        .expect(201)
    ).body.data.payment;
    expect(applied.unallocatedPaise).toBe(0);

    const inv = (await request(app).get(`/api/v1/invoices/${invoice.id}`).set(auth()).expect(200))
      .body.data.invoice;
    expect(inv.amountDuePaise).toBe(invoice.grand - 1_18_000);

    // over-allocating an advance is impossible
    await request(app)
      .post(`/api/v1/payments/${advanceId}/allocate`)
      .set(idem())
      .send({
        allocations: [{ documentModel: 'Invoice', documentId: invoice.id, amountPaise: 1 }],
      })
      .expect(422);
  });

  it('a fresh advance can be refunded, reversing its tax share', async () => {
    const payment = (
      await request(app)
        .post('/api/v1/payments')
        .set(idem())
        .send({
          direction: 'inflow',
          partyId: customerId,
          date: '2026-07-08',
          amountPaise: 59_000, // incl 18% → 50,000 + 4,500 + 4,500
          depositAccountId: accountIdByCode['1120'],
          advanceGstRate: 18,
        })
        .expect(201)
    ).body.data.payment;

    const refunded = (
      await request(app)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set(idem())
        .send({ amountPaise: 59_000, reason: 'order cancelled' })
        .expect(201)
    ).body.data.payment;
    expect(refunded.unallocatedPaise).toBe(0);
    expect(refunded.refundedPaise).toBe(59_000);

    await request(app)
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set(idem())
      .send({ amountPaise: 1, reason: 'again' })
      .expect(422);
  });
});

describe('outflow (vendor payment)', () => {
  it('pays an approved bill: Dr AP / Cr bank', async () => {
    const bill = (
      await request(app)
        .post('/api/v1/bills')
        .set(idem())
        .send({
          partyId: vendorId,
          vendorBillNumber: 'VB-PAY-1',
          billDate: '2026-07-01',
          lines: [{ description: 'Supplies', qty: 1, ratePaise: 5_00_000, gstRate: 18 }],
        })
        .expect(201)
    ).body.data.bill;
    const approved = (
      await request(app).post(`/api/v1/bills/${bill.id}/approve`).set(idem()).expect(201)
    ).body.data.bill;

    const payment = (
      await request(app)
        .post('/api/v1/payments')
        .set(idem())
        .send({
          direction: 'outflow',
          partyId: vendorId,
          date: '2026-07-10',
          amountPaise: approved.grandTotalPaise,
          depositAccountId: accountIdByCode['1120'],
          allocations: [
            { documentModel: 'Bill', documentId: bill.id, amountPaise: approved.grandTotalPaise },
          ],
        })
        .expect(201)
    ).body.data.payment;

    const entry = await entryLines(payment.journalEntryId);
    const by = (code: string) =>
      entry.lines.find((l: { accountId: string }) => l.accountId === accountIdByCode[code]);
    expect(by('2110')).toMatchObject({ debitPaise: approved.grandTotalPaise });
    expect(by('1120')).toMatchObject({ creditPaise: approved.grandTotalPaise });
  });
});

describe('Razorpay webhook (replay = no-op)', () => {
  function signedPost(body: Record<string, unknown>) {
    const raw = JSON.stringify(body);
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
    return request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', signature)
      .send(raw);
  }

  it('a valid captured event records the payment; a replay is a NO-OP', async () => {
    const invoice = await issuedInvoice();
    const event = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_${randomUUID().slice(0, 12)}`,
            amount: invoice.grand,
            notes: { companyId, invoiceId: invoice.id },
          },
        },
      },
    };

    const first = await signedPost(event).expect(200);
    expect(first.body.data.handled).toBe(true);
    expect(first.body.data.replayed).toBeUndefined();

    const inv = (await request(app).get(`/api/v1/invoices/${invoice.id}`).set(auth()).expect(200))
      .body.data.invoice;
    expect(inv.status).toBe('paid');

    const before = (await request(app).get('/api/v1/payments').set(auth()).expect(200)).body.data
      .payments.length;
    const replay = await signedPost(event).expect(200);
    expect(replay.body.data.replayed).toBe(true);
    const after = (await request(app).get('/api/v1/payments').set(auth()).expect(200)).body.data
      .payments.length;
    expect(after).toBe(before); // no second payment, no double posting
  });

  it('a bad signature is rejected outright', async () => {
    await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', 'deadbeef')
      .send(JSON.stringify({ event: 'payment.captured' }))
      .expect(400);
  });
});
