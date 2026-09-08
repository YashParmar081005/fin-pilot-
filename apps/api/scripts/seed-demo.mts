/**
 * Seed a realistic Indian SME's books against the RUNNING API.
 *
 * Two jobs in one script:
 *   1. Give the app data. An empty database renders empty dashboards, blank
 *      charts and "nothing here yet" tables, which reads as a broken product.
 *   2. Act as an end-to-end smoke test. Every step is a real HTTP call through
 *      the real middleware, so a broken endpoint fails here loudly, by name,
 *      instead of being discovered by clicking around.
 *
 * Usage:  pnpm --filter @finpilot/api seed:demo
 *         API_URL=http://localhost:4000 pnpm --filter @finpilot/api seed:demo
 */
import { randomUUID } from 'node:crypto';
import { makeTextLayerPdf, makeTextPng } from '../tests/helpers/ocrFixtures';

const API = process.env.API_URL ?? 'http://localhost:4000';
const EMAIL = process.env.SEED_EMAIL ?? 'owner@finpilot.demo';
const PASSWORD = process.env.SEED_PASSWORD ?? 'finpilot-demo-password1';

let token: string | null = null;
let companyId: string | null = null;

const failures: { step: string; detail: string }[] = [];
let passed = 0;

function headers(idem: boolean): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(companyId ? { 'X-Company-Id': companyId } : {}),
    ...(idem ? { 'Idempotency-Key': randomUUID() } : {}),
  };
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function req<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: headers(method !== 'GET'),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { code: string; message: string; details?: unknown };
  };
  if (!res.ok) {
    throw new ApiError(
      res.status,
      json.error?.code ?? `HTTP_${res.status}`,
      json.error?.message ?? res.statusText,
      json.error?.details,
    );
  }
  return json.data as T;
}

/** Run a labelled step, recording the failure instead of aborting the run. */
async function step<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const out = await fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
    return out;
  } catch (err) {
    const detail =
      err instanceof ApiError
        ? `${err.status} ${err.code}: ${err.message}${
            err.details ? ` — ${JSON.stringify(err.details)}` : ''
          }`
        : err instanceof Error
          ? err.message
          : String(err);
    failures.push({ step: label, detail });
    console.log(`  \x1b[31m✗\x1b[0m ${label}\n      \x1b[31m${detail}\x1b[0m`);
    return null;
  }
}

function heading(text: string): void {
  console.log(`\n\x1b[1m${text}\x1b[0m`);
}

/** FY 2026-27 runs Apr 2026 → Mar 2027; keep every date inside the open books. */
const d = (month: number, day: number): string =>
  `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

async function main(): Promise<void> {
  console.log(`\nSeeding FinPilot demo data against ${API}\n${'─'.repeat(58)}`);

  heading('1. Account and company');

  // Register is fine to fail — a re-run just logs in to the existing owner.
  try {
    await req('POST', '/api/v1/auth/register', {
      email: EMAIL,
      password: PASSWORD,
      name: 'Demo Owner',
    });
    console.log('  \x1b[32m✓\x1b[0m registered a new owner');
    passed++;
  } catch {
    console.log('  \x1b[2m•\x1b[0m owner already exists — signing in instead');
  }

  const login = await step('sign in', () =>
    req<{ accessToken: string }>('POST', '/api/v1/auth/login', {
      email: EMAIL,
      password: PASSWORD,
    }),
  );
  if (!login) {
    console.error('\nCannot continue without a session.');
    return summarise();
  }
  token = login.accessToken;

  const existing = await step('list companies', () =>
    req<{ companies: { id: string; legalName: string }[] }>('GET', '/api/v1/companies'),
  );
  const already = existing?.companies.find((c) => c.legalName === 'Sunrise Traders Pvt Ltd');
  if (already) {
    companyId = already.id;
    console.log('  \x1b[2m•\x1b[0m reusing the existing demo company');
  } else {
    const company = await step('create company (Gujarat, state 24)', () =>
      req<{ company: { id: string } }>('POST', '/api/v1/companies', {
        legalName: 'Sunrise Traders Pvt Ltd',
        stateCode: '24',
        gstin: '24AAPFU0939F1Z1',
        booksBeginDate: '2026-04-01',
      }),
    );
    if (!company) return summarise();
    companyId = company.company.id;
  }

  heading('2. Chart of accounts');
  await step('seed the Indian SME chart', () =>
    req('POST', '/api/v1/accounts/import-template', {}),
  );
  const accounts = await step('load accounts', () =>
    req<{ accounts: { id: string; code: string; name: string }[] }>('GET', '/api/v1/accounts'),
  );
  const byCode = new Map((accounts?.accounts ?? []).map((a) => [a.code, a.id]));
  const bankAcctId = byCode.get('1120') ?? byCode.get('1110');

  heading('3. Customers and vendors');
  // The seed is re-runnable: anything already present is reused rather than
  // duplicated, so running it twice does not produce two of every customer.
  const existingParties = await step('load existing parties', () =>
    req<{ parties: { id: string; name: string }[] }>('GET', '/api/v1/parties'),
  );
  const partyByName = new Map((existingParties?.parties ?? []).map((p) => [p.name, p.id]));
  const parties: Record<string, string> = {};
  const partySpecs: {
    key: string;
    type: string[];
    name: string;
    gstin?: string;
    state: string;
    creditDays?: number;
  }[] = [
    {
      key: 'cust_mh',
      type: ['customer'],
      name: 'Maharashtra Mills',
      gstin: '27AAPFU0939F1ZV',
      state: '27',
      creditDays: 30,
    },
    {
      key: 'cust_gj',
      type: ['customer'],
      name: 'Ahmedabad Retail LLP',
      gstin: '24AALCA1533G1Z1',
      state: '24',
      creditDays: 30,
    },
    {
      key: 'cust_ka',
      type: ['customer'],
      name: 'Bengaluru Softworks',
      state: '29',
      creditDays: 45,
    },
    { key: 'cust_dl', type: ['customer'], name: 'Delhi Distributors', state: '07', creditDays: 15 },
    { key: 'vend_gj', type: ['vendor'], name: 'Gujarat Packaging Co', state: '24' },
    { key: 'vend_mh', type: ['vendor'], name: 'Mumbai Logistics', state: '27' },
    { key: 'vend_util', type: ['vendor'], name: 'Torrent Power', state: '24' },
  ];
  for (const p of partySpecs) {
    const found = partyByName.get(p.name);
    if (found) {
      parties[p.key] = found;
      if (p.creditDays !== undefined) {
        await step(`  set ${p.creditDays}-day terms on ${p.name}`, () =>
          req('PATCH', `/api/v1/parties/${found}`, { creditDays: p.creditDays }),
        );
      }
      continue;
    }
    const created = await step(`party — ${p.name}`, () =>
      req<{ party: { id: string } }>('POST', '/api/v1/parties', {
        type: p.type,
        name: p.name,
        ...(p.gstin ? { gstin: p.gstin, gstRegistrationType: 'regular' } : {}),
        placeOfSupplyStateCode: p.state,
        // Without credit terms every invoice is due the day it is issued, so
        // a healthy ledger reads as 100% overdue on the dashboard.
        ...(p.creditDays === undefined ? {} : { creditDays: p.creditDays }),
      }),
    );
    if (created) parties[p.key] = created.party.id;
  }

  heading('4. Items');
  const existingItems = await step('load existing items', () =>
    req<{ items: { id: string; name: string }[] }>('GET', '/api/v1/items'),
  );
  const itemNames = new Set((existingItems?.items ?? []).map((i) => i.name));
  for (const item of [
    { kind: 'goods', name: 'Steel Fittings (per box)', hsn: '7307', gstRate: 18 },
    { kind: 'goods', name: 'Packaging Film', hsn: '3920', gstRate: 18 },
    { kind: 'service', name: 'Annual Maintenance Contract', sac: '998719', gstRate: 18 },
    { kind: 'goods', name: 'Food Grade Container', hsn: '3923', gstRate: 5 },
  ]) {
    if (itemNames.has(item.name)) continue;
    await step(`item — ${item.name}`, () => req('POST', '/api/v1/items', item));
  }

  heading('5. Sales invoices across the year');
  // Spread across Apr–Sep so the cash-flow and P&L charts have a real shape.
  const invoicePlan = [
    {
      party: 'cust_gj',
      month: 4,
      day: 8,
      rate: 1_85_000_0,
      gst: 18,
      desc: 'Steel fittings — April supply',
    },
    {
      party: 'cust_mh',
      month: 4,
      day: 22,
      rate: 2_40_000_0,
      gst: 18,
      desc: 'Packaging film — bulk',
    },
    { party: 'cust_ka', month: 5, day: 6, rate: 1_20_000_0, gst: 18, desc: 'AMC — Q1' },
    {
      party: 'cust_gj',
      month: 5,
      day: 19,
      rate: 3_10_000_0,
      gst: 18,
      desc: 'Steel fittings — May supply',
    },
    { party: 'cust_dl', month: 6, day: 3, rate: 95_000_0, gst: 5, desc: 'Food grade containers' },
    {
      party: 'cust_mh',
      month: 6,
      day: 25,
      rate: 2_75_000_0,
      gst: 18,
      desc: 'Packaging film — June',
    },
    { party: 'cust_ka', month: 7, day: 11, rate: 1_60_000_0, gst: 18, desc: 'AMC — Q2' },
    {
      party: 'cust_gj',
      month: 7,
      day: 28,
      rate: 3_45_000_0,
      gst: 18,
      desc: 'Steel fittings — July supply',
    },
    {
      party: 'cust_dl',
      month: 8,
      day: 9,
      rate: 1_15_000_0,
      gst: 5,
      desc: 'Food grade containers — Aug',
    },
    {
      party: 'cust_mh',
      month: 8,
      day: 21,
      rate: 2_95_000_0,
      gst: 18,
      desc: 'Packaging film — August',
    },
    {
      party: 'cust_gj',
      month: 9,
      day: 2,
      rate: 2_20_000_0,
      gst: 18,
      desc: 'Steel fittings — September',
    },
    { party: 'cust_ka', month: 9, day: 5, rate: 1_75_000_0, gst: 18, desc: 'AMC — renewal' },
  ];

  const existingInvoices = await step('load existing invoices', () =>
    req<{ invoices: { id: string; status: string; grandTotalPaise: number }[] }>(
      'GET',
      '/api/v1/invoices',
    ),
  );
  const alreadyIssued = (existingInvoices?.invoices ?? []).filter((i) => i.status !== 'draft');
  if (alreadyIssued.length >= invoicePlan.length) {
    console.log(`  [2m•[0m ${alreadyIssued.length} invoices already issued — not adding more`);
  }

  const issued: { id: string; grand: number; month: number; party: string }[] = [];
  for (const plan of alreadyIssued.length >= invoicePlan.length ? [] : invoicePlan) {
    const partyId = parties[plan.party];
    if (!partyId) continue;
    const draft = await step(`invoice draft — ${plan.desc}`, () =>
      req<{ invoice: { id: string } }>('POST', '/api/v1/invoices', {
        partyId,
        issueDate: d(plan.month, plan.day),
        lines: [{ description: plan.desc, qty: 1, ratePaise: plan.rate, gstRate: plan.gst }],
      }),
    );
    if (!draft) continue;
    const live = await step(`  issue it (gapless number + ledger entry)`, () =>
      req<{ invoice: { id: string; grandTotalPaise: number } }>(
        'POST',
        `/api/v1/invoices/${draft.invoice.id}/issue`,
        {},
      ),
    );
    if (live) {
      issued.push({
        id: live.invoice.id,
        grand: live.invoice.grandTotalPaise,
        month: plan.month,
        party: plan.party,
      });
    }
  }

  heading('5b. Two current invoices (explicit terms, not yet due)');
  // Everything above is due on issue for customers created before terms
  // existed, which makes 100% of open AR overdue. Real books have both, so
  // ensure a couple of invoices are genuinely still within terms.
  const CURRENT_MARKER = 'Q3 supply — net 30';
  const openNow = (existingInvoices?.invoices ?? []).length;
  void openNow;
  const alreadyCurrent = await step('check for current invoices', () =>
    req<{ invoices: { id: string; dueDate: string; status: string }[] }>('GET', '/api/v1/invoices'),
  );
  const hasFutureDue = (alreadyCurrent?.invoices ?? []).some(
    (i) =>
      i.status !== 'draft' && i.status !== 'paid' && new Date(i.dueDate).getTime() > Date.now(),
  );
  if (!hasFutureDue) {
    for (const spec of [
      { party: 'cust_mh', rate: 2_60_000_0, due: '2026-10-08' },
      { party: 'cust_gj', rate: 1_45_000_0, due: '2026-10-20' },
    ]) {
      const partyId = parties[spec.party];
      if (!partyId) continue;
      const draft = await step(`current invoice — ${CURRENT_MARKER} (due ${spec.due})`, () =>
        req<{ invoice: { id: string } }>('POST', '/api/v1/invoices', {
          partyId,
          issueDate: d(9, 6),
          dueDate: spec.due,
          lines: [{ description: CURRENT_MARKER, qty: 1, ratePaise: spec.rate, gstRate: 18 }],
        }),
      );
      if (draft) {
        await step('  issue it', () =>
          req('POST', `/api/v1/invoices/${draft.invoice.id}/issue`, {}),
        );
      }
    }
  } else {
    console.log('  [2m•[0m current (not-yet-due) invoices already exist');
  }

  heading('6. Customer payments (leaving a realistic ageing tail)');
  // Pay everything up to July in full; leave August and September outstanding
  // so Aged Receivables actually has buckets to show.
  for (const inv of issued.filter((i) => i.month <= 7)) {
    const payer = parties[inv.party];
    if (!bankAcctId || !payer) break;
    await step(`payment for invoice ${inv.id.slice(-6)}`, () =>
      req('POST', '/api/v1/payments', {
        direction: 'inflow',
        partyId: payer,
        date: d(Math.min(inv.month + 1, 9), 12),
        amountPaise: inv.grand,
        depositAccountId: bankAcctId,
        allocations: [{ documentModel: 'Invoice', documentId: inv.id, amountPaise: inv.grand }],
      }),
    );
  }

  heading('7. Vendor bills');
  const billPlan = [
    { party: 'vend_gj', month: 4, day: 12, rate: 85_000_0, desc: 'Raw packaging stock' },
    { party: 'vend_mh', month: 5, day: 15, rate: 42_000_0, desc: 'Freight — May' },
    { party: 'vend_gj', month: 6, day: 18, rate: 1_10_000_0, desc: 'Raw packaging stock' },
    { party: 'vend_mh', month: 7, day: 20, rate: 55_000_0, desc: 'Freight — July' },
    { party: 'vend_gj', month: 8, day: 14, rate: 1_35_000_0, desc: 'Raw packaging stock' },
    { party: 'vend_util', month: 9, day: 4, rate: 28_000_0, desc: 'Electricity — August' },
  ];
  const existingBills = await step('load existing bills', () =>
    req<{
      bills: {
        id: string;
        status: string;
        vendorBillNumber: string;
        grandTotalPaise: number;
        amountPaidPaise: number;
      }[];
    }>('GET', '/api/v1/bills'),
  );
  const billByNumber = new Map((existingBills?.bills ?? []).map((b) => [b.vendorBillNumber, b]));

  // `due` drives the payment step: a bill already settled on an earlier run
  // must not be paid twice.
  const approvedBills: { id: string; due: number; party: string; month: number }[] = [];
  for (const [i, plan] of billPlan.entries()) {
    const partyId = parties[plan.party];
    if (!partyId) continue;
    const number = `VB-2026-${String(i + 1).padStart(3, '0')}`;
    const prior = billByNumber.get(number);
    if (prior) {
      // Already created on an earlier run — make sure it is approved, since a
      // draft bill posts nothing and leaves payables at ₹0.
      if (prior.status === 'draft') {
        const live = await step(`approve existing bill ${number}`, () =>
          req<{ bill: { id: string; grandTotalPaise: number } }>(
            'POST',
            `/api/v1/bills/${prior.id}/approve`,
            {},
          ),
        );
        if (live) {
          approvedBills.push({
            id: live.bill.id,
            due: live.bill.grandTotalPaise,
            party: plan.party,
            month: plan.month,
          });
        }
      } else {
        approvedBills.push({
          id: prior.id,
          due: prior.grandTotalPaise - (prior.amountPaidPaise ?? 0),
          party: plan.party,
          month: plan.month,
        });
      }
      continue;
    }
    const bill = await step(`bill — ${plan.desc} (${d(plan.month, plan.day)})`, () =>
      req<{ bill: { id: string } }>('POST', '/api/v1/bills', {
        partyId,
        vendorBillNumber: `VB-2026-${String(i + 1).padStart(3, '0')}`,
        billDate: d(plan.month, plan.day),
        lines: [
          {
            description: plan.desc,
            qty: 1,
            ratePaise: plan.rate,
            gstRate: 18,
            cessRate: 0,
            itcEligible: true,
          },
        ],
      }),
    );
    if (!bill) continue;
    // A draft bill posts nothing. Without approval the books show ₹0 payables
    // and no purchase costs, which makes a working P&L look broken.
    const live = await step(`  approve it (Dr purchases + input GST, Cr payables)`, () =>
      req<{ bill: { id: string; grandTotalPaise: number } }>(
        'POST',
        `/api/v1/bills/${bill.bill.id}/approve`,
        {},
      ),
    );
    if (live) {
      approvedBills.push({
        id: live.bill.id,
        due: live.bill.grandTotalPaise,
        party: plan.party,
        month: plan.month,
      });
    }
  }

  heading('7b. Pay some vendors (the rest ages into AP buckets)');
  for (const bill of approvedBills.filter((b) => b.month <= 6 && b.due > 0)) {
    const partyId = parties[bill.party];
    if (!partyId || !bankAcctId) continue;
    await step(`vendor payment for bill ${bill.id.slice(-6)}`, () =>
      req('POST', '/api/v1/payments', {
        direction: 'outflow',
        partyId,
        date: d(Math.min(bill.month + 1, 9), 20),
        amountPaise: bill.due,
        depositAccountId: bankAcctId,
        allocations: [{ documentModel: 'Bill', documentId: bill.id, amountPaise: bill.due }],
      }),
    );
  }

  heading('8. Expenses');
  const travel = byCode.get('5350') ?? byCode.get('5300');
  if (travel) {
    for (const exp of [
      { month: 5, day: 9, amt: 2_50_000, desc: 'Client visit — Ahmedabad' },
      { month: 7, day: 17, amt: 1_80_000, desc: 'Trade fair travel — Mumbai' },
      { month: 9, day: 3, amt: 95_000, desc: 'Local conveyance — September' },
    ]) {
      await step(`expense — ${exp.desc}`, () =>
        req('POST', '/api/v1/expenses', {
          date: d(exp.month, exp.day),
          amountPaise: exp.amt,
          expenseAccountId: travel,
          description: exp.desc,
        }),
      );
    }
  } else {
    failures.push({ step: 'expenses', detail: 'no travel expense account in the chart' });
  }

  heading('9. Banking and reconciliation');
  const banks = await step('load bank accounts', () =>
    req<{ bankAccounts: { _id: string; name: string }[] }>('GET', '/api/v1/bank-accounts'),
  );
  const BANK_NAME = 'HDFC Current 1234';
  let bankId = (banks?.bankAccounts ?? []).find((b) => b.name === BANK_NAME)?._id;
  if (!bankId) {
    const created = await step('create bank account', () =>
      req<{ bankAccount: { _id: string } }>('POST', '/api/v1/bank-accounts', {
        name: BANK_NAME,
        bankName: 'HDFC',
        accountNumberMasked: 'XX1234',
      }),
    );
    bankId = created?.bankAccount._id;
  }

  if (bankId) {
    // Import is fingerprint-deduped server-side, so re-running adds nothing.
    const csv = [
      'Txn Date,Description,Debit,Credit,Ref',
      '05/08/2026,"NEFT CR AHMEDABAD RETAIL",,"2,18,300.00",UTR20260805',
      '12/08/2026,"NEFT CR MAHARASHTRA MILLS",,"3,48,100.00",UTR20260812',
      '14/08/2026,"RTGS DR GUJARAT PACKAGING","1,59,300.00",,RTGS20260814',
      '20/08/2026,"UPI DR MUMBAI LOGISTICS","64,900.00",,UPI20260820',
      '01/09/2026,"CHQ PAID OFFICE RENT","85,000.00",,CHQ4471',
      '04/09/2026,"NEFT DR TORRENT POWER","33,040.00",,UTR20260904',
    ].join('\n');
    await step('import a bank statement (CSV)', () =>
      req(`POST`, `/api/v1/bank-accounts/${bankId}/import`, {
        csv,
        mapping: {
          date: 'Txn Date',
          narration: 'Description',
          credit: 'Credit',
          debit: 'Debit',
          reference: 'Ref',
        },
      }),
    );
    await step('read imported transactions', () =>
      req(`GET`, `/api/v1/bank-accounts/${bankId}/transactions`),
    );
  }

  heading('10. Documents and OCR');
  const invoiceLines = [
    'Gujarat Packaging Co',
    'GSTIN: 24AALCA1533G1Z1',
    'Invoice No: GPC-4471',
    'Date: 05/09/2026',
    'Taxable Value: 60,000.00',
    'GST Amount: 10,800.00',
    'Total: 70,800.00',
  ];
  const priorDocs = await step('load existing documents', () =>
    req<{ documents: { id: string; filename: string }[] }>('GET', '/api/v1/documents'),
  );
  const docNames = new Set((priorDocs?.documents ?? []).map((doc) => doc.filename));
  if (docNames.has('gpc-4471.pdf') && docNames.has('vendor-bill-photo.png')) {
    console.log('  [2m•[0m demo documents already extracted');
  } else {
    await step('upload a digital PDF (text layer, ₹0 to read)', () =>
      req('POST', '/api/v1/documents', {
        filename: 'gpc-4471.pdf',
        mimeType: 'application/pdf',
        contentBase64: makeTextLayerPdf(invoiceLines).toString('base64'),
      }),
    );
    await step('upload a photographed bill (Tesseract OCR)', () =>
      req('POST', '/api/v1/documents', {
        filename: 'vendor-bill-photo.png',
        mimeType: 'image/png',
        contentBase64: makeTextPng(invoiceLines).toString('base64'),
      }),
    );
  }

  heading('11. Read every dashboard surface');
  const surfaces: [string, string][] = [
    ['health score', '/api/v1/forecast/health'],
    ['cash-flow forecast', '/api/v1/forecast/cash-flow'],
    ['anomalies', '/api/v1/forecast/anomalies'],
    ['aged receivables', '/api/v1/reports/aged-receivables'],
    ['aged payables', '/api/v1/reports/aged-payables'],
    ['profit and loss', '/api/v1/reports/profit-loss'],
    ['trial balance', '/api/v1/reports/trial-balance'],
    ['balance sheet', '/api/v1/reports/balance-sheet'],
    ['invoices', '/api/v1/invoices'],
    ['bills', '/api/v1/bills'],
    ['expenses', '/api/v1/expenses'],
    ['payments', '/api/v1/payments'],
    ['parties', '/api/v1/parties'],
    ['items', '/api/v1/items'],
    ['journal entries', '/api/v1/journal-entries'],
    ['documents list', '/api/v1/documents'],
    ['notifications', '/api/v1/notifications'],
    ['billing / plan', '/api/v1/billing'],
    ['bank accounts', '/api/v1/bank-accounts'],
  ];
  for (const [label, path] of surfaces) {
    await step(`GET ${label}`, () => req('GET', path));
  }

  summarise();
}

function summarise(): void {
  console.log(`\n${'─'.repeat(58)}`);
  console.log(
    `\x1b[1mSeed complete\x1b[0m — \x1b[32m${passed} ok\x1b[0m, ` +
      `${failures.length > 0 ? `\x1b[31m${failures.length} failed\x1b[0m` : '0 failed'}`,
  );
  if (failures.length > 0) {
    console.log('\n\x1b[1mBroken steps\x1b[0m');
    for (const f of failures) console.log(`  • ${f.step}\n    ${f.detail}`);
    process.exitCode = 1;
  }
}

await main();
