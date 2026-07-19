/**
 * Banking (plan.md §32 Phase 15): CSV import with column mapping and
 * fingerprint dedupe, the AA provider interface (Setu-shaped sandbox mock),
 * manual entry. Same statement twice → ZERO duplicate rows.
 */
import { randomUUID } from 'node:crypto';
import { toPaise } from '@finpilot/shared';
import { Types } from 'mongoose';
import { BankAccount, type BankAccountDoc } from '../models/BankAccount';
import { BankTransaction, txnFingerprint } from '../models/BankTransaction';
import { accountRepo } from '../repositories/accountRepo';
import { AppError } from '../utils/AppError';

export interface ColumnMapping {
  date: string;
  narration: string;
  amount?: string; // single signed column…
  credit?: string; // …or split credit/debit columns
  debit?: string;
  reference?: string;
}

/** Minimal RFC-4180-ish CSV parser (quotes, commas). */
export function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const parse = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = parse(lines[0]!);
  return lines.slice(1).map((line) => {
    const cells = parse(line);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  });
}

function parseDate(value: string): Date {
  // DD/MM/YYYY and DD-MM-YYYY (Indian bank exports) plus ISO
  const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(value);
  if (dmy) return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError('SYS_VALIDATION_FAILED', 422, { date: value });
  return d;
}

// ── AA provider interface (§15) — Setu-shaped; real TSP is a new file ──
export interface AaTxn {
  date: string;
  narration: string;
  amountPaise: number;
  direction: 'credit' | 'debit';
  reference?: string;
}
export interface AaClient {
  createConsent(
    companyId: string,
    bankAccountId: string,
  ): Promise<{ consentId: string; redirectUrl: string }>;
  fetchTransactions(consentId: string, from: Date, to: Date): Promise<AaTxn[]>;
}
export class MockAaClient implements AaClient {
  transactions: AaTxn[] = [];
  async createConsent(_c: string, bankAccountId: string) {
    const consentId = `consent-${randomUUID().slice(0, 8)}`;
    return {
      consentId,
      redirectUrl: `https://aa.sandbox/consent/${consentId}?acc=${bankAccountId}`,
    };
  }
  async fetchTransactions(): Promise<AaTxn[]> {
    return this.transactions;
  }
}
let aaClient: AaClient = new MockAaClient();
export const getAaClient = (): AaClient => aaClient;
export const setAaClient = (c: AaClient): void => void (aaClient = c);

async function insertDeduped(
  bankAccountId: Types.ObjectId,
  companyId: Types.ObjectId,
  rows: Array<{
    txnDate: Date;
    narration: string;
    amountPaise: number;
    direction: 'credit' | 'debit';
    reference?: string | null;
    source: 'csv' | 'aa' | 'manual';
  }>,
): Promise<{ imported: number; duplicates: number }> {
  let imported = 0;
  let duplicates = 0;
  for (const row of rows) {
    const fingerprint = txnFingerprint({
      bankAccountId: String(bankAccountId),
      txnDate: row.txnDate.toISOString().slice(0, 10),
      amountPaise: row.amountPaise,
      direction: row.direction,
      narration: row.narration,
    });
    try {
      await BankTransaction.create({ companyId, bankAccountId, ...row, fingerprint });
      imported += 1;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) duplicates += 1;
      else throw err;
    }
  }
  return { imported, duplicates };
}

export const bankingService = {
  async createAccount(input: {
    name: string;
    bankName?: string;
    accountNumberMasked?: string;
    ifsc?: string;
  }): Promise<BankAccountDoc> {
    const ledger = await accountRepo.findByCode('1120');
    if (!ledger) throw new AppError('LEDGER_ACCOUNT_INACTIVE', 422, { missing: '1120' });
    return BankAccount.create({ ...input, ledgerAccountId: ledger._id, source: 'manual' }).then(
      (d) => d.toObject(),
    );
  },

  list(): Promise<BankAccountDoc[]> {
    return BankAccount.find({ isActive: true }).lean();
  },

  /** CSV import with a caller-supplied column mapping (per-bank presets = mappings). */
  async importCsv(bankAccountId: string, csv: string, mapping: ColumnMapping) {
    const account = await BankAccount.findOne({ _id: bankAccountId }).lean();
    if (!account) throw new AppError('SYS_NOT_FOUND', 404);

    // Indian bank exports use lakh separators: "11,80,000.00"
    const money = (v: string | undefined) => toPaise((v || '0').replace(/,/g, '') || '0');
    const rows = parseCsv(csv)
      .map((r) => {
        let amountPaise: number;
        let direction: 'credit' | 'debit';
        if (mapping.amount) {
          const signed = money(r[mapping.amount]);
          direction = signed >= 0 ? 'credit' : 'debit';
          amountPaise = Math.abs(signed);
        } else {
          const credit = money(r[mapping.credit!]);
          const debit = money(r[mapping.debit!]);
          direction = credit > 0 ? 'credit' : 'debit';
          amountPaise = credit > 0 ? credit : debit;
        }
        return {
          txnDate: parseDate(r[mapping.date] || ''),
          narration: r[mapping.narration] || '(no narration)',
          amountPaise,
          direction,
          reference: mapping.reference ? r[mapping.reference] || null : null,
          source: 'csv' as const,
        };
      })
      .filter((r) => r.amountPaise > 0);

    return insertDeduped(account._id, account.companyId, rows);
  },

  async manualEntry(
    bankAccountId: string,
    input: { date: Date; narration: string; amountPaise: number; direction: 'credit' | 'debit' },
  ) {
    const account = await BankAccount.findOne({ _id: bankAccountId }).lean();
    if (!account) throw new AppError('SYS_NOT_FOUND', 404);
    return insertDeduped(account._id, account.companyId, [
      {
        txnDate: input.date,
        narration: input.narration,
        amountPaise: input.amountPaise,
        direction: input.direction,
        source: 'manual',
      },
    ]);
  },

  listTransactions(bankAccountId: string) {
    return BankTransaction.find({ bankAccountId }).sort({ txnDate: -1, _id: -1 }).limit(500).lean();
  },

  // ── AA flow: consent → callback → pull ──────────────────────────────
  async aaConsent(companyId: string, bankAccountId: string) {
    const account = await BankAccount.findOne({ _id: bankAccountId });
    if (!account) throw new AppError('SYS_NOT_FOUND', 404);
    const { consentId, redirectUrl } = await getAaClient().createConsent(companyId, bankAccountId);
    account.source = 'aa';
    account.aaConsentId = consentId;
    account.aaConsentStatus = 'pending';
    await account.save();
    return { consentId, redirectUrl };
  },

  /** The AA gateway redirects here after the user approves at their bank. */
  async aaCallback(consentId: string, status: 'active' | 'revoked') {
    const account = await BankAccount.findOne({ aaConsentId: consentId });
    if (!account) throw new AppError('SYS_NOT_FOUND', 404, { consentId });
    account.aaConsentStatus = status;
    await account.save();
    if (status !== 'active') return { consentId, status, pulled: 0 };

    // consent completed → pull transactions (same dedupe as CSV)
    const txns = await getAaClient().fetchTransactions(
      consentId,
      new Date(Date.now() - 90 * 86_400_000),
      new Date(),
    );
    const result = await insertDeduped(
      account._id,
      account.companyId,
      txns.map((t) => ({
        txnDate: parseDate(t.date),
        narration: t.narration,
        amountPaise: t.amountPaise,
        direction: t.direction,
        reference: t.reference ?? null,
        source: 'aa' as const,
      })),
    );
    return { consentId, status, pulled: result.imported, duplicates: result.duplicates };
  },
};
