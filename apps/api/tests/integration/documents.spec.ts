/**
 * Phase 18 acceptance (plan.md §32):
 * - a clean PDF costs ₹0 to extract
 * - a phone photo of a bill produces a reviewable draft
 * - a low-confidence field renders empty, never guessed
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
let vendorId: string;

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });
const idem = () => ({ ...auth(), 'Idempotency-Key': randomUUID() });
const b64 = (s: string) => Buffer.from(s).toString('base64');

const CLEAN_INVOICE = `Known Supplier Pvt Ltd
GSTIN: 27AAPFU0939F1ZV
Invoice No: SUP-77
Date: 05/07/2026
Taxable Value: 10,000.00
GST Amount: 1,800.00
Total: 11,800.00`;

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'doc@spec.in', password: 'doc-spec-password1', name: 'Doc Owner' })
    .expect(201);
  token = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doc@spec.in', password: 'doc-spec-password1' })
      .expect(200)
  ).body.data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'Doc Spec Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;
  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);
  vendorId = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({ type: ['vendor'], name: 'Known Supplier', gstin: '27AAPFU0939F1ZV' })
      .expect(201)
  ).body.data.party.id;
}, 120_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('the extraction cascade (§16)', () => {
  let cleanDocId: string;

  it('a clean PDF (text layer) costs ₹0 and extracts every field', async () => {
    const res = await request(app)
      .post('/api/v1/documents')
      .set(auth())
      .send({
        filename: 'sup-77.pdf',
        mimeType: 'application/pdf+text',
        contentBase64: b64(CLEAN_INVOICE),
      })
      .expect(201);
    const doc = res.body.data.document;
    cleanDocId = doc.id;
    expect(doc.extractedBy).toBe('text-layer');
    expect(doc.costPaise).toBe(0); // ← the done-when
    expect(doc.extraction.gstin.value).toBe('27AAPFU0939F1ZV');
    expect(doc.extraction.documentNumber.value).toBe('SUP-77');
    expect(doc.extraction.totalPaise.value).toBe(11_80_000);
    expect(doc.extraction.taxablePaise.value).toBe(10_00_000);
    expect(doc.extraction.arithmeticOk).toBe(true); // 10,000 + 1,800 = 11,800
  });

  it('a phone photo goes through vision (paid) and yields a reviewable draft', async () => {
    const res = await request(app)
      .post('/api/v1/documents')
      .set(auth())
      .send({ filename: 'photo.jpg', mimeType: 'image/jpeg', contentBase64: b64(CLEAN_INVOICE) })
      .expect(201);
    const doc = res.body.data.document;
    expect(doc.extractedBy).toBe('vision');
    expect(doc.costPaise).toBeGreaterThan(0);
    expect(doc.status).toBe('extracted');
    expect(doc.extraction.documentNumber.value).toBe('SUP-77'); // reviewable draft
  });

  it('a low-confidence field renders EMPTY, never guessed', async () => {
    // arithmetic mismatch (10,000 + 1,800 ≠ 99,999) → number confidence drops → null
    const garbled = CLEAN_INVOICE.replace('Total: 11,800.00', 'Total: 99,999.00');
    const res = await request(app)
      .post('/api/v1/documents')
      .set(auth())
      .send({
        filename: 'garbled.pdf',
        mimeType: 'application/pdf+text',
        contentBase64: b64(garbled),
      })
      .expect(201);
    const ex = res.body.data.document.extraction;
    expect(ex.arithmeticOk).toBe(false);
    expect(ex.totalPaise.value).toBeNull(); // empty — never guessed
    expect(ex.taxablePaise.value).toBeNull();
    expect(ex.totalPaise.confidence).toBeLessThan(0.7);
    expect(ex.gstin.value).toBe('27AAPFU0939F1ZV'); // checksum-verified stays
  });

  it('"create bill from document" drafts a bill from HIGH-confidence fields only', async () => {
    const res = await request(app)
      .post(`/api/v1/bills/from-document/${cleanDocId}`)
      .set(idem())
      .send({ partyId: vendorId, gstRate: 18 })
      .expect(201);
    const bill = res.body.data.bill;
    expect(bill.vendorBillNumber).toBe('SUP-77');
    expect(bill.taxableValuePaise).toBe(10_00_000); // recomputed server-side (I5)
    expect(bill.grandTotalPaise).toBe(11_80_000);
    expect(bill.status).toBe('draft'); // reviewable — a human approves

    // a second bill from the same document → 409
    await request(app)
      .post(`/api/v1/bills/from-document/${cleanDocId}`)
      .set(idem())
      .send({ partyId: vendorId, gstRate: 18 })
      .expect(409);
  });
});
