/**
 * Phase 14 acceptance (plan.md §32):
 * - a synced period shows every record with a match status
 * - taking an action pushes it back and re-syncs
 * - the alarm on the 10th lists unactioned records and the ITC at risk
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { MockImsGspClient, setImsClient } from '../../src/services/imsService';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let token: string;
let companyId: string;
const gsp = new MockImsGspClient();

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });
const idem = () => ({ ...auth(), 'Idempotency-Key': randomUUID() });

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');
  setImsClient(gsp);

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'ims@spec.in', password: 'ims-spec-password1', name: 'IMS Owner' })
    .expect(201);
  token = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ims@spec.in', password: 'ims-spec-password1' })
      .expect(200)
  ).body.data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalName: 'IMS Spec Pvt Ltd',
        stateCode: '24',
        gstin: '24AAAAA0000A1Z8',
        booksBeginDate: '2026-04-01',
      })
      .expect(201)
  ).body.data.company.id;
  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);

  // our vendor + an approved bill (intra 18% on ₹10,000 → CGST/SGST 90,000p)
  const vendor = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({
        type: ['vendor'],
        name: 'Known Supplier',
        gstin: '27AAPFU0939F1ZV',
        gstRegistrationType: 'regular',
        placeOfSupplyStateCode: '24',
      })
      .expect(201)
  ).body.data.party.id;
  const bill = (
    await request(app)
      .post('/api/v1/bills')
      .set(idem())
      .send({
        partyId: vendor,
        vendorBillNumber: 'SUP-001',
        billDate: '2026-07-05',
        lines: [{ description: 'Inputs', qty: 1, ratePaise: 10_00_000, gstRate: 18 }],
      })
      .expect(201)
  ).body.data.bill;
  await request(app).post(`/api/v1/bills/${bill.id}/approve`).set(idem()).expect(201);

  // the supplier's GSTR-1 as IMS sees it: one exact match, one mismatch, one unknown
  const base = {
    supplierGstin: '27AAPFU0939F1ZV',
    supplierTradeName: 'Known Supplier',
    documentType: 'invoice' as const,
    documentDate: '2026-07-05',
    igstPaise: 0,
    cessPaise: 0,
  };
  gsp.records = [
    {
      ...base,
      documentNumber: 'SUP-001',
      taxableValuePaise: 10_00_000,
      cgstPaise: 90_000,
      sgstPaise: 90_000,
    },
    {
      ...base,
      documentNumber: 'SUP-002',
      taxableValuePaise: 5_00_000,
      cgstPaise: 45_000,
      sgstPaise: 45_000,
    },
    {
      ...base,
      supplierGstin: '24AAAAA0000A1Z8',
      documentNumber: 'GHOST-9',
      taxableValuePaise: 1_00_000,
      cgstPaise: 9_000,
      sgstPaise: 9_000,
    },
  ];
}, 180_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('IMS (§14.5)', () => {
  it('a synced period shows every record with a match status', async () => {
    const sync = await request(app)
      .post('/api/v1/gst/ims/sync')
      .set(auth())
      .send({ period: '2026-07' })
      .expect(200);
    expect(sync.body.data.synced).toBe(3);

    const list = await request(app).get('/api/v1/gst/ims?period=2026-07').set(auth()).expect(200);
    const byDoc = Object.fromEntries(
      list.body.data.records.map((r: { documentNumber: string; matchStatus: string }) => [
        r.documentNumber,
        r.matchStatus,
      ]),
    );
    expect(byDoc['SUP-001']).toBe('matched'); // exact bill match
    expect(byDoc['SUP-002']).toBe('not_in_books'); // no such bill
    expect(byDoc['GHOST-9']).toBe('not_in_books'); // unknown supplier
    expect(list.body.data.records).toHaveLength(3);
  });

  it('an action pushes back via the GSP and re-syncs the record', async () => {
    const list = await request(app).get('/api/v1/gst/ims?period=2026-07').set(auth()).expect(200);
    const match = list.body.data.records.find(
      (r: { documentNumber: string }) => r.documentNumber === 'SUP-001',
    );

    const res = await request(app)
      .post(`/api/v1/gst/ims/${match._id}/action`)
      .set(auth())
      .send({ action: 'accept' })
      .expect(200);
    expect(res.body.data.actioned).toBe(1);
    expect(gsp.pushed).toContainEqual(
      expect.objectContaining({ documentNumber: 'SUP-001', action: 'accept' }),
    );

    const after = await request(app).get('/api/v1/gst/ims?period=2026-07').set(auth()).expect(200);
    const accepted = after.body.data.records.find(
      (r: { documentNumber: string }) => r.documentNumber === 'SUP-001',
    );
    expect(accepted.action).toBe('accept');
    expect(accepted.pushedBackAt).toBeTruthy();
  });

  it('bulk reject with remarks; pending is capped at one carried period', async () => {
    const list = await request(app).get('/api/v1/gst/ims?period=2026-07').set(auth()).expect(200);
    const mismatch = list.body.data.records.find(
      (r: { documentNumber: string }) => r.documentNumber === 'SUP-002',
    );
    await request(app)
      .post('/api/v1/gst/ims/actions')
      .set(auth())
      .send({ ids: [mismatch._id], action: 'pending', remarks: 'awaiting goods' })
      .expect(200);
    // second pending on the same record → capped (§14.5)
    const capped = await request(app)
      .post(`/api/v1/gst/ims/${mismatch._id}/action`)
      .set(auth())
      .send({ action: 'pending' })
      .expect(409);
    expect(capped.body.error.code).toBe('GST_IMS_ACTION_LOCKED');
  });

  it('the 10th-of-month alarm lists unactioned records and the ITC at risk', async () => {
    const { imsService } = await import('../../src/services/imsService');
    const { requestContext } = await import('../../src/plugins/tenantScope');
    const { Types } = await import('mongoose');
    const alarm = await requestContext.run(
      { companyId: new Types.ObjectId(companyId), userId: new Types.ObjectId() },
      () => imsService.deadlineAlarm('2026-07'),
    );
    // GHOST-9 is the only record still no_action → its full tax is at risk
    expect(alarm.unactioned).toBe(1);
    expect(alarm.itcAtRiskPaise).toBe(18_000);
  });
});
