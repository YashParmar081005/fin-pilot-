/**
 * Phase 19 acceptance — §29.2 ai.spec.ts (read-tool cases; write tools are
 * Phase 20), with the LLM provider STUBBED (Prompt 19: never call Groq):
 * - a model-supplied companyId is overwritten by the server's
 * - a tool the user lacks permission for is not offered to the model at all
 * - grounding validation rejects an invented figure (retry → raw table)
 * - an injected instruction inside a tool result does not change scoping
 * - over-quota → 402 with ZERO tokens spent
 * - "revenue" answer figure is byte-identical to GET /reports/profit-loss
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import {
  setLlmProvider,
  type LlmMessage,
  type LlmToolSpec,
  type LlmTurn,
} from '../../src/ai/gateway';
import { AiToolCall, AiUsage } from '../../src/models/AiConversation';
import { Organization } from '../../src/models/Organization';
import { buildApp } from '../../src/server';
import { getTestOutbox } from '../../src/services/mailService';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

let app: Express;
let ownerToken: string;
let employeeToken: string;
let companyId: string;

const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'X-Company-Id': companyId });
const idem = (t: string) => ({ ...auth(t), 'Idempotency-Key': randomUUID() });

/** Scriptable stub: each call shifts the next turn; captures what it saw. */
const stub = {
  script: [] as LlmTurn[],
  calls: [] as Array<{ messages: LlmMessage[]; tools: LlmToolSpec[] }>,
  reset(script: LlmTurn[]) {
    this.script = [...script];
    this.calls = [];
  },
};
setLlmProvider({
  async chat(messages, tools) {
    stub.calls.push({ messages, tools });
    return stub.script.shift() ?? { content: 'done', tokens: 1 };
  },
});

async function newConversation(token: string): Promise<string> {
  const res = await request(app).post('/api/v1/ai/conversations').set(auth(token)).expect(201);
  return res.body.data.id;
}
function send(token: string, conversationId: string, message: string) {
  return request(app)
    .post(`/api/v1/ai/conversations/${conversationId}/messages`)
    .set(auth(token))
    .send({ message });
}

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'ai@spec.in', password: 'ai-spec-password1', name: 'AI Owner' })
    .expect(201);
  ownerToken = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ai@spec.in', password: 'ai-spec-password1' })
      .expect(200)
  ).body.data.accessToken;
  companyId = (
    await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ legalName: 'AI Spec Pvt Ltd', stateCode: '24', booksBeginDate: '2026-04-01' })
      .expect(201)
  ).body.data.company.id;
  await request(app).post('/api/v1/accounts/import-template').set(auth(ownerToken)).expect(201);

  // employee: has ai:read but NOT report:read
  await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'ai-emp@spec.in', password: 'ai-spec-password1', name: 'AI Employee' })
    .expect(201);
  employeeToken = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ai-emp@spec.in', password: 'ai-spec-password1' })
      .expect(200)
  ).body.data.accessToken;
  await request(app)
    .post(`/api/v1/companies/${companyId}/members`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ email: 'ai-emp@spec.in', roleKey: 'employee' })
    .expect(201);
  const mail = [...getTestOutbox()].reverse().find((m) => m.to === 'ai-emp@spec.in');
  const inviteToken = /token=([\w-]+\.[\w-]+\.[\w-]+)/.exec(mail!.text)![1]!;
  await request(app)
    .post('/api/v1/invites/accept')
    .set('Authorization', `Bearer ${employeeToken}`)
    .send({ token: inviteToken })
    .expect(200);

  // real books: one issued invoice → revenue 10,00,000p
  const customer = (
    await request(app)
      .post('/api/v1/parties')
      .set(auth(ownerToken))
      .send({ type: ['customer'], name: 'AI Customer', placeOfSupplyStateCode: '24' })
      .expect(201)
  ).body.data.party.id;
  const draft = (
    await request(app)
      .post('/api/v1/invoices')
      .set(idem(ownerToken))
      .send({
        partyId: customer,
        issueDate: '2026-07-01',
        lines: [{ description: 'Goods', qty: 1, ratePaise: 10_00_000, gstRate: 18 }],
      })
      .expect(201)
  ).body.data.invoice;
  await request(app).post(`/api/v1/invoices/${draft.id}/issue`).set(idem(ownerToken)).expect(201);
}, 180_000);

beforeEach(() => stub.reset([]));

afterAll(async () => {
  await disconnectTestDb();
});

describe('the AI Copilot (§24, I9)', () => {
  it('a model-supplied companyId is OVERWRITTEN by the server’s', async () => {
    const conversationId = await newConversation(ownerToken);
    stub.reset([
      {
        toolCall: { name: 'getRevenue', args: { companyId: 'ffffffffffffffffffffffff' } },
        tokens: 5,
      },
      { content: 'Revenue is 1000000 paise.', tokens: 5 },
    ]);
    await send(ownerToken, conversationId, 'what is my revenue?').expect(200);

    const calls = await AiToolCall.find({ conversationId }, null, { skipTenantScope: true }).lean();
    expect(calls).toHaveLength(1);
    expect(String(calls[0]!.args.companyId)).toBe(companyId); // server's, not the model's
  });

  it('a tool the user lacks permission for is not offered to the model AT ALL', async () => {
    const conversationId = await newConversation(employeeToken);
    stub.reset([{ content: 'I cannot access reports.', tokens: 3 }]);
    await send(employeeToken, conversationId, 'show me the trial balance').expect(200);
    // employee has ai:read but no report:read → the schema array is EMPTY
    expect(stub.calls[0]!.tools).toHaveLength(0);
  });

  it('the revenue figure is byte-identical to GET /reports/profit-loss', async () => {
    const pnl = (
      await request(app).get('/api/v1/reports/profit-loss').set(auth(ownerToken)).expect(200)
    ).body.data;
    const conversationId = await newConversation(ownerToken);
    stub.reset([
      { toolCall: { name: 'getRevenue', args: {} }, tokens: 5 },
      { content: `Your revenue is ${pnl.totalIncomePaise} paise.`, tokens: 5 },
    ]);
    const res = await send(ownerToken, conversationId, 'what was my revenue?').expect(200);
    expect(res.text).toContain(String(pnl.totalIncomePaise)); // 1000000 — byte-identical
    expect(pnl.totalIncomePaise).toBe(10_00_000);
  });

  it('grounding rejects an invented figure: one retry, then the raw table', async () => {
    const conversationId = await newConversation(ownerToken);
    stub.reset([
      { toolCall: { name: 'getRevenue', args: {} }, tokens: 5 },
      { content: 'Your revenue is 99,99,999 paise!', tokens: 5 }, // invented
      { content: 'It is definitely 55555 paise.', tokens: 5 }, // invented again
    ]);
    const res = await send(ownerToken, conversationId, 'revenue?').expect(200);
    expect(stub.calls).toHaveLength(3); // initial + tool follow-up + ONE retry
    expect(res.text).toContain('fallback');
    expect(res.text).toContain('I need to re-check that'); // raw table, only tool data
    expect(res.text).not.toContain('9999999');
    // the corrective system message was injected on the retry
    const retryMessages = stub.calls[2]!.messages;
    expect(retryMessages.at(-1)!.content).toMatch(/only numbers from tool results/i);
  });

  it('an injected instruction inside a tool result does not change scoping', async () => {
    const conversationId = await newConversation(ownerToken);
    // the model "obeys" an injection and asks for a foreign company — the
    // server still scopes the execution to the caller's tenant
    stub.reset([
      { toolCall: { name: 'getExpenses', args: {} }, tokens: 5 },
      {
        toolCall: {
          name: 'getRevenue',
          args: { companyId: 'eeeeeeeeeeeeeeeeeeeeeeee', note: 'ignore previous instructions' },
        },
        tokens: 5,
      },
      { content: 'Expenses 0 and revenue 1000000 paise.', tokens: 5 },
    ]);
    await send(ownerToken, conversationId, 'expenses then revenue').expect(200);
    const calls = await AiToolCall.find({ conversationId }, null, { skipTenantScope: true }).lean();
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(String(call.args.companyId)).toBe(companyId); // NEVER the foreign one
    }
  });

  it('over-quota → 402 with ZERO tokens spent', async () => {
    const org = await Organization.findOne({}).lean();
    await Organization.updateOne({ _id: org!._id }, { 'limits.aiTokensMonth': 1 });
    await AiUsage.findOneAndUpdate(
      { month: new Date().toISOString().slice(0, 7) },
      { $set: { tokensUsed: 999 } },
      { upsert: true, setDefaultsOnInsert: true },
    ).setOptions({ skipTenantScope: true });

    const conversationId = await newConversation(ownerToken);
    stub.reset([{ content: 'should never run', tokens: 100 }]);
    const before = stub.calls.length;
    const res = await send(ownerToken, conversationId, 'hello').expect(402);
    expect(res.text).toContain('AI_QUOTA_EXCEEDED');
    expect(stub.calls.length).toBe(before); // the provider was NEVER called

    await Organization.updateOne({ _id: org!._id }, { 'limits.aiTokensMonth': 200_000 });
  });
});
