/**
 * Purchase bills (plan.md §32 Phase 8). Approve posts the exact §12.2
 * purchase entry: Dr expense/purchases (+ ineligible ITC), Dr input
 * CGST/SGST/IGST/Cess (1150–1153) for ELIGIBLE ITC only, Cr Accounts
 * Payable. Cancel reverses.
 */
import { Types } from 'mongoose';
import {
  rateIsValidOn,
  splitGstPaise,
  supplyTypeFor,
  type CreateBillInput,
} from '@finpilot/shared';
import { GeneralLedger, type JournalLineDraft } from '../engines/ledger/GeneralLedger';
import { Bill, type BillDoc, type BillLine } from '../models/Bill';
import { accountRepo } from '../repositories/accountRepo';
import { companyRepo } from '../repositories/companyRepo';
import { itemRepo } from '../repositories/itemRepo';
import { partyRepo } from '../repositories/partyRepo';
import { requireCompanyContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';
import { withTransaction } from '../utils/withTransaction';

async function account(code: string) {
  const acc = await accountRepo.findByCode(code);
  if (!acc) throw new AppError('LEDGER_ACCOUNT_INACTIVE', 422, { missing: code });
  return acc;
}

export const billService = {
  async create(input: CreateBillInput): Promise<BillDoc> {
    const ctx = requireCompanyContext();
    const [company, party] = await Promise.all([
      companyRepo.findById(ctx.companyId),
      partyRepo.findById(input.partyId),
    ]);
    if (!company || !party) throw new AppError('SYS_NOT_FOUND', 404);

    // For a purchase, place of supply is OUR state; the supplier's state
    // (from their GSTIN/POS) decides intra vs inter (§14.2, reversed lens).
    const supplierState =
      party.placeOfSupplyStateCode ?? party.gstin?.slice(0, 2) ?? company.stateCode;
    const supplyType = supplyTypeFor(supplierState, party.gstRegistrationType, company.stateCode);
    const isInterState = supplyType !== 'intra';

    const lines: BillLine[] = input.lines.map((line) => {
      if (!rateIsValidOn(line.gstRate, input.billDate)) {
        throw new AppError('GST_INVALID_RATE_FOR_DATE', 422, { gstRate: line.gstRate });
      }
      const taxablePaise = Math.round(line.qty * line.ratePaise);
      const { cgst, sgst, igst } = splitGstPaise(taxablePaise, line.gstRate, isInterState);
      const cessPaise = Math.round((taxablePaise * line.cessRate) / 100);
      return {
        itemId: line.itemId ? new Types.ObjectId(line.itemId) : null,
        description: line.description,
        hsn: line.hsn,
        qty: line.qty,
        ratePaise: line.ratePaise,
        gstRate: line.gstRate,
        cessRate: line.cessRate,
        itcEligible: line.itcEligible,
        taxablePaise,
        cgstPaise: cgst,
        sgstPaise: sgst,
        igstPaise: igst,
        cessPaise,
        lineTotalPaise: taxablePaise + cgst + sgst + igst + cessPaise,
      };
    });

    const sum = (f: (l: BillLine) => number) => lines.reduce((s, l) => s + f(l), 0);
    const created = await Bill.create({
      partyId: input.partyId,
      partySnapshot: { name: party.name, gstin: party.gstin ?? null },
      vendorBillNumber: input.vendorBillNumber,
      billDate: input.billDate,
      dueDate:
        input.dueDate ?? new Date(input.billDate.getTime() + (party.creditDays || 0) * 86_400_000),
      supplyType,
      lines,
      taxableValuePaise: sum((l) => l.taxablePaise),
      cgstPaise: sum((l) => l.cgstPaise),
      sgstPaise: sum((l) => l.sgstPaise),
      igstPaise: sum((l) => l.igstPaise),
      cessPaise: sum((l) => l.cessPaise),
      grandTotalPaise: sum((l) => l.lineTotalPaise),
      status: 'draft',
      notes: input.notes,
      recurring: input.recurring,
      createdBy: ctx.userId,
      journalEntryId: null,
    });
    return created.toObject();
  },

  /** Approve → §12.2 purchase posting, one transaction. */
  async approve(id: string): Promise<BillDoc> {
    const ctx = requireCompanyContext();
    return withTransaction(async (session) => {
      const bill = await Bill.findOne({ _id: id }).session(session);
      if (!bill) throw new AppError('SYS_NOT_FOUND', 404);
      if (bill.status !== 'draft')
        throw new AppError('DOC_INVALID_STATE', 409, { status: bill.status });

      const glLines: JournalLineDraft[] = [];

      // expense/purchases per line; ITC-ineligible tax capitalises into cost
      const costTotals = new Map<string, number>();
      let inCgst = 0,
        inSgst = 0,
        inIgst = 0,
        inCess = 0;
      for (const line of bill.lines) {
        const item = line.itemId ? await itemRepo.findById(line.itemId) : null;
        const costId = String(item?.expenseAccountId ?? (await account('5110'))._id);
        const lineTax = line.cgstPaise + line.sgstPaise + line.igstPaise + line.cessPaise;
        const cost = line.taxablePaise + (line.itcEligible ? 0 : lineTax);
        costTotals.set(costId, (costTotals.get(costId) ?? 0) + cost);
        if (line.itcEligible) {
          inCgst += line.cgstPaise;
          inSgst += line.sgstPaise;
          inIgst += line.igstPaise;
          inCess += line.cessPaise;
        }
      }
      for (const [accountId, paise] of costTotals) {
        glLines.push({
          accountId: new Types.ObjectId(accountId),
          debitPaise: paise,
          gst: { taxablePaise: paise },
        });
      }
      const inputTax = async (
        paise: number,
        code: string,
        component: 'cgst' | 'sgst' | 'igst' | 'cess',
      ) => {
        if (paise > 0) {
          glLines.push({
            accountId: (await account(code))._id,
            debitPaise: paise,
            gst: { component },
          });
        }
      };
      await inputTax(inCgst, '1150', 'cgst');
      await inputTax(inSgst, '1151', 'sgst');
      await inputTax(inIgst, '1152', 'igst');
      await inputTax(inCess, '1153', 'cess');

      const party = await partyRepo.findById(bill.partyId);
      const ap = party?.payableAccountId
        ? await accountRepo.findById(party.payableAccountId)
        : null;
      glLines.push({
        accountId: (ap ?? (await account('2110')))._id,
        creditPaise: bill.grandTotalPaise,
        partyId: bill.partyId,
        description: `Bill ${bill.vendorBillNumber}`,
      });

      const entry = await GeneralLedger.post(
        ctx.companyId,
        {
          date: bill.billDate,
          narration: `Purchase bill ${bill.vendorBillNumber} — ${bill.partySnapshot?.name}`,
          source: { type: 'bill', documentId: bill._id, documentModel: 'Bill' },
          lines: glLines,
        },
        ctx.userId!,
        session,
      );

      bill.status = 'approved';
      bill.approvedBy = ctx.userId!;
      bill.journalEntryId = entry._id;
      await bill.save({ session });
      return bill.toObject();
    });
  },

  async cancel(id: string, reason: string): Promise<BillDoc> {
    const ctx = requireCompanyContext();
    return withTransaction(async (session) => {
      const bill = await Bill.findOne({ _id: id }).session(session);
      if (!bill) throw new AppError('SYS_NOT_FOUND', 404);
      if (bill.amountPaidPaise > 0) throw new AppError('DOC_CANNOT_CANCEL_PAID', 409);
      if (bill.status !== 'approved' || !bill.journalEntryId) {
        throw new AppError('DOC_INVALID_STATE', 409, { status: bill.status });
      }
      await GeneralLedger.reverse(
        ctx.companyId,
        bill.journalEntryId,
        `bill ${bill.vendorBillNumber} cancelled: ${reason}`,
        ctx.userId!,
        session,
      );
      bill.status = 'cancelled';
      await bill.save({ session });
      return bill.toObject();
    });
  },

  async get(id: string): Promise<BillDoc> {
    const bill = await Bill.findOne({ _id: id }).lean();
    if (!bill) throw new AppError('SYS_NOT_FOUND', 404);
    return bill;
  },

  list(status?: string): Promise<BillDoc[]> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    return Bill.find(filter).sort({ billDate: -1, _id: -1 }).limit(200).lean();
  },
};
