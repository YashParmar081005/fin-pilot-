/**
 * Parties (plan.md §32 Phase 6): CRUD, bulk import, snapshots. Control
 * accounts default to the seeded COA (1130 AR / 2110 AP) when present.
 */
import { createPartySchema, type CreatePartyInput, type UpdatePartyInput } from '@finpilot/shared';
import { Bill } from '../models/Bill';
import { Invoice } from '../models/Invoice';
import { Payment } from '../models/Payment';
import { partySnapshot, type PartyDoc, type PartySnapshot } from '../models/Party';
import { accountRepo } from '../repositories/accountRepo';
import { partyRepo } from '../repositories/partyRepo';
import { AppError } from '../utils/AppError';

export interface ImportResult {
  created: number;
  failed: Array<{ row: number; errors: unknown }>;
}

export const partyService = {
  async create(input: CreatePartyInput): Promise<PartyDoc> {
    const [ar, ap] = await Promise.all([
      accountRepo.findByCode('1130'),
      accountRepo.findByCode('2110'),
    ]);
    return partyRepo.create({
      ...input,
      receivableAccountId: ar?._id ?? null,
      payableAccountId: ap?._id ?? null,
    });
  },

  /**
   * Parties with what each one currently owes, or is owed.
   *
   * The balances are computed here rather than read off the party document.
   * `outstandingReceivablePaise` and `outstandingPayablePaise` exist on the
   * model but were never written by anything, so the list rendered a
   * confident 0.00 for every customer no matter what they owed. Deriving them
   * from the documents themselves also means this screen can never drift from
   * the statement drill-down, which reads the same rows.
   *
   * Drafts and cancellations are excluded: neither posts to the ledger.
   */
  async list(filter: { type?: 'customer' | 'vendor'; search?: string }): Promise<PartyDoc[]> {
    const parties = await partyRepo.list(filter);
    if (parties.length === 0) return parties;

    const ids = parties.map((p) => p._id);
    // The tenant plugin prepends a companyId $match to every aggregate.
    const [receivable, payable] = await Promise.all([
      Invoice.aggregate<{ _id: unknown; duePaise: number }>([
        { $match: { partyId: { $in: ids }, status: { $nin: ['draft', 'cancelled'] } } },
        { $group: { _id: '$partyId', duePaise: { $sum: '$amountDuePaise' } } },
      ]),
      Bill.aggregate<{ _id: unknown; duePaise: number }>([
        { $match: { partyId: { $in: ids }, status: 'approved' } },
        {
          $group: {
            _id: '$partyId',
            duePaise: { $sum: { $subtract: ['$grandTotalPaise', '$amountPaidPaise'] } },
          },
        },
      ]),
    ]);

    const owedToUs = new Map(receivable.map((r) => [String(r._id), r.duePaise]));
    const owedByUs = new Map(payable.map((r) => [String(r._id), r.duePaise]));

    return parties.map((party) => ({
      ...party,
      outstandingReceivablePaise: owedToUs.get(String(party._id)) ?? 0,
      outstandingPayablePaise: owedByUs.get(String(party._id)) ?? 0,
    }));
  },

  /**
   * Everything behind one party's balance — the statement of account an
   * accountant actually asks for. The list screen can say a customer owes
   * 4,20,000; this says which invoices make it up and what has been paid
   * against them.
   *
   * Drafts are excluded on purpose: a draft invoice or bill posts nothing, so
   * including it would show a balance the ledger does not agree with.
   */
  async statement(partyId: string): Promise<{
    party: PartyDoc;
    invoices: unknown[];
    bills: unknown[];
    payments: unknown[];
    totals: {
      invoicedPaise: number;
      receivedPaise: number;
      receivableDuePaise: number;
      billedPaise: number;
      paidPaise: number;
      payableDuePaise: number;
    };
  }> {
    const party = await this.get(partyId);

    const [invoices, bills, payments] = await Promise.all([
      Invoice.find({ partyId, status: { $ne: 'draft' } })
        .select(
          'invoiceNumber issueDate dueDate grandTotalPaise amountPaidPaise amountDuePaise status',
        )
        .sort({ issueDate: -1, _id: -1 })
        .limit(500)
        .lean(),
      Bill.find({ partyId, status: { $ne: 'draft' } })
        .select('vendorBillNumber billDate dueDate grandTotalPaise amountPaidPaise status')
        .sort({ billDate: -1, _id: -1 })
        .limit(500)
        .lean(),
      Payment.find({ partyId })
        .select('paymentNumber date direction amountPaise unallocatedPaise')
        .sort({ date: -1, _id: -1 })
        .limit(500)
        .lean(),
    ]);

    const sum = <T>(rows: T[], pick: (row: T) => number): number =>
      rows.reduce((total, row) => total + (pick(row) || 0), 0);

    const invoicedPaise = sum(invoices, (i) => i.grandTotalPaise);
    const receivedPaise = sum(invoices, (i) => i.amountPaidPaise);
    const billedPaise = sum(bills, (b) => b.grandTotalPaise);
    const paidPaise = sum(bills, (b) => b.amountPaidPaise);

    return {
      party,
      invoices,
      bills,
      payments,
      totals: {
        invoicedPaise,
        receivedPaise,
        receivableDuePaise: invoicedPaise - receivedPaise,
        billedPaise,
        paidPaise,
        payableDuePaise: billedPaise - paidPaise,
      },
    };
  },

  async get(id: string): Promise<PartyDoc> {
    const party = await partyRepo.findById(id);
    if (!party) throw new AppError('SYS_NOT_FOUND', 404);
    return party;
  },

  async update(id: string, patch: UpdatePartyInput): Promise<PartyDoc> {
    const party = await partyRepo.update(id, patch);
    if (!party) throw new AppError('SYS_NOT_FOUND', 404);
    return party;
  },

  async remove(id: string): Promise<void> {
    const party = await partyRepo.findById(id);
    if (!party) throw new AppError('SYS_NOT_FOUND', 404);
    await partyRepo.softDelete(id);
  },

  async snapshot(id: string): Promise<PartySnapshot> {
    return partySnapshot(await this.get(id));
  },

  /** Bulk import — each row independently validated; partial success is fine. */
  async import(rows: unknown[]): Promise<ImportResult> {
    const result: ImportResult = { created: 0, failed: [] };
    for (let i = 0; i < rows.length; i++) {
      const parsed = createPartySchema.safeParse(rows[i]);
      if (!parsed.success) {
        result.failed.push({ row: i + 1, errors: parsed.error.flatten() });
        continue;
      }
      try {
        await this.create(parsed.data);
        result.created += 1;
      } catch (err) {
        result.failed.push({ row: i + 1, errors: String(err) });
      }
    }
    return result;
  },
};
