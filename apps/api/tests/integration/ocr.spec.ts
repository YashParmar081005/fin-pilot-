/**
 * OCR cascade acceptance (plan.md §16).
 *
 * Every fixture here is a REAL file — a genuine PDF with a genuine text
 * layer, a genuine PNG, a genuine scanned PDF carrying one embedded JPEG.
 * The point is to prove pdfjs and Tesseract actually read them, which a
 * hand-written buffer could never show.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { initOcr, runOcr, shutdownOcr, sniff } from '../../src/ocr';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';
import {
  makeScannedPdf,
  makeTextJpeg,
  makeTextLayerPdf,
  makeTextPng,
} from '../helpers/ocrFixtures';

const INVOICE = [
  'Known Supplier Pvt Ltd',
  'GSTIN: 27AAPFU0939F1ZV',
  'Invoice No: SUP-77',
  'Date: 05/07/2026',
  'Taxable Value: 10,000.00',
  'GST Amount: 1,800.00',
  'Total: 11,800.00',
];

let app: Express;
let token: string;
let companyId: string;
let vendorId: string;

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });
const idem = () => ({ ...auth(), 'Idempotency-Key': randomUUID() });

async function upload(filename: string, mimeType: string, bytes: Buffer) {
  const res = await request(app)
    .post('/api/v1/documents')
    .set(auth())
    .send({ filename, mimeType, contentBase64: bytes.toString('base64') })
    .expect(201);
  return res.body.data.document;
}

beforeAll(async () => {
  await connectTestDb();
  // Register the real cascade — main() does this at boot; tests build the app
  // directly, so the mock extractor would otherwise stay installed.
  initOcr();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'ocr@spec.in', password: 'ocr-spec-password1', name: 'OCR Owner' })
    .expect(201);
  token = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ocr@spec.in', password: 'ocr-spec-password1' })
      .expect(200)
  ).body.data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'OCR Spec Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
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
}, 180_000);

afterAll(async () => {
  await shutdownOcr();
  await disconnectTestDb();
});

describe('content sniffing', () => {
  it('identifies the real formats by their bytes, not the declared mime type', () => {
    expect(sniff(makeTextLayerPdf(INVOICE))).toBe('pdf');
    expect(sniff(makeScannedPdf(INVOICE))).toBe('pdf');
    expect(sniff(makeTextPng(INVOICE))).toBe('image');
    expect(sniff(makeTextJpeg(INVOICE))).toBe('image');
    expect(sniff(Buffer.from('just some text'))).toBe('other');
  });
});

describe('the cascade, unit level', () => {
  it('reads a digital PDF from its text layer, for ₹0 and no OCR', async () => {
    const outcome = await runOcr(makeTextLayerPdf(INVOICE));
    expect(outcome.engine).toBe('text-layer');
    expect(outcome.costPaise).toBe(0);
    expect(outcome.pages).toBe(1);
    // line structure survives — the field parser keys off it
    expect(outcome.text.split('\n')[0]).toBe('Known Supplier Pvt Ltd');
    expect(outcome.text).toContain('27AAPFU0939F1ZV');
    expect(outcome.text).toContain('Total: 11,800.00');
  }, 60_000);

  it('OCRs a photo of a bill, for ₹0', async () => {
    const outcome = await runOcr(makeTextPng(INVOICE));
    expect(outcome.engine).toBe('tesseract');
    expect(outcome.costPaise).toBe(0);
    expect(outcome.confidence).toBeGreaterThan(0.7);
    expect(outcome.text).toContain('SUP-77');
    expect(outcome.text).toContain('11,800.00');
  }, 120_000);

  it('falls through to OCR for a scanned PDF that has no text layer', async () => {
    const outcome = await runOcr(makeScannedPdf(INVOICE));
    expect(outcome.engine).toBe('tesseract'); // ← rasterised, then read
    expect(outcome.costPaise).toBe(0);
    expect(outcome.text).toContain('SUP-77');
    expect(outcome.text).toContain('11,800.00');
  }, 120_000);

  it('hands unreadable bytes back empty rather than inventing content', async () => {
    const outcome = await runOcr(Buffer.from('%PDF-1.4\nthis is not really a pdf\n'));
    expect(outcome.text).toBe('');
    expect(outcome.pages).toBe(0);
  }, 60_000);
});

describe('upload → extraction, end to end', () => {
  let pdfDocId: string;

  it('a real PDF extracts every field and costs ₹0', async () => {
    const doc = await upload('sup-77.pdf', 'application/pdf', makeTextLayerPdf(INVOICE));
    pdfDocId = doc.id;

    expect(doc.status).toBe('extracted');
    expect(doc.costPaise).toBe(0); // ← §16: never send a clean PDF to a paid model
    expect(doc.extraction.vendorName.value).toBe('Known Supplier Pvt Ltd');
    expect(doc.extraction.gstin.value).toBe('27AAPFU0939F1ZV');
    expect(doc.extraction.documentNumber.value).toBe('SUP-77');
    expect(doc.extraction.documentDate.value).toBe('05/07/2026');
    expect(doc.extraction.taxablePaise.value).toBe(10_00_000);
    expect(doc.extraction.totalPaise.value).toBe(11_80_000);
    expect(doc.extraction.arithmeticOk).toBe(true);
  }, 120_000);

  it('a real JPEG photo yields a reviewable draft', async () => {
    const doc = await upload('photo.jpg', 'image/jpeg', makeTextJpeg(INVOICE));

    expect(doc.status).toBe('extracted');
    expect(doc.extraction.documentNumber.value).toBe('SUP-77');
    expect(doc.extraction.taxablePaise.value).toBe(10_00_000);
    expect(doc.extraction.totalPaise.value).toBe(11_80_000);
    expect(doc.extraction.arithmeticOk).toBe(true);
  }, 180_000);

  it('a scanned PDF is OCR’d and yields the same fields', async () => {
    const doc = await upload('scan.pdf', 'application/pdf', makeScannedPdf(INVOICE));

    expect(doc.status).toBe('extracted');
    expect(doc.extraction.documentNumber.value).toBe('SUP-77');
    expect(doc.extraction.totalPaise.value).toBe(11_80_000);
  }, 180_000);

  it('an arithmetic mismatch empties the amounts instead of guessing', async () => {
    const wrong = INVOICE.map((l) => (l.startsWith('Total') ? 'Total: 99,999.00' : l));
    const doc = await upload('garbled.pdf', 'application/pdf', makeTextLayerPdf(wrong));

    expect(doc.extraction.arithmeticOk).toBe(false);
    expect(doc.extraction.totalPaise.value).toBeNull(); // empty, never guessed
    expect(doc.extraction.taxablePaise.value).toBeNull();
    expect(doc.extraction.gstin.value).toBe('27AAPFU0939F1ZV'); // checksum-verified stays
  }, 120_000);

  it('drafts a bill from the extracted PDF, recomputing the money server-side', async () => {
    const res = await request(app)
      .post(`/api/v1/bills/from-document/${pdfDocId}`)
      .set(idem())
      .send({ partyId: vendorId, gstRate: 18 })
      .expect(201);

    const bill = res.body.data.bill;
    expect(bill.vendorBillNumber).toBe('SUP-77');
    expect(bill.taxableValuePaise).toBe(10_00_000);
    expect(bill.grandTotalPaise).toBe(11_80_000); // recomputed, not trusted (I5)
    expect(bill.status).toBe('draft'); // a human still confirms (I10)
  }, 60_000);
});
