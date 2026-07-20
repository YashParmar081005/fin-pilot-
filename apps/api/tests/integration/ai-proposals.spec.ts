/**
 * Phase 20 acceptance (plan.md §32, I10):
 * - a write tool returns a proposal and performs ZERO writes (§29.2)
 * - an approved proposal produces an IDENTICAL result to doing it by hand
 * - an expired proposal cannot be confirmed
 * - confirm re-computes every amount and IGNORES the stored preview
 */
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { setLlmProvider, type LlmTurn } from '../../src/ai/gateway';
import { AiProposal } from '../../src/models/AiProposal';
import { Invoice } from '../../src/models/Invoice';
import { buildApp } from '../../src/server';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let token: string;
let companyId: string;
let customerId: string;

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Company-Id': companyId });
const idem = () => ({ ...auth(), 'Idempotency-Key': randomUUID() });

const stub = { script: [] as LlmTurn[] };
setLlmProvider({
  async chat() {
    return stub.script.shift() ?? { content: 'done', tokens: 1 };
  },
});

const INVOICE_INPUT = () => ({
  partyId: customerId,
  issueDate: '2026-07-01',
  lines: [{ description: 'AI drafted goods', qty: 2, ratePaise: 5_00_000, gstRate: 18 }],
});

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'prop@spec.in', password: 'prop-spec-password1', name: 'Proposal Owner' })
    .expect(201);
  token = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'prop@spec.in', password: 'prop-spec-password1' })
      .expect(200)
  ).body.data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'Proposal Spec Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;
  await request(app).post('/api/v1/accounts/import-template').set(auth()).expect(201);
  customerId = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth())
      .send({ type: ['customer'], name: 'Proposal Customer', placeOfSupplyStateCode: '24' })
      .expect(201)
  ).body.data.party.id;
}, 180_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('write tools and proposals (I10)', () => {
  let proposalId: string;

  it('a write tool returns a proposal and performs ZERO writes', async () => {
    const conversation = (
      await request(app).post('/api/v1/ai/conversations').set(auth()).expect(201)
    ).body.data.id;
    const invoicesBefore = await Invoice.countDocuments({}, { skipTenantScope: true } as never);

    stub.script = [
      { toolCall: { name: 'proposeInvoice', args: INVOICE_INPUT() }, tokens: 5 },
      { content: 'I have drafted the invoice for your confirmation.', tokens: 5 },
    ];
    await request(app)
      .post(`/api/v1/ai/conversations/${conversation}/messages`)
      .set(auth())
      .send({ message: 'draft an invoice for 2 units at 5000' })
      .expect(200);

    const invoicesAfter = await Invoice.countDocuments({}, { skipTenantScope: true } as never);
    expect(invoicesAfter).toBe(invoicesBefore); // ZERO business writes

    const proposal = await AiProposal.findOne({}, null, { skipTenantScope: true }).lean();
    expect(proposal).toBeTruthy();
    expect(proposal!.status).toBe('proposed');
    proposalId = String(proposal!._id);
  });

  it('confirm produces an IDENTICAL result to doing it by hand', async () => {
    // by hand, the same input:
    const manual = (
      await request(app).post('/api/v1/invoices').set(idem()).send(INVOICE_INPUT()).expect(201)
    ).body.data.invoice;

    const confirmed = (
      await request(app).post(`/api/v1/ai/proposals/${proposalId}/confirm`).set(idem()).expect(201)
    ).body.data;
    const proposed = await Invoice.findOne({ _id: confirmed.result.invoiceId }, null, {
      skipTenantScope: true,
    } as never).lean();

    // identical computed economics — same engine, same path (I5)
    expect(proposed!.taxableValuePaise).toBe(manual.taxableValuePaise);
    expect(proposed!.cgstPaise).toBe(manual.cgstPaise);
    expect(proposed!.sgstPaise).toBe(manual.sgstPaise);
    expect(proposed!.grandTotalPaise).toBe(manual.grandTotalPaise);
    expect(proposed!.grandTotalPaise).toBe(11_80_000);
    expect(proposed!.status).toBe('draft'); // still a draft — issuing is human too

    // double-confirm → 409
    await request(app).post(`/api/v1/ai/proposals/${proposalId}/confirm`).set(idem()).expect(409);
  });

  it('confirm IGNORES a tampered stored preview and recomputes everything', async () => {
    const proposal = await AiProposal.create({
      companyId,
      conversationId: new Types.ObjectId(),
      type: 'invoice',
      payload: INVOICE_INPUT(),
      preview: { grandTotalPaise: 1, cgstPaise: 0 }, // tampered garbage
      proposedBy: customerId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const confirmed = (
      await request(app)
        .post(`/api/v1/ai/proposals/${proposal._id}/confirm`)
        .set(idem())
        .expect(201)
    ).body.data;
    expect(confirmed.result.grandTotalPaise).toBe(11_80_000); // recomputed, not 1
  });

  it('an expired proposal cannot be confirmed', async () => {
    const proposal = await AiProposal.create({
      companyId,
      conversationId: new Types.ObjectId(),
      type: 'invoice',
      payload: INVOICE_INPUT(),
      preview: {},
      proposedBy: customerId,
      expiresAt: new Date(Date.now() - 1_000), // already expired
    });
    const res = await request(app)
      .post(`/api/v1/ai/proposals/${proposal._id}/confirm`)
      .set(idem())
      .expect(409);
    expect(res.body.error.code).toBe('AI_PROPOSAL_EXPIRED');
    const after = await AiProposal.findById(proposal._id)
      .setOptions({ skipTenantScope: true } as never)
      .lean();
    expect(after!.status).toBe('expired');
  });

  it('a journal proposal confirms through the engine (balanced, gapless)', async () => {
    const accounts = (await request(app).get('/api/v1/accounts').set(auth()).expect(200)).body.data
      .accounts;
    const byCode = Object.fromEntries(
      accounts.map((a: { code: string; id: string }) => [a.code, a.id]),
    );
    const proposal = await AiProposal.create({
      companyId,
      conversationId: proposalId,
      type: 'journal_entry',
      payload: {
        date: '2026-07-05',
        narration: 'AI proposed accrual',
        lines: [
          { accountId: byCode['5300'], debitPaise: 25_000, creditPaise: 0 },
          { accountId: byCode['2160'], debitPaise: 0, creditPaise: 25_000 },
        ],
      },
      preview: {},
      proposedBy: customerId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const confirmed = (
      await request(app)
        .post(`/api/v1/ai/proposals/${proposal._id}/confirm`)
        .set(idem())
        .expect(201)
    ).body.data;
    expect(confirmed.result.entryNumber).toMatch(/^JV\/2026-27\/\d{5}$/);
  });
});
