/**
 * Engine 3 — forecast, health, anomalies (plan.md §32 Phase 21).
 * DETERMINISTIC: same inputs → same outputs. No randomness, no LLM in the
 * number path — the Copilot only NARRATES these tool results (I9).
 */
import { GeneralLedger } from '../ledger/GeneralLedger';
import { Bill } from '../../models/Bill';
import { Invoice } from '../../models/Invoice';
import { JournalEntry } from '../../models/JournalEntry';
import { ImsRecord } from '../../models/ImsRecord';
import { Payment } from '../../models/Payment';
import { requireCompanyContext } from '../../plugins/tenantScope';

/** Distinct months with postings — the history caveat gate. */
async function monthsOfHistory(): Promise<number> {
  const months = await JournalEntry.aggregate<{ _id: string }>([
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } } } },
  ]);
  return months.length;
}

// deterministic scenario multipliers: what share of due AR arrives on time
const SCENARIOS = { p10: 0.7, p50: 0.9, p90: 1.0 } as const;

export const forecastEngine = {
  /** 13-week cash forecast. P10/P50/P90 from fixed collection-rate scenarios. */
  async cashFlow(asOf = new Date()) {
    const ctx = requireCompanyContext();
    const tb = await GeneralLedger.trialBalance(ctx.companyId, asOf);
    const cashNow = tb
      .filter((r) => ['1110', '1120'].includes(r.code))
      .reduce((s, r) => s + r.balancePaise, 0);

    const openInvoices = await Invoice.find({
      status: { $in: ['issued', 'partially_paid', 'overdue'] },
    }).lean();
    const openBills = await Bill.find({ status: 'approved' }).lean();

    const horizonMs = 13 * 7 * 86_400_000;
    const weeks = Array.from({ length: 13 }, (_, i) => ({
      week: i + 1,
      inflowDuePaise: 0,
      outflowDuePaise: 0,
    }));
    const bucket = (due: Date) =>
      Math.min(12, Math.max(0, Math.floor((due.getTime() - asOf.getTime()) / (7 * 86_400_000))));

    for (const inv of openInvoices) {
      if (inv.dueDate.getTime() - asOf.getTime() > horizonMs) continue;
      weeks[bucket(inv.dueDate)]!.inflowDuePaise += inv.amountDuePaise;
    }
    for (const bill of openBills) {
      const due = bill.grandTotalPaise - bill.amountPaidPaise;
      if (due <= 0 || bill.dueDate.getTime() - asOf.getTime() > horizonMs) continue;
      weeks[bucket(bill.dueDate)]!.outflowDuePaise += due;
    }

    const project = (rate: number) => {
      let cash = cashNow;
      return weeks.map((w) => {
        cash += Math.round(w.inflowDuePaise * rate) - w.outflowDuePaise;
        return cash;
      });
    };

    const history = await monthsOfHistory();
    return {
      asOf: asOf.toISOString().slice(0, 10),
      openingCashPaise: cashNow,
      weeks,
      p10: project(SCENARIOS.p10),
      p50: project(SCENARIOS.p50),
      p90: project(SCENARIOS.p90),
      monthsOfHistory: history,
      caveat:
        history < 6
          ? `Only ${history} month(s) of history — treat this forecast as indicative, not predictive.`
          : null,
    };
  },

  /** Six health components, each exposing its DRIVERS. Overall = weighted mean. */
  async healthScore(asOf = new Date()) {
    const ctx = requireCompanyContext();
    const tb = await GeneralLedger.trialBalance(ctx.companyId, asOf);
    const bal = (code: string) => tb.find((r) => r.code === code)?.balancePaise ?? 0;
    const cash = bal('1110') + bal('1120');
    const income = tb.filter((r) => r.type === 'income').reduce((s, r) => s + r.balancePaise, 0);
    const expenses = tb.filter((r) => r.type === 'expense').reduce((s, r) => s + r.balancePaise, 0);

    const openInvoices = await Invoice.find({
      status: { $in: ['issued', 'partially_paid', 'overdue'] },
    }).lean();
    const overdue = openInvoices.filter((i) => i.dueDate < asOf);
    const overduePaise = overdue.reduce((s, i) => s + i.amountDuePaise, 0);
    const openArPaise = openInvoices.reduce((s, i) => s + i.amountDuePaise, 0);
    const openBills = await Bill.find({ status: 'approved' }).lean();
    const apDuePaise = openBills.reduce((s, b) => s + b.grandTotalPaise - b.amountPaidPaise, 0);
    const unactionedIms = await ImsRecord.countDocuments({ action: 'no_action' });
    const pendingIrn = await Invoice.countDocuments({ 'eInvoice.status': 'pending' });

    // customer concentration: top party's share of issued revenue
    const byParty = new Map<string, number>();
    for (const inv of openInvoices) {
      const k = String(inv.partyId);
      byParty.set(k, (byParty.get(k) ?? 0) + inv.grandTotalPaise);
    }
    const totalBilled = [...byParty.values()].reduce((s, v) => s + v, 0);
    const topShare = totalBilled === 0 ? 0 : Math.max(...byParty.values(), 0) / totalBilled;

    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    const monthlyBurn = Math.max(1, Math.round(expenses / 3)); // rough monthly proxy
    const components = [
      {
        key: 'liquidity',
        score: clamp((cash / (monthlyBurn * 2)) * 100),
        drivers: [
          { name: 'cashPaise', value: cash },
          { name: 'monthlyBurnPaise', value: monthlyBurn },
        ],
      },
      {
        key: 'receivables',
        score: clamp(100 - (openArPaise === 0 ? 0 : (overduePaise / openArPaise) * 100)),
        drivers: [
          { name: 'overduePaise', value: overduePaise },
          { name: 'openReceivablesPaise', value: openArPaise },
          { name: 'overdueCount', value: overdue.length },
        ],
      },
      {
        key: 'payables',
        score: clamp(
          100 - (cash === 0 ? 100 : Math.min(100, (apDuePaise / Math.max(cash, 1)) * 50)),
        ),
        drivers: [{ name: 'payablesDuePaise', value: apDuePaise }],
      },
      {
        key: 'profitability',
        score: clamp(income === 0 ? 0 : ((income - expenses) / income) * 100),
        drivers: [
          { name: 'incomePaise', value: income },
          { name: 'expensesPaise', value: expenses },
        ],
      },
      {
        key: 'compliance',
        score: clamp(100 - unactionedIms * 10 - pendingIrn * 5),
        drivers: [
          { name: 'unactionedImsRecords', value: unactionedIms },
          { name: 'pendingIrns', value: pendingIrn },
        ],
      },
      {
        key: 'concentration',
        score: clamp(100 - topShare * 100),
        drivers: [{ name: 'topCustomerShare', value: Math.round(topShare * 100) / 100 }],
      },
    ];
    return {
      overall: clamp(components.reduce((s, c) => s + c.score, 0) / components.length),
      components,
    };
  },

  /** The fraud signal set — deterministic rules, refs included. */
  async anomalies(asOf = new Date()) {
    const signals: Array<{
      signal: string;
      severity: 'low' | 'medium' | 'high';
      refs: string[];
      detail: string;
    }> = [];

    // duplicate vendor bill amounts in a 7-day window
    const bills = await Bill.find({ status: 'approved' }).lean();
    const seen = new Map<string, (typeof bills)[number]>();
    for (const bill of bills) {
      const key = `${bill.partyId}:${bill.grandTotalPaise}`;
      const prior = seen.get(key);
      if (prior && Math.abs(bill.billDate.getTime() - prior.billDate.getTime()) <= 7 * 86_400_000) {
        signals.push({
          signal: 'duplicate_vendor_amount',
          severity: 'high',
          refs: [String(prior._id), String(bill._id)],
          detail: `two bills from the same vendor for ${bill.grandTotalPaise}p within 7 days`,
        });
      }
      seen.set(key, bill);
    }

    // large round-number outflows (potential fabrication)
    const payments = await Payment.find({ direction: 'outflow' }).lean();
    for (const payment of payments) {
      if (payment.amountPaise >= 1_00_00_000 && payment.amountPaise % 1_00_00_000 === 0) {
        signals.push({
          signal: 'large_round_outflow',
          severity: 'medium',
          refs: [String(payment._id)],
          detail: `round outflow of ${payment.amountPaise}p (${payment.paymentNumber})`,
        });
      }
    }

    // rapid reversals: entries reversed within 24h of posting
    const reversed = await JournalEntry.find({ status: 'reversed' }).lean();
    for (const entry of reversed) {
      const reversal = reversed.length
        ? await JournalEntry.findOne({ _id: entry.reversedByEntryId }).lean()
        : null;
      if (reversal && reversal.postedAt.getTime() - entry.postedAt.getTime() <= 86_400_000) {
        signals.push({
          signal: 'rapid_reversal',
          severity: 'low',
          refs: [String(entry._id), String(reversal._id)],
          detail: `${entry.entryNumber} reversed within 24h`,
        });
      }
    }

    return { asOf: asOf.toISOString().slice(0, 10), signals };
  },
};
