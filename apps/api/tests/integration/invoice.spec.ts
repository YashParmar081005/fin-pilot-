/**
 * Phase 7 acceptance (plan.md §32):
 * - a client-sent grandTotalPaise is ignored (I5)
 * - issuing posts a balanced entry with the EXACT §12.2 lines
 * - cancelling reverses and never deletes; the number stays consumed
 * - two concurrent issues produce sequential numbers (I6)
 * Plus: SEZ→IGST, odd-paise→SGST, round-off, idempotency (I7).
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
let accountIdByCode: Record<string, string> = {};
let gujaratPartyId: string;
let maharashtraPartyId: string;
let sezPartyId: string;

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });
const idem = () => ({ ...auth(), 'Idempotency-Key': randomUUID() });

async function mkParty(body: Record<string, unknown>): Promise<string> {
  const res = await request(app).post('/api/v1/parties').set(auth()).send(body).expect(201);
  return res.body.data.party.id;
}

async function draftFor(
  partyId: string,
  lines: Array<Record<string, unknown>>,
  extra: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post('/api/v1/invoices')
    .set(idem())
    .send({ partyId, issueDate: '2026-07-01', lines, ...extra })
    .expect(201);
  return res.body.data.invoice;
}

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'inv@spec.in', password: 'inv-spec-password1', name: 'Invoice Owner' })
    .expect(201);
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'inv@spec.in', password: 'inv-spec-password1' })
    .expect(200);
  token = login.body.data.accessToken;

  const company = await request(app)
    .post('/api/v1/companies')
    .set('Authorization', `Bearer ${token}`)
    .send({ legalName: 'Invoice Spec Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
    .expect(201);
  companyId = company.body.data.company.id;

  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);
  const accounts = await request(app).get('/api/v1/accounts').set(auth()).expect(200);
  accountIdByCode = Object.fromEntries(
    accounts.body.data.accounts.map((a: { code: string; id: string }) => [a.code, a.id]),
  );

  gujaratPartyId = await mkParty({
    type: ['customer'],
    name: 'Gujarat Buyer',
    gstRegistrationType: 'regular',
    placeOfSupplyStateCode: '24',
  });
  maharashtraPartyId = await mkParty({
    type: ['customer'],
    name: 'Maharashtra Buyer',
    gstRegistrationType: 'regular',
    placeOfSupplyStateCode: '27',
  });
  sezPartyId = await mkParty({
    type: ['customer'],
    name: 'SEZ Unit Gujarat',
    gstRegistrationType: 'sez',
    placeOfSupplyStateCode: '24',
  });
}, 120_000);

afterAll(async () => {
  await disconnectTestDb();
});

const TEN_K_LINE = { description: 'Goods', qty: 1, ratePaise: 10_00_000, gstRate: 18 };

describe('server-authoritative totals (I5)', () => {
  it('a client-sent grandTotalPaise is silently ignored', async () => {
    const res = await request(app)
      .post('/api/v1/invoices')
      .set(idem())
      .send({
        partyId: gujaratPartyId,
        issueDate: '2026-07-01',
        lines: [TEN_K_LINE],
        grandTotalPaise: 1, // discarded — the schema does not even know this key
        taxableValuePaise: 1,
        cgstPaise: 999_999,
      })
      .expect(201);
    const invoice = res.body.data.invoice;
    expect(invoice.grandTotalPaise).toBe(11_80_000);
    expect(invoice.taxableValuePaise).toBe(10_00_000);
    expect(invoice.cgstPaise).toBe(90_000);
    expect(invoice.sgstPaise).toBe(90_000);
    expect(invoice.igstPaise).toBe(0);
    expect(invoice.status).toBe('draft');
    expect(invoice.invoiceNumber).toBeNull(); // no number until issue (I6)
  });

  it('a dead GST slab on the issue date is rejected', async () => {
    await request(app)
      .post('/api/v1/invoices')
      .set(idem())
      .send({
        partyId: gujaratPartyId,
        issueDate: '2026-07-01',
        lines: [{ ...TEN_K_LINE, gstRate: 12 }],
      })
      .expect(422);
  });
});

describe('issue → the exact §12.2 entry', () => {
  it('intra-state: AR 11,80,000 / Sales 10,00,000 / CGST 90,000 / SGST 90,000', async () => {
    const draft = await draftFor(gujaratPartyId, [TEN_K_LINE]);
    const issued = await request(app)
      .post(`/api/v1/invoices/${draft.id}/issue`)
      .set(idem())
      .expect(201);
    const invoice = issued.body.data.invoice;
    expect(invoice.invoiceNumber).toMatch(/^INV\/2026-27\/\d{5}$/);

    const entryRes = await request(app)
      .get(`/api/v1/journal-entries/${invoice.journalEntryId}`)
      .set(auth())
      .expect(200);
    const lines = entryRes.body.data.entry.lines as Array<{
      accountId: string;
      debitPaise: number;
      creditPaise: number;
    }>;
    const byAccount = (code: string) => lines.filter((l) => l.accountId === accountIdByCode[code]);

    expect(byAccount('1130')[0]).toMatchObject({ debitPaise: 11_80_000, creditPaise: 0 });
    expect(byAccount('4100')[0]).toMatchObject({ creditPaise: 10_00_000, debitPaise: 0 });
    expect(byAccount('2120')[0]).toMatchObject({ creditPaise: 90_000 });
    expect(byAccount('2121')[0]).toMatchObject({ creditPaise: 90_000 });
    expect(byAccount('2122')).toHaveLength(0); // no IGST intra-state
    expect(entryRes.body.data.entry.totalDebitPaise).toBe(11_80_000);
    expect(entryRes.body.data.entry.totalCreditPaise).toBe(11_80_000);
  });

  it('inter-state: IGST only', async () => {
    const draft = await draftFor(maharashtraPartyId, [TEN_K_LINE]);
    expect(draft.supplyType).toBe('inter');
    expect(draft.igstPaise).toBe(1_80_000);
    expect(draft.cgstPaise).toBe(0);
    expect(draft.sgstPaise).toBe(0);
  });

  it('SEZ: IGST even when supplier and buyer share a state (§14.2)', async () => {
    const draft = await draftFor(sezPartyId, [TEN_K_LINE]);
    expect(draft.supplyType).toBe('sez');
    expect(draft.igstPaise).toBe(1_80_000);
    expect(draft.cgstPaise).toBe(0);
  });

  it('odd paise lands on SGST; round-off posts and the entry balances', async () => {
    // taxable 10,015p @18% → tax 1,803p → CGST 901, SGST 902 (§12.3)
    const draft = await draftFor(gujaratPartyId, [
      { description: 'Odd paise', qty: 1, ratePaise: 10_015, gstRate: 18 },
    ]);
    expect(draft.cgstPaise).toBe(901);
    expect(draft.sgstPaise).toBe(902);
    // raw 11,818p → rounds to ₹118 → round-off −18p
    expect(draft.grandTotalPaise).toBe(11_800);
    expect(draft.roundOffPaise).toBe(-18);

    const issued = await request(app)
      .post(`/api/v1/invoices/${draft.id}/issue`)
      .set(idem())
      .expect(201);
    const entry = await request(app)
      .get(`/api/v1/journal-entries/${issued.body.data.invoice.journalEntryId}`)
      .set(auth())
      .expect(200);
    expect(entry.body.data.entry.totalDebitPaise).toBe(entry.body.data.entry.totalCreditPaise);
    const roundOffLine = (
      entry.body.data.entry.lines as Array<{ accountId: string; debitPaise: number }>
    ).find((l) => l.accountId === accountIdByCode['5410']);
    expect(roundOffLine?.debitPaise).toBe(18);
  });
});

describe('cancel — reverse, never delete', () => {
  it('cancelling reverses the entry, keeps the number, and blocks re-cancel', async () => {
    const draft = await draftFor(gujaratPartyId, [TEN_K_LINE]);
    const issued = (
      await request(app).post(`/api/v1/invoices/${draft.id}/issue`).set(idem()).expect(201)
    ).body.data.invoice;

    const cancelled = (
      await request(app)
        .post(`/api/v1/invoices/${draft.id}/cancel`)
        .set(idem())
        .send({ reason: 'customer refused delivery' })
        .expect(200)
    ).body.data.invoice;
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.invoiceNumber).toBe(issued.invoiceNumber); // gapless: consumed forever

    const entry = await request(app)
      .get(`/api/v1/journal-entries/${issued.journalEntryId}`)
      .set(auth())
      .expect(200);
    expect(entry.body.data.entry.status).toBe('reversed');
    expect(entry.body.data.entry.reversedByEntryId).toBeTruthy();

    await request(app)
      .post(`/api/v1/invoices/${draft.id}/cancel`)
      .set(idem())
      .send({ reason: 'again' })
      .expect(409);
  });

  it('an issued invoice cannot be edited', async () => {
    const draft = await draftFor(gujaratPartyId, [TEN_K_LINE]);
    await request(app).post(`/api/v1/invoices/${draft.id}/issue`).set(idem()).expect(201);
    const res = await request(app)
      .patch(`/api/v1/invoices/${draft.id}`)
      .set(auth())
      .send({ notes: 'tamper' })
      .expect(409);
    expect(res.body.error.code).toBe('DOC_CANNOT_EDIT_ISSUED');
  });
});

describe('gapless numbering under concurrency (I6)', () => {
  it('two concurrent issues produce sequential numbers', async () => {
    const [a, b] = await Promise.all([
      draftFor(gujaratPartyId, [TEN_K_LINE]),
      draftFor(maharashtraPartyId, [TEN_K_LINE]),
    ]);
    const [ra, rb] = await Promise.all([
      request(app).post(`/api/v1/invoices/${a.id}/issue`).set(idem()),
      request(app).post(`/api/v1/invoices/${b.id}/issue`).set(idem()),
    ]);
    expect(ra.status).toBe(201);
    expect(rb.status).toBe(201);
    const seqs = [ra, rb]
      .map((r) => Number(r.body.data.invoice.invoiceNumber.split('/').at(-1)))
      .sort((x, y) => x - y);
    expect(seqs[1]).toBe(seqs[0]! + 1); // sequential, no gap, no duplicate
  });
});

describe('idempotency (I7, §18.6)', () => {
  const body = () => ({ partyId: gujaratPartyId, issueDate: '2026-07-01', lines: [TEN_K_LINE] });

  it('a missing Idempotency-Key on a money route → 400', async () => {
    const res = await request(app).post('/api/v1/invoices').set(auth()).send(body()).expect(400);
    expect(res.body.error.code).toBe('SYS_IDEMPOTENCY_KEY_REQUIRED');
  });

  it('a replay returns the stored response with Idempotency-Replayed: true', async () => {
    const key = randomUUID();
    const payload = body();
    const first = await request(app)
      .post('/api/v1/invoices')
      .set({ ...auth(), 'Idempotency-Key': key })
      .send(payload)
      .expect(201);
    const replay = await request(app)
      .post('/api/v1/invoices')
      .set({ ...auth(), 'Idempotency-Key': key })
      .send(payload)
      .expect(201);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body.data.invoice.id).toBe(first.body.data.invoice.id); // no double-create
  });

  it('the same key with a DIFFERENT body → 422 IDEMPOTENCY_KEY_REUSE', async () => {
    const key = randomUUID();
    await request(app)
      .post('/api/v1/invoices')
      .set({ ...auth(), 'Idempotency-Key': key })
      .send(body())
      .expect(201);
    const res = await request(app)
      .post('/api/v1/invoices')
      .set({ ...auth(), 'Idempotency-Key': key })
      .send({ ...body(), notes: 'different body' })
      .expect(422);
    expect(res.body.error.code).toBe('SYS_IDEMPOTENCY_KEY_REUSE');
  });
});
