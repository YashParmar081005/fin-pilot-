/** Scan every docs/dummy statement through the real endpoint and show the rows. */
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.API_URL ?? 'http://localhost:4000';
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'dummy');

let token = '';
let companyId = '';

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
  const json = (await res.json()) as { data?: T; error?: { code: string; message: string } };
  if (!res.ok) throw new Error(`${res.status} ${json.error?.code}: ${json.error?.message}`);
  return json.data as T;
}

token = (
  await req<{ accessToken: string }>('POST', '/api/v1/auth/login', {
    email: 'owner@finpilot.demo',
    password: 'finpilot-demo-password1',
  })
).accessToken;
const comps = await req<{ companies: { id: string; legalName: string }[] }>(
  'GET',
  '/api/v1/companies',
);
companyId = comps.companies.find((c) => c.legalName === 'Sunrise Traders Pvt Ltd')!.id;
const banks = await req<{ bankAccounts: { _id: string; name: string }[] }>(
  'GET',
  '/api/v1/bank-accounts',
);
const bank = banks.bankAccounts[0]!;

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

interface Scan {
  engine: string;
  confidence: number;
  openingBalancePaise: number | null;
  closingBalancePaise: number | null;
  rows: {
    date: string;
    narration: string;
    amountPaise: number;
    direction: string;
    reference: string | null;
    balanceChecked: boolean;
  }[];
  unparsed: string[];
  csv: string;
}

const inr = (p: number) => (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });

for (const file of readdirSync(DIR).sort()) {
  if (!file.startsWith('statement-')) continue;
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) continue;

  const scan = await req<Scan>('POST', `/api/v1/bank-accounts/${bank._id}/scan`, {
    filename: file,
    mimeType: mime,
    contentBase64: readFileSync(join(DIR, file)).toString('base64'),
  });

  console.log(`\n\x1b[1m${file}\x1b[0m`);
  console.log(
    `  engine ${scan.engine}  confidence ${scan.confidence}  ` +
      `opening ${scan.openingBalancePaise === null ? '-' : inr(scan.openingBalancePaise)}  ` +
      `closing ${scan.closingBalancePaise === null ? '-' : inr(scan.closingBalancePaise)}`,
  );
  console.log(`  \x1b[1m${scan.rows.length} rows\x1b[0m, ${scan.unparsed.length} unparsed`);
  for (const r of scan.rows) {
    const tick = r.balanceChecked ? '\x1b[32mchecked\x1b[0m' : '\x1b[33munchecked\x1b[0m';
    console.log(
      `    ${r.date}  ${r.direction.padEnd(6)} ${inr(r.amountPaise).padStart(12)}  ` +
        `${tick}  ${(r.reference ?? '-').padEnd(13)} ${r.narration.slice(0, 40)}`,
    );
  }
  for (const u of scan.unparsed.slice(0, 4)) console.log(`    \x1b[31mUNPARSED\x1b[0m ${u}`);
}
