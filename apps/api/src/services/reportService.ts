/**
 * Reports (plan.md §32 Phase 17) — every number computed FROM THE LEDGER
 * via the engine's trial balance; documents only feed the ageing buckets.
 * The golden-file test asserts every figure to the paise; the balance sheet
 * MUST balance (assets = liabilities + equity + retained earnings).
 */
import { GeneralLedger, type TrialBalanceRow } from '../engines/ledger/GeneralLedger';
import { Bill } from '../models/Bill';
import { Invoice } from '../models/Invoice';
import { requireCompanyContext } from '../plugins/tenantScope';

type Row = { code: string; name: string; balancePaise: number };
const rows = (tb: TrialBalanceRow[], type: string): Row[] =>
  tb
    .filter((r) => r.type === type && r.balancePaise !== 0)
    .map((r) => ({ code: r.code, name: r.name, balancePaise: r.balancePaise }));
const total = (list: Row[]) => list.reduce((s, r) => s + r.balancePaise, 0);

export const reportService = {
  async trialBalance(asOf: Date): Promise<TrialBalanceRow[]> {
    const ctx = requireCompanyContext();
    return GeneralLedger.trialBalance(ctx.companyId, asOf);
  },

  async profitLoss(asOf: Date) {
    const tb = await this.trialBalance(asOf);
    const income = rows(tb, 'income');
    const expenses = rows(tb, 'expense');
    return {
      income,
      expenses,
      totalIncomePaise: total(income),
      totalExpensesPaise: total(expenses),
      netProfitPaise: total(income) - total(expenses),
    };
  },

  async balanceSheet(asOf: Date) {
    const tb = await this.trialBalance(asOf);
    const assets = rows(tb, 'asset');
    const liabilities = rows(tb, 'liability');
    const equity = rows(tb, 'equity');
    const pnl = await this.profitLoss(asOf);
    const totalAssetsPaise = total(assets);
    const totalLiabilitiesPaise = total(liabilities);
    const totalEquityPaise = total(equity) + pnl.netProfitPaise; // retained earnings
    return {
      assets,
      liabilities,
      equity,
      retainedEarningsPaise: pnl.netProfitPaise,
      totalAssetsPaise,
      totalLiabilitiesPaise,
      totalEquityPaise,
      balances: totalAssetsPaise === totalLiabilitiesPaise + totalEquityPaise,
    };
  },

  /** Indirect method, v1: net profit adjusted for working-capital deltas. */
  async cashFlow(asOf: Date) {
    const tb = await this.trialBalance(asOf);
    const bySub = (sub: string[]) =>
      tb.filter((r) => {
        const row = r as TrialBalanceRow & { subType?: string };
        return sub.includes(row.code.slice(0, 2)); // 11xx cash/bank, 1130 AR, 2110 AP
      });
    const cash = tb
      .filter((r) => ['1110', '1120'].includes(r.code))
      .reduce((s, r) => s + r.balancePaise, 0);
    const receivables = tb.find((r) => r.code === '1130')?.balancePaise ?? 0;
    const payables = tb.find((r) => r.code === '2110')?.balancePaise ?? 0;
    const pnl = await this.profitLoss(asOf);
    void bySub;
    return {
      netProfitPaise: pnl.netProfitPaise,
      increaseInReceivablesPaise: receivables, // vs zero opening (books begin)
      increaseInPayablesPaise: payables,
      netCashFromOperationsPaise: pnl.netProfitPaise - receivables + payables,
      closingCashPaise: cash,
    };
  },

  async agedReceivables(asOf: Date) {
    return ageDocuments(
      await Invoice.find({ status: { $in: ['issued', 'partially_paid', 'overdue'] } }).lean(),
      (d) => d.dueDate,
      (d) => d.amountDuePaise,
      (d) => ({ number: d.invoiceNumber ?? '(draft)', party: d.partySnapshot?.name ?? '' }),
      asOf,
    );
  },

  async agedPayables(asOf: Date) {
    return ageDocuments(
      await Bill.find({ status: 'approved' }).lean(),
      (d) => d.dueDate,
      (d) => d.grandTotalPaise - d.amountPaidPaise,
      (d) => ({ number: d.vendorBillNumber, party: d.partySnapshot?.name ?? '' }),
      asOf,
    );
  },

  /** CSV artefact for the export queue. */
  async exportCsv(type: string, asOf: Date): Promise<string> {
    if (type === 'trial-balance') {
      const tb = await this.trialBalance(asOf);
      return [
        'code,name,type,debitPaise,creditPaise,balancePaise',
        ...tb.map(
          (r) =>
            `${r.code},"${r.name}",${r.type},${r.debitPaise},${r.creditPaise},${r.balancePaise}`,
        ),
      ].join('\n');
    }
    if (type === 'profit-loss') {
      const pnl = await this.profitLoss(asOf);
      return [
        'section,code,name,balancePaise',
        ...pnl.income.map((r) => `income,${r.code},"${r.name}",${r.balancePaise}`),
        ...pnl.expenses.map((r) => `expense,${r.code},"${r.name}",${r.balancePaise}`),
        `net,,Net Profit,${pnl.netProfitPaise}`,
      ].join('\n');
    }
    throw new Error(`unknown export type: ${type}`);
  },
};

function ageDocuments<T>(
  docs: T[],
  due: (d: T) => Date,
  amount: (d: T) => number,
  label: (d: T) => { number: string; party: string },
  asOf: Date,
) {
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, older: 0 };
  const rows = docs
    .filter((d) => amount(d) > 0)
    .map((d) => {
      const days = Math.floor((asOf.getTime() - due(d).getTime()) / 86_400_000);
      const bucket =
        days <= 0
          ? 'current'
          : days <= 30
            ? 'd30'
            : days <= 60
              ? 'd60'
              : days <= 90
                ? 'd90'
                : 'older';
      buckets[bucket] += amount(d);
      return { ...label(d), duePaise: amount(d), daysOverdue: Math.max(0, days), bucket };
    });
  return { rows, buckets, totalPaise: rows.reduce((s, r) => s + r.duePaise, 0) };
}
