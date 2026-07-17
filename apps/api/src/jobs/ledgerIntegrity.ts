/**
 * The nightly assertion job (plan.md §12.5) — 02:15 IST daily per company.
 * A ledger that silently drifts is worse than one that crashes. Any non-zero
 * result is a P1. Scheduled from the worker process; BullMQ repeatable jobs
 * take over in the queues phase.
 */
import { Types } from 'mongoose';
import { normalBalance } from '@finpilot/shared';
import { Account } from '../models/Account';
import { Company } from '../models/Company';
import { JournalEntry } from '../models/JournalEntry';
import { logger } from '../config/logger';

export interface IntegrityViolation {
  companyId: string;
  check: 'ledger_balance' | 'account_drift' | 'number_gap';
  detail: Record<string, unknown>;
}

export async function checkCompanyIntegrity(
  companyId: Types.ObjectId | string,
  { fixDrift = false } = {},
): Promise<IntegrityViolation[]> {
  const cid = new Types.ObjectId(String(companyId));
  const violations: IntegrityViolation[] = [];

  // 1 — sum(debit) − sum(credit) over ALL entries must equal 0
  const [totals] = await JournalEntry.aggregate<{ debit: number; credit: number }>([
    { $match: { companyId: cid } },
    {
      $group: {
        _id: null,
        debit: { $sum: '$totalDebitPaise' },
        credit: { $sum: '$totalCreditPaise' },
      },
    },
    { $project: { _id: 0, debit: 1, credit: 1 } },
  ]).option({ skipTenantScope: true });
  if (totals && totals.debit !== totals.credit) {
    violations.push({
      companyId: String(cid),
      check: 'ledger_balance',
      detail: { debit: totals.debit, credit: totals.credit },
    });
  }

  // 2 — recompute every Account.currentBalancePaise from the ledger
  const computed = await JournalEntry.aggregate<{
    _id: Types.ObjectId;
    debit: number;
    credit: number;
  }>([
    { $match: { companyId: cid } },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.accountId',
        debit: { $sum: '$lines.debitPaise' },
        credit: { $sum: '$lines.creditPaise' },
      },
    },
  ]).option({ skipTenantScope: true });
  const computedById = new Map(computed.map((r) => [String(r._id), r]));

  const accounts = await Account.find({ companyId: cid }, null, { skipTenantScope: true }).lean();
  for (const account of accounts) {
    const row = computedById.get(String(account._id));
    const expected = row
      ? normalBalance(account.type) === 'debit'
        ? row.debit - row.credit
        : row.credit - row.debit
      : 0;
    if (expected !== account.currentBalancePaise) {
      violations.push({
        companyId: String(cid),
        check: 'account_drift',
        detail: { accountId: String(account._id), stored: account.currentBalancePaise, expected },
      });
      if (fixDrift) {
        await Account.updateOne({ _id: account._id }, { currentBalancePaise: expected }).setOptions(
          { skipTenantScope: true },
        );
      }
    }
  }

  // 3 — entryNumber sequence has no gaps within each (fy, series)
  const numbers = await JournalEntry.find({ companyId: cid }, 'entryNumber fy', {
    skipTenantScope: true,
  }).lean();
  const bySeries = new Map<string, number[]>();
  for (const { entryNumber, fy } of numbers) {
    const seq = Number(entryNumber.split('/').at(-1));
    const series = `${entryNumber.split('/')[0]}:${fy}`;
    if (!bySeries.has(series)) bySeries.set(series, []);
    bySeries.get(series)!.push(seq);
  }
  for (const [series, seqs] of bySeries) {
    seqs.sort((a, b) => a - b);
    for (let i = 0; i < seqs.length; i++) {
      if (seqs[i] !== i + 1) {
        violations.push({
          companyId: String(cid),
          check: 'number_gap',
          detail: { series, expected: i + 1, found: seqs[i] ?? null },
        });
        break;
      }
    }
  }

  return violations;
}

export async function runLedgerIntegrityJob(): Promise<IntegrityViolation[]> {
  const companies = await Company.find({}, '_id').lean();
  const all: IntegrityViolation[] = [];
  for (const company of companies) {
    const violations = await checkCompanyIntegrity(company._id);
    all.push(...violations);
  }
  if (all.length > 0) {
    logger.error({ violations: all }, 'LEDGER INTEGRITY VIOLATIONS — page the on-call');
  } else {
    logger.info({ companies: companies.length }, 'ledger integrity: clean');
  }
  return all;
}
