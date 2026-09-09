/**
 * Seed a month of deliberately varied GST cases, so GSTR-1 and GSTR-3B can be
 * checked field by field.
 *
 * Everything lands in ONE period (2026-10) that nothing else writes to, so the
 * returns for that month contain these invoices and nothing else and the
 * totals can be added up by hand. docs/dummy/gst-checks.md records the
 * expected figures.
 *
 * The cases target what the engine actually emits — b2b, b2cs, the rate
 * groups inside itm_det, cess, and the ITC side of 3B. It does not pretend to
 * cover sections the engine does not produce (b2cl, cdnr, hsn, exports), nor
 * reverse charge, which the create-invoice contract cannot set.
 *
 * Usage:  pnpm --filter @finpilot/api gst:cases
 */
import { randomUUID } from 'node:crypto';
import { gstinCheckDigit } from '@finpilot/shared';

const API = process.env.API_URL ?? 'http://localhost:4000';
const EMAIL = process.env.SEED_EMAIL ?? 'owner@finpilot.demo';
const PASSWORD = process.env.SEED_PASSWORD ?? 'finpilot-demo-password1';
/** A month of its own, so these are the only figures in the return. */
const PERIOD_MONTH = 10;

let token: string | null = null;
let companyId: string | null = null;
const failures: string[] = [];
let passed = 0;

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(companyId ? { 'X-Company-Id': companyId } : {}),
      ...(method !== 'GET' ? { 'Idempotency-Key': randomUUID() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { code: string; message: string; details?: unknown };
  };
  if (!res.ok) {
    throw new Error(
      `${res.status} ${json.error?.code}: ${json.error?.message}` +
        (json.error?.details ? ` — ${JSON.stringify(json.error.details)}` : ''),
    );
  }
  return json.data as T;
}

async function step<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const out = await fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
    return out;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    failures.push(`${label}: ${detail}`);
    console.log(`  \x1b[31m✗\x1b[0m ${label}\n      \x1b[31m${detail}\x1b[0m`);
    return null;
  }
}

const gstin = (first14: string) => first14 + gstinCheckDigit(first14);
const d = (day: number) =>
  `2026-${String(PERIOD_MONTH).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

interface Line {
  description: string;
  hsn?: string;
  qty: number;
  ratePaise: number;
  gstRate: number;
  cessRate?: number;
  discountPercent?: number;
}

async function main(): Promise<void> {
  console.log(`\nSeeding GST cases into 2026-${PERIOD_MONTH} against ${API}\n${'─'.repeat(60)}`);

  token = (
    await req<{ accessToken: string }>('POST', '/api/v1/auth/login', {
      email: EMAIL,
      password: PASSWORD,
    })
  ).accessToken;
  const comps = await req<{ companies: { id: string; legalName: string }[] }>(
    'GET',
    '/api/v1/companies',
  );
  const company = comps.companies.find((c) => c.legalName === 'Sunrise Traders Pvt Ltd');
  if (!company) {
    console.error('Run `pnpm --filter @finpilot/api seed:demo` first.');
    process.exitCode = 1;
    return;
  }
  companyId = company.id;

  // ── parties (reused on a re-run) ─────────────────────────────────────────
  console.log('\n\x1b[1mParties\x1b[0m');
  const existing = await req<{ parties: { id: string; name: string }[] }>('GET', '/api/v1/parties');
  const byName = new Map(existing.parties.map((p) => [p.name, p.id]));
  const ids: Record<string, string> = {};

  const specs = [
    // registered -> b2b, keyed by their GSTIN
    {
      key: 'reg_gj',
      name: 'GST Case — Registered Gujarat',
      state: '24',
      gstin: gstin('24AAGCG1234H1Z'),
      type: ['customer'],
    },
    {
      key: 'reg_mh',
      name: 'GST Case — Registered Maharashtra',
      state: '27',
      gstin: gstin('27AAGCG1234H1Z'),
      type: ['customer'],
    },
    // unregistered -> b2cs, grouped by place of supply and rate
    { key: 'unreg_gj', name: 'GST Case — Unregistered Gujarat', state: '24', type: ['customer'] },
    { key: 'unreg_kl', name: 'GST Case — Unregistered Kerala', state: '32', type: ['customer'] },
    // vendors -> the ITC half of 3B
    {
      key: 'vend_gj',
      name: 'GST Case — Vendor Gujarat',
      state: '24',
      gstin: gstin('24AAHCV5678K1Z'),
      type: ['vendor'],
    },
    {
      key: 'vend_ka',
      name: 'GST Case — Vendor Karnataka',
      state: '29',
      gstin: gstin('29AAHCV5678K1Z'),
      type: ['vendor'],
    },
  ];
  for (const s of specs) {
    const found = byName.get(s.name);
    if (found) {
      ids[s.key] = found;
      continue;
    }
    const created = await step(`party — ${s.name}`, () =>
      req<{ party: { id: string } }>('POST', '/api/v1/parties', {
        type: s.type,
        name: s.name,
        ...(s.gstin ? { gstin: s.gstin, gstRegistrationType: 'regular' } : {}),
        placeOfSupplyStateCode: s.state,
        creditDays: 30,
      }),
    );
    if (created) ids[s.key] = created.party.id;
  }

  // ── has this month already been seeded? ──────────────────────────────────
  const priorInvoices = await req<{ invoices: { issueDate: string; status: string }[] }>(
    'GET',
    '/api/v1/invoices',
  );
  const alreadySeeded = priorInvoices.invoices.some(
    (i) => String(i.issueDate).slice(0, 7) === `2026-${PERIOD_MONTH}` && i.status !== 'draft',
  );
  if (alreadySeeded) {
    console.log(
      `\n  \x1b[2m•\x1b[0m 2026-${PERIOD_MONTH} already has issued invoices — not adding more`,
    );
    return summarise();
  }

  // ── the cases ────────────────────────────────────────────────────────────
  console.log('\n\x1b[1mSales — one case per GSTR-1 shape\x1b[0m');
  const cases: { label: string; party: string; day: number; lines: Line[] }[] = [
    {
      label: 'B2B intra-state 18% (CGST + SGST)',
      party: 'reg_gj',
      day: 2,
      lines: [
        { description: 'Steel fittings', hsn: '7307', qty: 1, ratePaise: 1_00_000_00, gstRate: 18 },
      ],
    },
    {
      label: 'B2B inter-state 18% (IGST)',
      party: 'reg_mh',
      day: 3,
      lines: [
        { description: 'Steel fittings', hsn: '7307', qty: 1, ratePaise: 2_00_000_00, gstRate: 18 },
      ],
    },
    {
      label: 'B2B three rates on one invoice (0% / 5% / 18%)',
      party: 'reg_gj',
      day: 6,
      lines: [
        {
          description: 'Exempt packing material',
          hsn: '4819',
          qty: 1,
          ratePaise: 10_000_00,
          gstRate: 0,
        },
        {
          description: 'Food grade containers',
          hsn: '3923',
          qty: 1,
          ratePaise: 40_000_00,
          gstRate: 5,
        },
        {
          description: 'Annual maintenance',
          hsn: '9987',
          qty: 1,
          ratePaise: 50_000_00,
          gstRate: 18,
        },
      ],
    },
    {
      label: 'B2B 40% slab with 12% cess',
      party: 'reg_mh',
      day: 9,
      lines: [
        {
          description: 'Luxury fitting (cess bearing)',
          hsn: '8703',
          qty: 1,
          ratePaise: 1_00_000_00,
          gstRate: 40,
          cessRate: 12,
        },
      ],
    },
    {
      label: 'B2B with a 10% line discount',
      party: 'reg_gj',
      day: 12,
      lines: [
        {
          description: 'Steel fittings (discounted)',
          hsn: '7307',
          qty: 2,
          ratePaise: 50_000_00,
          gstRate: 18,
          discountPercent: 10,
        },
      ],
    },
    {
      label: 'B2C unregistered, intra-state 18%',
      party: 'unreg_gj',
      day: 15,
      lines: [
        { description: 'Counter sale', hsn: '7307', qty: 1, ratePaise: 20_000_00, gstRate: 18 },
      ],
    },
    {
      label: 'B2C unregistered, inter-state 5%',
      party: 'unreg_kl',
      day: 18,
      lines: [
        {
          description: 'Containers to Kerala',
          hsn: '3923',
          qty: 1,
          ratePaise: 30_000_00,
          gstRate: 5,
        },
      ],
    },
  ];

  for (const c of cases) {
    const partyId = ids[c.party];
    if (!partyId) continue;
    const draft = await step(`${c.label}`, () =>
      req<{ invoice: { id: string } }>('POST', '/api/v1/invoices', {
        partyId,
        issueDate: d(c.day),
        lines: c.lines.map((l) => ({ cessRate: 0, discountPercent: 0, ...l })),
      }),
    );
    if (draft) {
      await step('  issue it', () => req('POST', `/api/v1/invoices/${draft.invoice.id}/issue`, {}));
    }
  }

  console.log('\n\x1b[1mPurchases — the ITC half of 3B\x1b[0m');
  const bills = [
    {
      label: 'ITC-eligible intra-state (input CGST + SGST)',
      party: 'vend_gj',
      day: 5,
      rate: 60_000_00,
      itc: true,
    },
    {
      label: 'ITC-eligible inter-state (input IGST)',
      party: 'vend_ka',
      day: 8,
      rate: 40_000_00,
      itc: true,
    },
    {
      label: 'ITC-INELIGIBLE (blocked credit — excluded from 4A)',
      party: 'vend_gj',
      day: 11,
      rate: 20_000_00,
      itc: false,
    },
  ];
  for (const [i, b] of bills.entries()) {
    const partyId = ids[b.party];
    if (!partyId) continue;
    const bill = await step(b.label, () =>
      req<{ bill: { id: string } }>('POST', '/api/v1/bills', {
        partyId,
        vendorBillNumber: `GSTCASE-${String(i + 1).padStart(3, '0')}`,
        billDate: d(b.day),
        lines: [
          {
            description: b.label,
            qty: 1,
            ratePaise: b.rate,
            gstRate: 18,
            cessRate: 0,
            itcEligible: b.itc,
          },
        ],
      }),
    );
    if (bill) {
      await step('  approve it', () => req('POST', `/api/v1/bills/${bill.bill.id}/approve`, {}));
    }
  }

  summarise();
}

function summarise(): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(
    `\x1b[1mDone\x1b[0m — \x1b[32m${passed} ok\x1b[0m, ` +
      (failures.length ? `\x1b[31m${failures.length} failed\x1b[0m` : '0 failed'),
  );
  for (const f of failures) console.log(`  • ${f}`);
  if (failures.length) process.exitCode = 1;
  console.log(
    `\nNow check:  pnpm --filter @finpilot/api gst:verify` +
      `\n            or open GST & IMS and pick period 2026-${PERIOD_MONTH}\n`,
  );
}

await main();
