/**
 * Reconciliation (plan.md §32 Phase 16). The scoring engine SUGGESTS;
 * a human confirms; NOTHING auto-posts (I10's spirit at the bank boundary).
 * Score = amount exact 0.6 (candidacy gate) + date proximity 0.25 + narration
 * token overlap 0.15.
 */
import { Types } from 'mongoose';
import { GeneralLedger } from '../engines/ledger/GeneralLedger';
import { BankAccount } from '../models/BankAccount';
import { BankTransaction } from '../models/BankTransaction';
import { JournalEntry } from '../models/JournalEntry';
import { Reconciliation } from '../models/Reconciliation';
import { requireCompanyContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';
import { withTransaction } from '../utils/withTransaction';

const tokenize = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );

function narrationScore(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits += 1;
  return (hits / Math.min(ta.size, tb.size)) * 0.15;
}

function dateScore(txn: Date, entry: Date): number {
  const days = Math.abs(txn.getTime() - entry.getTime()) / 86_400_000;
  if (days < 1) return 0.25;
  if (days <= 3) return 0.15;
  if (days <= 7) return 0.05;
  return 0;
}

export interface Suggestion {
  bankTransactionId: string;
  journalEntryId: string;
  entryNumber: string;
  score: number;
}

export const reconciliationService = {
  /** Suggestions only — the human clicks Confirm. */
  async suggestions(bankAccountId: string): Promise<Suggestion[]> {
    const bank = await BankAccount.findOne({ _id: bankAccountId }).lean();
    if (!bank) throw new AppError('SYS_NOT_FOUND', 404);

    const txns = await BankTransaction.find({ bankAccountId, status: 'unreconciled' }).lean();
    const reconciled = new Set(
      (await Reconciliation.find({}, 'journalEntryId').lean()).map((r) => String(r.journalEntryId)),
    );

    const out: Suggestion[] = [];
    for (const txn of txns) {
      // statement credit (money in) ↔ Dr bank ledger; debit ↔ Cr bank ledger
      const amountField = txn.direction === 'credit' ? 'debitPaise' : 'creditPaise';
      const candidates = await JournalEntry.find({
        status: 'posted',
        lines: {
          $elemMatch: { accountId: bank.ledgerAccountId, [amountField]: txn.amountPaise },
        },
      }).lean();

      let best: Suggestion | null = null;
      for (const entry of candidates) {
        if (reconciled.has(String(entry._id))) continue;
        const score =
          0.6 + dateScore(txn.txnDate, entry.date) + narrationScore(txn.narration, entry.narration);
        if (!best || score > best.score) {
          best = {
            bankTransactionId: String(txn._id),
            journalEntryId: String(entry._id),
            entryNumber: entry.entryNumber,
            score: Math.round(score * 100) / 100,
          };
        }
      }
      if (best && best.score >= 0.9) {
        out.push(best);
        reconciled.add(best.journalEntryId); // one entry matches one line
      }
    }
    return out;
  },

  /** One-click / bulk confirm — writes the audit record, marks the line. */
  async confirm(
    matches: Array<{ bankTransactionId: string; journalEntryId: string; score?: number }>,
    method: 'suggested' | 'manual' = 'suggested',
  ): Promise<{ confirmed: number }> {
    const ctx = requireCompanyContext();
    let confirmed = 0;
    for (const match of matches) {
      const txn = await BankTransaction.findOne({ _id: match.bankTransactionId });
      if (!txn || txn.status !== 'unreconciled') {
        throw new AppError('DOC_INVALID_STATE', 409, {
          bankTransactionId: match.bankTransactionId,
        });
      }
      await Reconciliation.create({
        companyId: ctx.companyId,
        bankTransactionId: txn._id,
        journalEntryId: new Types.ObjectId(match.journalEntryId),
        score: match.score ?? 1,
        method,
        confirmedBy: ctx.userId!,
      });
      txn.status = 'reconciled';
      await txn.save();
      confirmed += 1;
    }
    return { confirmed };
  },

  /** "Create entry from this line": posts through the engine, then confirms. */
  async createFromLine(
    bankTransactionId: string,
    input: { accountId: string; description: string },
  ): Promise<{ journalEntryId: string }> {
    const ctx = requireCompanyContext();
    const txn = await BankTransaction.findOne({ _id: bankTransactionId }).lean();
    if (!txn || txn.status !== 'unreconciled') throw new AppError('DOC_INVALID_STATE', 409);
    const bank = await BankAccount.findOne({ _id: txn.bankAccountId }).lean();

    const entry = await withTransaction((session) =>
      GeneralLedger.post(
        ctx.companyId,
        {
          date: txn.txnDate,
          narration: input.description || txn.narration,
          source: { type: 'bank' },
          lines:
            txn.direction === 'credit'
              ? [
                  { accountId: bank!.ledgerAccountId, debitPaise: txn.amountPaise },
                  { accountId: new Types.ObjectId(input.accountId), creditPaise: txn.amountPaise },
                ]
              : [
                  { accountId: new Types.ObjectId(input.accountId), debitPaise: txn.amountPaise },
                  { accountId: bank!.ledgerAccountId, creditPaise: txn.amountPaise },
                ],
        },
        ctx.userId!,
        session,
      ),
    );
    await this.confirm(
      [{ bankTransactionId, journalEntryId: String(entry._id), score: 1 }],
      'manual',
    );
    await Reconciliation.updateOne({ bankTransactionId: txn._id }, { method: 'created' });
    return { journalEntryId: String(entry._id) };
  },
};
