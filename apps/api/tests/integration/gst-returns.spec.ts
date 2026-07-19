/**
 * Phase 12 acceptance (plan.md §32):
 * - GSTR-1 JSON validates against the GSTN shape
 * - /gst/returns/:id/trace returns the exact journalEntryId[] for any row
 * - every table sums to the trial balance's tax accounts
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { Types } from 'mongoose';
import { GeneralLedger } from '../../src/engines/ledger/GeneralLedger';
import { gstr1Schema } from '../../src/engines/gst/GstEngine';
import { requestContext } from '../../src/plugins/tenantScope';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let token: string;
let companyId: string;
const entryIds: Record<string, string> = {};

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });
const idem = () => ({ ...auth(), 'Idempotency-Key': randomUUID() });

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'gst@spec.in', password: 'gst-spec-password1', name: 'GST Owner' })
    .expect(201);
  token = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'gst@spec.in', password: 'gst-spec-password1' })
      .expect(200)
  ).body.data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalName: 'GST Spec Pvt Ltd',
        stateCode: '24',
        gstin: '24AAAAA0000A1Z8',
        booksBeginDate: '2026-04-01',
      })
      .expect(201)
  ).body.data.company.id;
  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);

  const b2bParty = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({
        type: ['customer'],
        name: 'B2B Mumbai',
        gstin: '27AAPFU0939F1ZV',
        gstRegistrationType: 'regular',
        placeOfSupplyStateCode: '27',
      })
      .expect(201)
  ).body.data.party.id;
  const b2cParty = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({ type: ['customer'], name: 'Walk-in Gujarat', placeOfSupplyStateCode: '24' })
      .expect(201)
  ).body.data.party.id;
  const vendor = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({ type: ['vendor'], name: 'Vendor Gujarat', placeOfSupplyStateCode: '24' })
      .expect(201)
  ).body.data.party.id;

  const issue = async (partyId: string, ratePaise: number, key: string) => {
    const draft = (
      await request(app)
        .post('/api/v1/invoices')
        .set(idem())
        .send({
          partyId,
          issueDate: '2026-07-10',
          lines: [{ description: 'Goods', qty: 1, ratePaise, gstRate: 18 }],
        })
        .expect(201)
    ).body.data.invoice;
    const issued = (
      await request(app).post(`/api/v1/invoices/${draft.id}/issue`).set(idem()).expect(201)
    ).body.data.invoice;
    entryIds[key] = issued.journalEntryId;
    return issued;
  };
  await issue(b2bParty, 10_00_000, 'b2b'); // inter → IGST 1,80,000p
  await issue(b2cParty, 5_00_000, 'b2c'); // intra → CGST+SGST 45,000p each

  // ITC: an approved intra bill (input CGST/SGST 90,000p each)
  const bill = (
    await request(app)
      .post('/api/v1/bills')
      .set(idem())
      .send({
        partyId: vendor,
        vendorBillNumber: 'VB-GST-1',
        billDate: '2026-07-12',
        lines: [{ description: 'Inputs', qty: 1, ratePaise: 10_00_000, gstRate: 18 }],
      })
      .expect(201)
  ).body.data.bill;
  await request(app).post(`/api/v1/bills/${bill.id}/approve`).set(idem()).expect(201);
}, 180_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('GSTR-1', () => {
  let returnId: string;
  let data: Record<string, any>;

  it('generates and VALIDATES against the GSTN shape', async () => {
    const res = await request(app).get('/api/v1/gst/gstr1?period=2026-07').set(auth()).expect(200);
    returnId = res.body.data.id;
    data = res.body.data.data;
    expect(() => gstr1Schema.parse(data)).not.toThrow();
    expect(data.gstin).toBe('24AAAAA0000A1Z8');
    expect(data.fp).toBe('072026');
    expect(data.b2b).toHaveLength(1);
    expect(data.b2b[0].ctin).toBe('27AAPFU0939F1ZV');
    expect(data.b2b[0].inv[0].itms[0].itm_det.iamt).toBe(1_800); // ₹1,800 IGST
    expect(data.b2cs[0]).toMatchObject({ sply_ty: 'INTRA', rt: 18, camt: 450, samt: 450 });
  });

  it('trace returns the EXACT journalEntryIds for a row', async () => {
    const inum = data.b2b[0].inv[0].inum;
    const res = await request(app)
      .get(`/api/v1/gst/returns/${returnId}/trace?ref=b2b:${encodeURIComponent(inum)}`)
      .set(auth())
      .expect(200);
    expect(res.body.data.journalEntryIds).toEqual([entryIds.b2b]);

    const b2csRef = `b2cs:INTRA:24:18`;
    const res2 = await request(app)
      .get(`/api/v1/gst/returns/${returnId}/trace?ref=${b2csRef}`)
      .set(auth())
      .expect(200);
    expect(res2.body.data.journalEntryIds).toEqual([entryIds.b2c]);
  });

  it('every table sums to the trial balance tax accounts', async () => {
    const tb = await requestContext.run(
      { companyId: new Types.ObjectId(companyId), userId: new Types.ObjectId() },
      () => GeneralLedger.trialBalance(companyId, new Date('2026-08-01')),
    );
    const bal = (code: string) => tb.find((r) => r.code === code)?.balancePaise ?? 0;

    const b2bTotals = data.b2b[0].inv[0].itms[0].itm_det;
    const b2csTotals = data.b2cs[0];
    // output IGST (2122) — credit balance in rupees*100
    expect(Math.round(b2bTotals.iamt * 100)).toBe(bal('2122'));
    expect(Math.round((b2csTotals.camt as number) * 100)).toBe(bal('2120'));
    expect(Math.round((b2csTotals.samt as number) * 100)).toBe(bal('2121'));
  });
});

describe('GSTR-3B', () => {
  it('outward + ITC + net payable, all reconciling to the TB', async () => {
    const res = await request(app).get('/api/v1/gst/gstr3b?period=2026-07').set(auth()).expect(200);
    const d = res.body.data.data;
    expect(d.outward_3_1_a).toMatchObject({ txval: 15_000, iamt: 1_800, camt: 450, samt: 450 });
    expect(d.itc_4a).toMatchObject({ camt: 900, samt: 900, iamt: 0 });
    expect(d.net_payable).toMatchObject({ iamt: 1_800, camt: -450, samt: -450 });

    const tb = await requestContext.run(
      { companyId: new Types.ObjectId(companyId), userId: new Types.ObjectId() },
      () => GeneralLedger.trialBalance(companyId, new Date('2026-08-01')),
    );
    const bal = (code: string) => tb.find((r) => r.code === code)?.balancePaise ?? 0;
    expect(Math.round(d.itc_4a.camt * 100)).toBe(bal('1150')); // input CGST
    expect(Math.round(d.itc_4a.samt * 100)).toBe(bal('1151')); // input SGST

    // trace on 3B sections
    const trace = await request(app)
      .get(`/api/v1/gst/returns/${res.body.data.id}/trace?ref=itc_4a`)
      .set(auth())
      .expect(200);
    expect(trace.body.data.journalEntryIds).toHaveLength(1);
  });
});
