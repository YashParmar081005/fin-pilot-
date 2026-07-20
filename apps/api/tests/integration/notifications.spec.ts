/**
 * Phase 22 acceptance (plan.md §32): every notification is IDEMPOTENT per
 * (event, user) and RESPECTS preferences. Plus the overdue cadence and the
 * 8th/17th GST reminders.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { flipOverdueInvoices } from '../../src/jobs/maintenance';
import { gstDueDateReminders, overdueInvoiceReminders } from '../../src/jobs/notifications';
import { getTestOutbox } from '../../src/services/mailService';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let token: string;
let companyId: string;

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });
const idem = () => ({ ...auth(), 'Idempotency-Key': randomUUID() });

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'notif@spec.in', password: 'notif-spec-pass1', name: 'Notif Owner' })
    .expect(201);
  token = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'notif@spec.in', password: 'notif-spec-pass1' })
      .expect(200)
  ).body.data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalName: 'Notif Spec Pvt Ltd',
        stateCode: '24',
        gstin: '24AAAAA0000A1Z8',
        booksBeginDate: '2026-04-01',
      })
      .expect(201)
  ).body.data.company.id;
  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);

  // an invoice already past due → overdue after the flip job
  const customer = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({ type: ['customer'], name: 'Late Payer', placeOfSupplyStateCode: '24' })
      .expect(201)
  ).body.data.party.id;
  const draft = (
    await request(app)
      .post('/api/v1/invoices')
      .set(idem())
      .send({
        partyId: customer,
        issueDate: '2026-06-01',
        dueDate: '2026-06-15',
        lines: [{ description: 'Goods', qty: 1, ratePaise: 10_00_000, gstRate: 18 }],
      })
      .expect(201)
  ).body.data.invoice;
  await request(app).post(`/api/v1/invoices/${draft.id}/issue`).set(idem()).expect(201);
  await flipOverdueInvoices(new Date('2026-07-01'));
}, 180_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('notifications (§32 Phase 22)', () => {
  it('the overdue reminder fires once per invoice per day — idempotent per (event, user)', async () => {
    const day = new Date('2026-07-02');
    expect(await overdueInvoiceReminders(day)).toBe(1); // first run lands
    expect(await overdueInvoiceReminders(day)).toBe(0); // same day → deduped

    const list = (await request(app).get('/api/v1/notifications').set(auth()).expect(200)).body.data
      .notifications;
    expect(list).toHaveLength(1);
    expect(list[0].event).toBe('invoice.overdue');
    expect(list[0].title).toContain('overdue');

    // next day: the daily cadence produces a NEW reminder
    expect(await overdueInvoiceReminders(new Date('2026-07-03'))).toBe(1);
  });

  it('GST reminders fire on the 8th (GSTR-1) and 17th (3B), never on other days', async () => {
    expect(await gstDueDateReminders(new Date('2026-07-09T09:00:00Z'))).toBe(0);
    expect(await gstDueDateReminders(new Date('2026-07-08T09:00:00Z'))).toBe(1);
    expect(await gstDueDateReminders(new Date('2026-07-08T10:00:00Z'))).toBe(0); // deduped
    expect(await gstDueDateReminders(new Date('2026-07-17T09:00:00Z'))).toBe(1);

    const mails = getTestOutbox().filter((m) => m.to === 'notif@spec.in');
    expect(mails.some((m) => m.subject.includes('GSTR-1'))).toBe(true);
    expect(mails.some((m) => m.subject.includes('GSTR-3B'))).toBe(true);
  });

  it('respects preferences: a muted event never lands', async () => {
    await request(app)
      .patch('/api/v1/notifications/preferences')
      .set(auth())
      .send({ events: { 'invoice.overdue': false } })
      .expect(200);

    expect(await overdueInvoiceReminders(new Date('2026-07-04'))).toBe(0); // muted

    await request(app)
      .patch('/api/v1/notifications/preferences')
      .set(auth())
      .send({ events: { 'invoice.overdue': true } })
      .expect(200);
    expect(await overdueInvoiceReminders(new Date('2026-07-04'))).toBe(1); // unmuted
  });

  it('a muted email channel stops mail but keeps in-app', async () => {
    await request(app)
      .patch('/api/v1/notifications/preferences')
      .set(auth())
      .send({ channels: { email: false } })
      .expect(200);
    const mailsBefore = getTestOutbox().filter((m) => m.to === 'notif@spec.in').length;

    expect(await overdueInvoiceReminders(new Date('2026-07-05'))).toBe(1); // in-app lands
    const mailsAfter = getTestOutbox().filter((m) => m.to === 'notif@spec.in').length;
    expect(mailsAfter).toBe(mailsBefore); // no email

    const unread = (await request(app).get('/api/v1/notifications').set(auth()).expect(200)).body
      .data.notifications;
    const latest = unread[0];
    await request(app)
      .post('/api/v1/notifications/read')
      .set(auth())
      .send({ ids: [latest._id] })
      .expect(200);
    const after = (await request(app).get('/api/v1/notifications').set(auth()).expect(200)).body
      .data.notifications;
    expect(after.find((n: { _id: string }) => n._id === latest._id).readAt).toBeTruthy();
  });
});
