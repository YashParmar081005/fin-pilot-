/** Upload every docs/dummy file to the running API and print what OCR read. */
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

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

interface Field {
  value: unknown;
  confidence: number;
}
interface Doc {
  extractedBy: string | null;
  costPaise: number;
  extraction: Record<string, Field | boolean | null> | null;
}

const show = (f: Field | undefined): string => {
  if (!f) return '-';
  if (f.value === null) return `\x1b[31mblank\x1b[0m`;
  return `${String(f.value)} \x1b[2m(${Math.round(f.confidence * 100)}%)\x1b[0m`;
};

for (const file of readdirSync(DIR).sort()) {
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) {
    console.log(`\n\x1b[1m${file}\x1b[0m  \x1b[2m(not an OCR input — skipped)\x1b[0m`);
    continue;
  }
  const doc = await req<{ document: Doc }>('POST', '/api/v1/documents', {
    filename: file,
    mimeType: mime,
    contentBase64: readFileSync(join(DIR, file)).toString('base64'),
  }).then((d) => d.document);

  const e = (doc.extraction ?? {}) as Record<string, Field>;
  console.log(`\n\x1b[1m${file}\x1b[0m`);
  console.log(
    `  engine: \x1b[36m${doc.extractedBy}\x1b[0m   cost: Rs ${(doc.costPaise / 100).toFixed(2)}`,
  );
  console.log(`  vendor   : ${show(e.vendorName)}`);
  console.log(`  gstin    : ${show(e.gstin)}`);
  console.log(`  number   : ${show(e.documentNumber)}`);
  console.log(`  date     : ${show(e.documentDate)}`);
  console.log(`  taxable  : ${show(e.taxablePaise)}`);
  console.log(`  total    : ${show(e.totalPaise)}`);
  console.log(
    `  arithmetic: ${
      doc.extraction?.arithmeticOk === true
        ? '\x1b[32madds up\x1b[0m'
        : doc.extraction?.arithmeticOk === false
          ? '\x1b[31mmismatch\x1b[0m'
          : 'n/a'
    }`,
  );
}
