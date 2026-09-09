/** Print GSTR-1 and GSTR-3B for each seeded period, straight from the API. */
import { randomUUID } from 'node:crypto';

const API = process.env.API_URL ?? 'http://localhost:4000';
let token = '';
let companyId = '';

async function req<T>(m: string, p: string, b?: unknown): Promise<T> {
  const r = await fetch(`${API}${p}`, {
    method: m,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(companyId ? { 'X-Company-Id': companyId } : {}),
      ...(m !== 'GET' ? { 'Idempotency-Key': randomUUID() } : {}),
    },
    body: b === undefined ? undefined : JSON.stringify(b),
  });
  const j = (await r.json()) as { data?: T; error?: { code: string; message: string } };
  if (!r.ok) throw new Error(`${r.status} ${j.error?.code}: ${j.error?.message}`);
  return j.data as T;
}

token = (
  await req<{ accessToken: string }>('POST', '/api/v1/auth/login', {
    email: 'owner@finpilot.demo',
    password: 'finpilot-demo-password1',
  })
).accessToken;
companyId = (
  await req<{ companies: { id: string; legalName: string }[] }>('GET', '/api/v1/companies')
).companies.find((c) => c.legalName === 'Sunrise Traders Pvt Ltd')!.id;

const periods = process.env.PERIODS?.split(',') ?? ['2026-07', '2026-08', '2026-09'];

for (const period of periods) {
  console.log(`\n================ ${period} ================`);
  try {
    const r1 = await req<{ data: unknown }>('GET', `/api/v1/gst/gstr1?period=${period}`);
    console.log('--- GSTR-1 ---');
    console.log(JSON.stringify(r1.data, null, 2).slice(0, 2000));
  } catch (err) {
    console.log('GSTR-1 FAILED:', err instanceof Error ? err.message : String(err));
  }
  try {
    const r3 = await req<{ data: unknown }>('GET', `/api/v1/gst/gstr3b?period=${period}`);
    console.log('--- GSTR-3B ---');
    console.log(JSON.stringify(r3.data, null, 2).slice(0, 1600));
  } catch (err) {
    console.log('GSTR-3B FAILED:', err instanceof Error ? err.message : String(err));
  }
}
