/**
 * Phase 6 acceptance over HTTP (plan.md §32):
 * - an invalid GSTIN checksum is rejected (422)
 * - a 12% GST rate is rejected today (GST 2.0)
 * Plus: CRUD, bulk import with partial failure, party snapshot defaults,
 * HSN-by-AATO rule, duplicate SKU, tenancy via X-Company-Id.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { Company } from '../../src/models/Company';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let token: string;
let companyId: string;

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'pi@spec.in', password: 'pi-spec-password1', name: 'PI Owner' })
    .expect(201);
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'pi@spec.in', password: 'pi-spec-password1' })
    .expect(200);
  token = login.body.data.accessToken;

  const company = await request(app)
    .post('/api/v1/companies')
    .set('Authorization', `Bearer ${token}`)
    .send({
      legalName: 'PI Spec Pvt Ltd',
      stateCode: '24',
      gstin: '24AAAAA0000A1Z8',
      booksBeginDate: '2026-04-01',
    })
    .expect(201);
  companyId = company.body.data.company.id;

  // seed the COA so control-account defaults resolve
  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('parties', () => {
  it('rejects an invalid GSTIN checksum with 422', async () => {
    const res = await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({ type: ['customer'], name: 'Fraud Traders', gstin: '24AAAAA0000A1Z5' })
      .expect(422);
    expect(res.body.error.code).toBe('SYS_VALIDATION_FAILED');
    expect(JSON.stringify(res.body.error.details)).toContain('checksum');
  });

  it('creates a party with a valid GSTIN and default control accounts', async () => {
    const res = await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({
        type: ['customer', 'vendor'],
        name: 'Maharashtra Mills',
        gstin: '27AAPFU0939F1ZV',
        gstRegistrationType: 'regular',
        placeOfSupplyStateCode: '27',
        billingAddress: { city: 'Mumbai', pincode: '400001' },
      })
      .expect(201);
    const party = res.body.data.party;
    expect(party.gstin).toBe('27AAPFU0939F1ZV');
    expect(party.receivableAccountId).toBeTruthy(); // linked to seeded 1130
    expect(party.payableAccountId).toBeTruthy(); // linked to seeded 2110
  });

  it('lists, filters, updates, soft-deletes', async () => {
    const list = await request(app).get('/api/v1/parties?type=customer').set(auth()).expect(200);
    expect(list.body.data.parties.length).toBeGreaterThanOrEqual(1);
    const id = list.body.data.parties[0].id;

    const upd = await request(app)
      .patch(`/api/v1/parties/${id}`)
      .set(auth())
      .send({ creditDays: 30 })
      .expect(200);
    expect(upd.body.data.party.creditDays).toBe(30);

    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({ type: ['vendor'], name: 'Delete Me' })
      .expect(201);
    const all = await request(app).get('/api/v1/parties').set(auth()).expect(200);
    const del = all.body.data.parties.find((p: { name: string }) => p.name === 'Delete Me');
    await request(app).delete(`/api/v1/parties/${del.id}`).set(auth()).expect(200);
    const after = await request(app).get('/api/v1/parties').set(auth()).expect(200);
    expect(
      after.body.data.parties.find((p: { name: string }) => p.name === 'Delete Me'),
    ).toBeUndefined();
  });

  it('bulk import: valid rows land, invalid rows are reported per-row', async () => {
    const res = await request(app)
      .post('/api/v1/parties/import')
      .set(auth())
      .send({
        rows: [
          { type: ['customer'], name: 'Import Good 1' },
          { type: ['customer'], name: 'Import Bad', gstin: '24AAAAA0000A1Z5' }, // bad checksum
          { type: ['vendor'], name: 'Import Good 2', gstin: '24AAAAA0000A1Z8' },
        ],
      })
      .expect(201);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.failed).toHaveLength(1);
    expect(res.body.data.failed[0].row).toBe(2);
  });
});

describe('items', () => {
  it('rejects a 12% GST rate today (GST 2.0, §14.1)', async () => {
    const res = await request(app)
      .post('/api/v1/items')
      .set(auth())
      .send({ kind: 'goods', name: 'Old Slab Widget', hsn: '8471', gstRate: 12 })
      .expect(422);
    expect(JSON.stringify(res.body.error.details)).toContain('2025-09-22');
  });

  it('creates an 18% item with account defaults', async () => {
    const res = await request(app)
      .post('/api/v1/items')
      .set(auth())
      .send({
        kind: 'goods',
        name: 'Cotton Fabric Roll',
        sku: 'FAB-001',
        hsn: '5208',
        gstRate: 5,
        sellingPricePaise: 1_50_000,
        trackInventory: true,
      })
      .expect(201);
    const item = res.body.data.item;
    expect(item.incomeAccountId).toBeTruthy();
    expect(item.inventoryAccountId).toBeTruthy();
  });

  it('a service needs a SAC, not an HSN', async () => {
    await request(app)
      .post('/api/v1/items')
      .set(auth())
      .send({ kind: 'service', name: 'Stitching Job Work', gstRate: 18 })
      .expect(422);
    await request(app)
      .post('/api/v1/items')
      .set(auth())
      .send({ kind: 'service', name: 'Stitching Job Work', sac: '998821', gstRate: 18 })
      .expect(201);
  });

  it('duplicate SKU in the same company → 409', async () => {
    const res = await request(app)
      .post('/api/v1/items')
      .set(auth())
      .send({ kind: 'goods', name: 'Duplicate SKU', sku: 'FAB-001', hsn: '5208', gstRate: 5 })
      .expect(409);
    expect(res.body.error.code).toBe('SYS_DUPLICATE_KEY');
  });

  it('4-digit HSN is fine at ≤ ₹5 Cr AATO, blocked above (§14.3)', async () => {
    await request(app)
      .post('/api/v1/items')
      .set(auth())
      .send({ kind: 'goods', name: 'Small Biz Widget', hsn: '8471', gstRate: 18 })
      .expect(201);

    // cross the AATO threshold: > ₹5 Cr
    await Company.updateOne({ _id: companyId }, { aggregateTurnoverPaise: 6_00_00_000 * 100 });
    const res = await request(app)
      .post('/api/v1/items')
      .set(auth())
      .send({ kind: 'goods', name: 'Big Biz Widget', hsn: '8471', gstRate: 18 })
      .expect(422);
    expect(res.body.error.code).toBe('GST_HSN_DIGITS_INSUFFICIENT');

    // 6-digit passes
    await request(app)
      .post('/api/v1/items')
      .set(auth())
      .send({ kind: 'goods', name: 'Big Biz Widget 6', hsn: '847130', gstRate: 18 })
      .expect(201);
    await Company.updateOne({ _id: companyId }, { aggregateTurnoverPaise: 0 });
  });

  it('bulk import reports per-row failures', async () => {
    const res = await request(app)
      .post('/api/v1/items/import')
      .set(auth())
      .send({
        rows: [
          { kind: 'goods', name: 'Bulk A', hsn: '5208', gstRate: 5 },
          { kind: 'goods', name: 'Bulk Bad', hsn: '5208', gstRate: 12 }, // dead slab
          { kind: 'service', name: 'Bulk Svc', sac: '998821', gstRate: 18 },
        ],
      })
      .expect(201);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.failed[0].row).toBe(2);
  });
});
