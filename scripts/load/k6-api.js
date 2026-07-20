/**
 * Load test (plan.md §29.4) — run against STAGING, never production:
 *   k6 run -e BASE=https://staging.finpilot.in -e TOKEN=... -e COMPANY=... scripts/load/k6-api.js
 *
 * Targets (§29.4): GET /invoices p95 < 200ms @ 200rps;
 * POST /invoices/:id/issue p95 < 400ms @ 30rps.
 * The thresholds below FAIL the run if a target is missed — this script is
 * the pass/fail gate for the phase-24 load criterion.
 */
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE || 'http://localhost:4000';
const HEADERS = {
  Authorization: `Bearer ${__ENV.TOKEN}`,
  'X-Company-Id': __ENV.COMPANY,
  'Content-Type': 'application/json',
};

export const options = {
  scenarios: {
    list_invoices: {
      executor: 'constant-arrival-rate',
      exec: 'listInvoices',
      rate: 200, // 200 rps (§29.4)
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 100,
      maxVUs: 400,
    },
    issue_invoices: {
      executor: 'constant-arrival-rate',
      exec: 'issueInvoice',
      rate: 30, // 30 rps (§29.4)
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 30,
      maxVUs: 120,
    },
  },
  thresholds: {
    'http_req_duration{scenario:list_invoices}': ['p(95)<200'],
    'http_req_duration{scenario:issue_invoices}': ['p(95)<400'],
    http_req_failed: ['rate<0.01'],
  },
};

export function listInvoices() {
  const res = http.get(`${BASE}/api/v1/invoices`, { headers: HEADERS });
  check(res, { 'list 200': (r) => r.status === 200 });
}

export function issueInvoice() {
  // staging seed exposes a pool of draft ids via the fixtures endpoint;
  // issuing consumes a gapless number, so staging uses a throwaway company
  const draft = http.post(
    `${BASE}/api/v1/invoices`,
    JSON.stringify({
      partyId: __ENV.PARTY,
      issueDate: new Date().toISOString().slice(0, 10),
      lines: [{ description: 'load', qty: 1, ratePaise: 100_00, gstRate: 18 }],
    }),
    { headers: { ...HEADERS, 'Idempotency-Key': `${__VU}-${__ITER}-${Date.now()}` } },
  );
  if (draft.status !== 201) return;
  const id = draft.json('data.invoice.id');
  const res = http.post(`${BASE}/api/v1/invoices/${id}/issue`, null, {
    headers: { ...HEADERS, 'Idempotency-Key': `issue-${__VU}-${__ITER}-${Date.now()}` },
  });
  check(res, { 'issue 201': (r) => r.status === 201 });
}
