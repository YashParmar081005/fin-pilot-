/**
 * Payments and allocation (plan.md §32 Phase 9, §12.2).
 * - inflow: Dr deposit account / Cr AR (allocated) + Cr Advance-from-
 *   Customers + Cr output GST on the advance (unallocated, §12.2)
 * - outflow: Dr AP (allocated) + Dr Advances-to-Suppliers (unallocated) /
 *   Cr deposit account
 * - later allocation of an advance: Dr 2140 + Dr output GST (proportional
 *   reversal — invoice tax now covers it) / Cr AR
 * - refund: only from the unallocated advance, reversing its tax share
 */
import { Types, type ClientSession } from 'mongoose';
import {
  splitGstPaise,
  type AllocatePaymentInput,
  type CreatePaymentInput,
} from '@finpilot/shared';
import { GeneralLedger, type JournalLineDraft } from '../engines/ledger/GeneralLedger';
import { Bill } from '../models/Bill';
import { Invoice } from '../models/Invoice';
import { Payment, type PaymentDoc } from '../models/Payment';
import { nextNumber } from '../models/Counter';
import { accountRepo } from '../repositories/accountRepo';
import { companyRepo } from '../repositories/companyRepo';
import { partyRepo } from '../repositories/partyRepo';
import { requireCompanyContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';
import { financialYear } from '../utils/financialYear';
import { withTransaction } from '../utils/withTransaction';

async function account(code: string) {
  const acc = await accountRepo.findByCode(code);
  if (!acc) throw new AppError('LEDGER_ACCOUNT_INACTIVE', 422, { missing: code });
  return acc;
}

/** Settles a document by `amountPaise` inside the txn; returns its control account id. */
async function settleDocument(
  model: 'Invoice' | 'Bill',
  documentId: string | Types.ObjectId,
  amountPaise: number,
  session: ClientSession,
): Promise<void> {
  if (model === 'Invoice') {
    const invoice = await Invoice.findOne({ _id: documentId }).session(session);
    if (!invoice || !['issued', 'partially_paid', 'overdue'].includes(invoice.status)) {
      throw new AppError('DOC_INVALID_STATE', 409, { documentId: String(documentId) });
    }
    if (amountPaise > invoice.amountDuePaise) {
      throw new AppError('SYS_VALIDATION_FAILED', 422, {
        allocation: 'exceeds the amount due on the invoice',
      });
    }
    invoice.amountPaidPaise += amountPaise;
    invoice.amountDuePaise -= amountPaise;
    invoice.status = invoice.amountDuePaise === 0 ? 'paid' : 'partially_paid';
    await invoice.save({ session });
  } else {
    const bill = await Bill.findOne({ _id: documentId }).session(session);
    if (!bill || bill.status !== 'approved') {
      throw new AppError('DOC_INVALID_STATE', 409, { documentId: String(documentId) });
    }
    if (bill.amountPaidPaise + amountPaise > bill.grandTotalPaise) {
      throw new AppError('SYS_VALIDATION_FAILED', 422, {
        allocation: 'exceeds the amount due on the bill',
      });
    }
    bill.amountPaidPaise += amountPaise;
    await bill.save({ session });
  }
}

export const paymentService = {
  async create(input: CreatePaymentInput, actorOverride?: Types.ObjectId): Promise<PaymentDoc> {
    const ctx = requireCompanyContext();
    const actor = actorOverride ?? ctx.userId!;
    return withTransaction(async (session) => {
      const [company, party, deposit] = await Promise.all([
        companyRepo.findById(ctx.companyId),
        partyRepo.findById(input.partyId),
        accountRepo.findById(input.depositAccountId),
      ]);
      if (!company || !party) throw new AppError('SYS_NOT_FOUND', 404);
      if (!deposit || !['bank', 'cash'].includes(deposit.subType)) {
        throw new AppError('LEDGER_ACCOUNT_INACTIVE', 422, {
          depositAccountId: 'must be bank/cash',
        });
      }

      const allocated = input.allocations.reduce((s, a) => s + a.amountPaise, 0);
      const unallocated = input.amountPaise - allocated;

      // GST on the advance (inflow only): the advance is tax-INCLUSIVE
      let advCgst = 0,
        advSgst = 0,
        advIgst = 0;
      if (input.direction === 'inflow' && unallocated > 0 && input.advanceGstRate) {
        const partyState =
          party.placeOfSupplyStateCode ?? party.gstin?.slice(0, 2) ?? company.stateCode;
        const inter = partyState !== company.stateCode || party.gstRegistrationType === 'sez';
        const taxable = Math.round((unallocated * 100) / (100 + input.advanceGstRate));
        const split = splitGstPaise(taxable, input.advanceGstRate, inter);
        advCgst = split.cgst;
        advSgst = split.sgst;
        advIgst = split.igst;
      }
      const advTax = advCgst + advSgst + advIgst;

      const glLines: JournalLineDraft[] = [];
      if (input.direction === 'inflow') {
        glLines.push({ accountId: deposit._id, debitPaise: input.amountPaise });
        if (allocated > 0) {
          const ar = party.receivableAccountId
            ? await accountRepo.findById(party.receivableAccountId)
            : await account('1130');
          glLines.push({ accountId: ar!._id, creditPaise: allocated, partyId: party._id });
        }
        if (unallocated > 0) {
          glLines.push({
            accountId: (await account('2140'))._id, // Advance from Customers
            creditPaise: unallocated - advTax,
            partyId: party._id,
          });
          if (advCgst > 0)
            glLines.push({
              accountId: (await account('2120'))._id,
              creditPaise: advCgst,
              gst: { component: 'cgst' },
            });
          if (advSgst > 0)
            glLines.push({
              accountId: (await account('2121'))._id,
              creditPaise: advSgst,
              gst: { component: 'sgst' },
            });
          if (advIgst > 0)
            glLines.push({
              accountId: (await account('2122'))._id,
              creditPaise: advIgst,
              gst: { component: 'igst' },
            });
        }
      } else {
        if (allocated > 0) {
          const ap = party.payableAccountId
            ? await accountRepo.findById(party.payableAccountId)
            : await account('2110');
          glLines.push({ accountId: ap!._id, debitPaise: allocated, partyId: party._id });
        }
        if (unallocated > 0) {
          glLines.push({
            accountId: (await account('1170'))._id, // Advances to Suppliers
            debitPaise: unallocated,
            partyId: party._id,
          });
        }
        glLines.push({ accountId: deposit._id, creditPaise: input.amountPaise });
      }

      for (const allocation of input.allocations) {
        await settleDocument(
          allocation.documentModel,
          allocation.documentId,
          allocation.amountPaise,
          session,
        );
      }

      const fy = financialYear(input.date);
      const paymentNumber = await nextNumber(String(ctx.companyId), fy, 'PAY', session);

      const entry = await GeneralLedger.post(
        ctx.companyId,
        {
          date: input.date,
          narration: `${input.direction === 'inflow' ? 'Payment received from' : 'Payment made to'} ${party.name} (${paymentNumber})`,
          source: { type: 'payment', documentModel: 'Payment' },
          lines: glLines,
        },
        actor,
        session,
      );

      const [payment] = await Payment.create(
        [
          {
            companyId: ctx.companyId,
            paymentNumber,
            direction: input.direction,
            partyId: input.partyId,
            date: input.date,
            amountPaise: input.amountPaise,
            method: input.method,
            reference: input.reference,
            depositAccountId: input.depositAccountId,
            allocations: input.allocations.map((a) => ({
              ...a,
              allocatedAt: new Date(),
              allocatedBy: actor,
            })),
            refundedPaise: 0,
            advanceGst: {
              rate: input.advanceGstRate ?? null,
              cgstPaise: advCgst,
              sgstPaise: advSgst,
              igstPaise: advIgst,
              originalAdvancePaise: unallocated,
            },
            journalEntryId: entry._id,
            createdBy: actor,
          },
        ],
        { session },
      );
      return payment!.toObject();
    });
  },

  /** Append-only later allocation — applies an advance to documents. */
  async allocate(id: string, input: AllocatePaymentInput): Promise<PaymentDoc> {
    const ctx = requireCompanyContext();
    return withTransaction(async (session) => {
      const payment = await Payment.findOne({ _id: id }).session(session);
      if (!payment) throw new AppError('SYS_NOT_FOUND', 404);
      const add = input.allocations.reduce((s, a) => s + a.amountPaise, 0);
      if (add > payment.unallocatedPaise) {
        throw new AppError('SYS_VALIDATION_FAILED', 422, {
          allocations: `exceed the unallocated balance (${payment.unallocatedPaise})`,
        });
      }

      const party = await partyRepo.findById(payment.partyId);
      const glLines: JournalLineDraft[] = [];

      // proportional reversal of the advance GST — the invoice tax replaces it
      const pool = payment.advanceGst.originalAdvancePaise;
      const share = (part: number) => (pool === 0 ? 0 : Math.round((part * add) / pool));

      if (payment.direction === 'inflow') {
        const taxCgst = share(payment.advanceGst.cgstPaise);
        const taxSgst = share(payment.advanceGst.sgstPaise);
        const taxIgst = share(payment.advanceGst.igstPaise);
        const liabilityPart = add - taxCgst - taxSgst - taxIgst;
        glLines.push({
          accountId: (await account('2140'))._id,
          debitPaise: liabilityPart,
          partyId: payment.partyId,
        });
        if (taxCgst > 0)
          glLines.push({
            accountId: (await account('2120'))._id,
            debitPaise: taxCgst,
            gst: { component: 'cgst' },
          });
        if (taxSgst > 0)
          glLines.push({
            accountId: (await account('2121'))._id,
            debitPaise: taxSgst,
            gst: { component: 'sgst' },
          });
        if (taxIgst > 0)
          glLines.push({
            accountId: (await account('2122'))._id,
            debitPaise: taxIgst,
            gst: { component: 'igst' },
          });
        const ar = party?.receivableAccountId
          ? await accountRepo.findById(party.receivableAccountId)
          : await account('1130');
        glLines.push({ accountId: ar!._id, creditPaise: add, partyId: payment.partyId });
      } else {
        const ap = party?.payableAccountId
          ? await accountRepo.findById(party.payableAccountId)
          : await account('2110');
        glLines.push({ accountId: ap!._id, debitPaise: add, partyId: payment.partyId });
        glLines.push({
          accountId: (await account('1170'))._id,
          creditPaise: add,
          partyId: payment.partyId,
        });
      }

      for (const allocation of input.allocations) {
        await settleDocument(
          allocation.documentModel,
          allocation.documentId,
          allocation.amountPaise,
          session,
        );
      }

      await GeneralLedger.post(
        ctx.companyId,
        {
          date: new Date(),
          narration: `Advance ${payment.paymentNumber} applied`,
          source: { type: 'payment', documentId: payment._id, documentModel: 'Payment' },
          lines: glLines,
        },
        ctx.userId!,
        session,
      );

      payment.allocations.push(
        ...input.allocations.map((a) => ({
          documentModel: a.documentModel,
          documentId: new Types.ObjectId(a.documentId),
          amountPaise: a.amountPaise,
          allocatedAt: new Date(),
          allocatedBy: ctx.userId!,
        })),
      );
      await payment.save({ session });
      return payment.toObject();
    });
  },

  /** Refund of an unallocated advance (inflow only). */
  async refund(id: string, amountPaise: number, reason: string): Promise<PaymentDoc> {
    const ctx = requireCompanyContext();
    return withTransaction(async (session) => {
      const payment = await Payment.findOne({ _id: id }).session(session);
      if (!payment) throw new AppError('SYS_NOT_FOUND', 404);
      if (payment.direction !== 'inflow') throw new AppError('DOC_INVALID_STATE', 409);
      if (amountPaise > payment.unallocatedPaise) {
        throw new AppError('SYS_VALIDATION_FAILED', 422, {
          refund: `exceeds the unallocated balance (${payment.unallocatedPaise})`,
        });
      }
      const pool = payment.advanceGst.originalAdvancePaise;
      const share = (part: number) => (pool === 0 ? 0 : Math.round((part * amountPaise) / pool));
      const taxCgst = share(payment.advanceGst.cgstPaise);
      const taxSgst = share(payment.advanceGst.sgstPaise);
      const taxIgst = share(payment.advanceGst.igstPaise);

      const deposit = await accountRepo.findById(payment.depositAccountId);
      const glLines: JournalLineDraft[] = [
        {
          accountId: (await account('2140'))._id,
          debitPaise: amountPaise - taxCgst - taxSgst - taxIgst,
          partyId: payment.partyId,
        },
      ];
      if (taxCgst > 0)
        glLines.push({ accountId: (await account('2120'))._id, debitPaise: taxCgst });
      if (taxSgst > 0)
        glLines.push({ accountId: (await account('2121'))._id, debitPaise: taxSgst });
      if (taxIgst > 0)
        glLines.push({ accountId: (await account('2122'))._id, debitPaise: taxIgst });
      glLines.push({ accountId: deposit!._id, creditPaise: amountPaise });

      await GeneralLedger.post(
        ctx.companyId,
        {
          date: new Date(),
          narration: `Refund of advance ${payment.paymentNumber}: ${reason}`,
          source: { type: 'payment', documentId: payment._id, documentModel: 'Payment' },
          lines: glLines,
        },
        ctx.userId!,
        session,
      );

      payment.refundedPaise += amountPaise;
      await payment.save({ session });
      return payment.toObject();
    });
  },

  async get(id: string): Promise<PaymentDoc> {
    const payment = await Payment.findOne({ _id: id }).lean();
    if (!payment) throw new AppError('SYS_NOT_FOUND', 404);
    return payment;
  },

  list(): Promise<PaymentDoc[]> {
    return Payment.find({}).sort({ date: -1, _id: -1 }).limit(200).lean();
  },
};
