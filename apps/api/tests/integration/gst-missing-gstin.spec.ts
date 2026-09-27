/**
 * A company with no GSTIN must say so, and must be fixable.
 *
 * GSTR-1 files under the company's own GSTIN and the IMS sync looks up inward
 * invoices by it, so neither can run without one. Both used to answer
 * GST_INVALID_GSTIN — whose message is "The GSTIN is invalid (checksum
 * failed)" — for a company that had never had a GSTIN at all, sending people
 * to hunt for a typo in a field they never filled in. The company form makes
 * GSTIN optional and there is no company settings screen, so there was also no
 * way to supply one afterwards.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;

/** A company created the way the UI allows: no GSTIN. */
async function companyWithoutGstin(): Promise<{ token: string; companyId: string }> {
  const email = `nogstin-${randomUUID().slice(0, 8)}@spec.in`;
  const password = 'nogstin-spec-password1';

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, name: 'No GSTIN Owner' })
    .expect(201);
  const token = (
    await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200)
  ).body.data.accessToken;

  const companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'No GSTIN Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;

  return { token, companyId };
}

const auth = (token: string, companyId: string) => ({
  Authorization: `Bearer ${token}`,
  'X-Company-Id': companyId,
});
const idem = (token: string, companyId: string) => ({
  ...auth(token, companyId),
  'Idempotency-Key': randomUUID(),
});

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');
}, 180_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('a company with no GSTIN', () => {
  it('tells GSTR-1 callers the GSTIN is missing, not that it failed a checksum', async () => {
    const { token, companyId } = await companyWithoutGstin();

    const res = await request(app)
      .get('/api/v1/gst/gstr1?period=2026-09')
      .set(auth(token, companyId))
      .expect(422);

    expect(res.body.error.code).toBe('GST_COMPANY_GSTIN_MISSING');
    // the old code, whose message talks about a checksum, must not come back
    expect(res.body.error.code).not.toBe('GST_INVALID_GSTIN');
    expect(res.body.error.message).not.toMatch(/checksum/i);
  }, 60_000);

  it('says the same for the IMS sync', async () => {
    const { token, companyId } = await companyWithoutGstin();

    const res = await request(app)
      .post('/api/v1/gst/ims/sync')
      .set(idem(token, companyId))
      .send({ period: '2026-09' })
      .expect(422);

    expect(res.body.error.code).toBe('GST_COMPANY_GSTIN_MISSING');
  }, 60_000);

  it('still produces GSTR-3B, which needs no GSTIN of its own', async () => {
    const { token, companyId } = await companyWithoutGstin();

    await request(app)
      .get('/api/v1/gst/gstr3b?period=2026-09')
      .set(auth(token, companyId))
      .expect(200);
  }, 60_000);

  it('can be given a GSTIN afterwards, and then GSTR-1 works', async () => {
    const { token, companyId } = await companyWithoutGstin();

    await request(app)
      .patch(`/api/v1/companies/${companyId}`)
      .set(idem(token, companyId))
      .send({ gstin: '24AAACY1234A1Z2' })
      .expect(200);

    const res = await request(app)
      .get('/api/v1/gst/gstr1?period=2026-09')
      .set(auth(token, companyId))
      .expect(200);

    expect(res.body.data.data.gstin).toBe('24AAACY1234A1Z2');
  }, 60_000);

  it('rejects a GSTIN that fails its checksum — that error is still the right one', async () => {
    const { token, companyId } = await companyWithoutGstin();

    // same string as above with the check character changed
    await request(app)
      .patch(`/api/v1/companies/${companyId}`)
      .set(idem(token, companyId))
      .send({ gstin: '24AAACY1234A1Z9' })
      .expect(422);
  }, 60_000);
});
