/**
 * Invoicing (plan.md §32 Phase 7). Draft → issue → cancel.
 * I5: every derived number is computed HERE, at issue time, from qty/rate/
 * discount. I6: the number is consumed inside the issue transaction.
 * Issue posts the exact §12.2 lines through the GeneralLedger; cancel
 * REVERSES — never deletes, and the number stays consumed.
 */
import { Types } from 'mongoose';
import {
  rateIsValidOn,
  splitGstPaise,
  supplyTypeFor,
  type CreateInvoiceInput,
  type UpdateInvoiceInput,
} from '@finpilot/shared';
import { GeneralLedger, type JournalLineDraft } from '../engines/ledger/GeneralLedger';
import { getIrpClient } from '../integrations/irp/client';
import { Invoice, type InvoiceDoc, type InvoiceLine } from '../models/Invoice';
import { OutboxEvent } from '../models/OutboxEvent';
import { partySnapshot } from '../models/Party';
import { nextNumber } from '../models/Counter';
import { accountRepo } from '../repositories/accountRepo';
import { companyRepo } from '../repositories/companyRepo';
import { itemRepo } from '../repositories/itemRepo';
import { partyRepo } from '../repositories/partyRepo';
import { requireCompanyContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';
import { financialYear } from '../utils/financialYear';
import { withTransaction } from '../utils/withTransaction';

interface ComputedTotals {
  lines: InvoiceLine[];
  supplyType: 'intra' | 'inter' | 'export' | 'sez';
  placeOfSupplyStateCode: string;
  subtotalPaise: number;
  totalDiscountPaise: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  roundOffPaise: number;
  grandTotalPaise: number;
}

/** I5 — the server computes everything; client totals were never even parsed. */
async function computeTotals(input: CreateInvoiceInput): Promise<ComputedTotals> {
  const ctx = requireCompanyContext();
  const [company, party] = await Promise.all([
    companyRepo.findById(ctx.companyId),
    partyRepo.findById(input.partyId),
  ]);
  if (!company) throw new AppError('SYS_NOT_FOUND', 404, { what: 'company' });
  if (!party) throw new AppError('SYS_NOT_FOUND', 404, { what: 'party' });

  const pos =
    input.placeOfSupplyStateCode ??
    party.placeOfSupplyStateCode ??
    party.gstin?.slice(0, 2) ??
    company.stateCode;
  const supplyType = supplyTypeFor(company.stateCode, party.gstRegistrationType, pos);
  const isInterState = supplyType !== 'intra';

  const lines: InvoiceLine[] = input.lines.map((line) => {
    if (!rateIsValidOn(line.gstRate, input.issueDate)) {
      throw new AppError('GST_INVALID_RATE_FOR_DATE', 422, {
        gstRate: line.gstRate,
        issueDate: input.issueDate.toISOString().slice(0, 10),
      });
    }
    const grossPaise = Math.round(line.qty * line.ratePaise);
    const discountPaise = Math.round((grossPaise * line.discountPercent) / 100);
    const taxablePaise = grossPaise - discountPaise;
    const { cgst, sgst, igst } = splitGstPaise(taxablePaise, line.gstRate, isInterState);
    const cessPaise = Math.round((taxablePaise * line.cessRate) / 100);
    return {
      itemId: line.itemId ? new Types.ObjectId(line.itemId) : null,
      description: line.description,
      hsn: line.hsn,
      qty: line.qty,
      ratePaise: line.ratePaise,
      discountPercent: line.discountPercent,
      discountPaise,
      taxablePaise,
      gstRate: line.gstRate,
      cessRate: line.cessRate,
      cgstPaise: cgst,
      sgstPaise: sgst,
      igstPaise: igst,
      cessPaise,
      lineTotalPaise: taxablePaise + cgst + sgst + igst + cessPaise,
    };
  });

  const sum = (f: (l: InvoiceLine) => number) => lines.reduce((s, l) => s + f(l), 0);
  const taxableValuePaise = sum((l) => l.taxablePaise);
  const cgstPaise = sum((l) => l.cgstPaise);
  const sgstPaise = sum((l) => l.sgstPaise);
  const igstPaise = sum((l) => l.igstPaise);
  const cessPaise = sum((l) => l.cessPaise);
  const raw = taxableValuePaise + cgstPaise + sgstPaise + igstPaise + cessPaise;
  const grandTotalPaise = Math.round(raw / 100) * 100; // nearest rupee (§12.2)

  return {
    lines,
    supplyType,
    placeOfSupplyStateCode: pos,
    subtotalPaise: sum((l) => l.taxablePaise + l.discountPaise),
    totalDiscountPaise: sum((l) => l.discountPaise),
    taxableValuePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    cessPaise,
    roundOffPaise: grandTotalPaise - raw,
    grandTotalPaise,
  };
}

async function account(code: string, what: string) {
  const acc = await accountRepo.findByCode(code);
  if (!acc) throw new AppError('LEDGER_ACCOUNT_INACTIVE', 422, { missing: `${what} (${code})` });
  return acc;
}

/** The §12.2 truth table, as GL line drafts. */
async function glLinesFor(invoice: InvoiceDoc): Promise<JournalLineDraft[]> {
  const party = await partyRepo.findById(invoice.partyId);
  const ar = party?.receivableAccountId
    ? await accountRepo.findById(party.receivableAccountId)
    : null;
  const arAccount = ar ?? (await account('1130', 'Accounts Receivable'));

  const glLines: JournalLineDraft[] = [
    {
      accountId: arAccount._id,
      debitPaise: invoice.grandTotalPaise,
      partyId: invoice.partyId,
      description: `Invoice ${invoice.invoiceNumber}`,
    },
  ];

  // income per line, grouped by the item's income account (default 4100)
  const incomeTotals = new Map<string, number>();
  for (const line of invoice.lines) {
    const item = line.itemId ? await itemRepo.findById(line.itemId) : null;
    const incomeId = String(item?.incomeAccountId ?? (await account('4100', 'Sales'))._id);
    incomeTotals.set(incomeId, (incomeTotals.get(incomeId) ?? 0) + line.taxablePaise);
  }
  for (const [accountId, paise] of incomeTotals) {
    glLines.push({
      accountId: new Types.ObjectId(accountId),
      creditPaise: paise,
      gst: { taxablePaise: paise },
    });
  }

  const tax = async (paise: number, code: string, component: 'cgst' | 'sgst' | 'igst' | 'cess') => {
    if (paise > 0) {
      glLines.push({
        accountId: (await account(code, `GST Output ${component}`))._id,
        creditPaise: paise,
        gst: { component },
      });
    }
  };
  await tax(invoice.cgstPaise, '2120', 'cgst');
  await tax(invoice.sgstPaise, '2121', 'sgst');
  await tax(invoice.igstPaise, '2122', 'igst');
  await tax(invoice.cessPaise, '2123', 'cess');

  // round-off: without this line the entry does not balance — I2 by design
  if (invoice.roundOffPaise > 0) {
    glLines.push({
      accountId: (await account('5410', 'Round Off'))._id,
      creditPaise: invoice.roundOffPaise,
    });
  } else if (invoice.roundOffPaise < 0) {
    glLines.push({
      accountId: (await account('5410', 'Round Off'))._id,
      debitPaise: -invoice.roundOffPaise,
    });
  }
  return glLines;
}

export const invoiceService = {
  async createDraft(input: CreateInvoiceInput): Promise<InvoiceDoc> {
    const totals = await computeTotals(input);
    const party = await partyRepo.findById(input.partyId);
    const created = await Invoice.create({
      partyId: input.partyId,
      partySnapshot: partySnapshot(party!),
      issueDate: input.issueDate,
      dueDate:
        input.dueDate ??
        new Date(input.issueDate.getTime() + (party!.creditDays || 0) * 86_400_000),
      series: input.series,
      status: 'draft',
      notes: input.notes,
      termsAndConditions: input.termsAndConditions,
      amountPaidPaise: 0,
      amountDuePaise: totals.grandTotalPaise,
      journalEntryId: null,
      reverseCharge: false,
      ...totals,
    });
    return created.toObject();
  },

  async updateDraft(id: string, patch: UpdateInvoiceInput): Promise<InvoiceDoc> {
    const invoice = await Invoice.findOne({ _id: id }).lean();
    if (!invoice) throw new AppError('SYS_NOT_FOUND', 404);
    if (invoice.status !== 'draft') throw new AppError('DOC_CANNOT_EDIT_ISSUED', 409);

    const merged: CreateInvoiceInput = {
      partyId: patch.partyId ?? String(invoice.partyId),
      issueDate: patch.issueDate ?? invoice.issueDate,
      dueDate: patch.dueDate ?? invoice.dueDate,
      placeOfSupplyStateCode: patch.placeOfSupplyStateCode ?? invoice.placeOfSupplyStateCode,
      series: patch.series ?? invoice.series,
      notes: patch.notes ?? invoice.notes,
      termsAndConditions: patch.termsAndConditions ?? invoice.termsAndConditions,
      lines:
        patch.lines ??
        invoice.lines.map((l) => ({
          itemId: l.itemId ? String(l.itemId) : undefined,
          description: l.description,
          hsn: l.hsn,
          qty: l.qty,
          ratePaise: l.ratePaise,
          discountPercent: l.discountPercent,
          gstRate: l.gstRate,
          cessRate: l.cessRate,
        })),
    };
    const totals = await computeTotals(merged);
    const updated = await Invoice.findOneAndUpdate(
      { _id: id, status: 'draft' },
      {
        ...merged,
        ...totals,
        partyId: new Types.ObjectId(merged.partyId),
        amountDuePaise: totals.grandTotalPaise,
      },
      { new: true },
    ).lean();
    return updated!;
  },

  /** Issue: number + GL entry + status, one transaction (I6, §12.1). */
  async issue(id: string): Promise<InvoiceDoc> {
    const ctx = requireCompanyContext();
    return withTransaction(async (session) => {
      const invoice = await Invoice.findOne({ _id: id }).session(session);
      if (!invoice) throw new AppError('SYS_NOT_FOUND', 404);
      if (invoice.status !== 'draft') throw new AppError('DOC_ALREADY_ISSUED', 409);

      const fy = financialYear(invoice.issueDate);
      invoice.invoiceNumber = await nextNumber(String(ctx.companyId), fy, invoice.series, session);
      invoice.fy = fy;

      const entry = await GeneralLedger.post(
        ctx.companyId,
        {
          date: invoice.issueDate,
          narration: `Sales invoice ${invoice.invoiceNumber} — ${invoice.partySnapshot?.name}`,
          source: { type: 'invoice', documentId: invoice._id, documentModel: 'Invoice' },
          lines: await glLinesFor(invoice.toObject()),
        },
        ctx.userId!,
        session,
      );

      invoice.status = 'issued';
      invoice.journalEntryId = entry._id;

      // §14.4: async IRN — 201 returns immediately, the worker does the IRP
      const company = await companyRepo.findById(ctx.companyId);
      if (company?.eInvoiceEnabled && invoice.partySnapshot?.gstin) {
        invoice.eInvoice.required = true;
        invoice.eInvoice.status = 'pending';
        await OutboxEvent.create(
          [
            {
              companyId: ctx.companyId,
              type: 'invoice.issued.einvoice',
              payload: { invoiceId: String(invoice._id), companyId: String(ctx.companyId) },
            },
          ],
          { session },
        );
      }
      await invoice.save({ session });
      return invoice.toObject();
    });
  },

  /** Cancel: reverse the GL entry. Never delete; the number stays consumed. */
  async cancel(id: string, reason: string): Promise<InvoiceDoc> {
    const ctx = requireCompanyContext();
    return withTransaction(async (session) => {
      const invoice = await Invoice.findOne({ _id: id }).session(session);
      if (!invoice) throw new AppError('SYS_NOT_FOUND', 404);
      if (invoice.status === 'cancelled') throw new AppError('DOC_ALREADY_ISSUED', 409);
      if (invoice.amountPaidPaise > 0) throw new AppError('DOC_CANNOT_CANCEL_PAID', 409);
      if (invoice.status !== 'issued' || !invoice.journalEntryId) {
        throw new AppError('DOC_CANNOT_EDIT_ISSUED', 409, { status: invoice.status });
      }

      await GeneralLedger.reverse(
        ctx.companyId,
        invoice.journalEntryId,
        `invoice ${invoice.invoiceNumber} cancelled: ${reason}`,
        ctx.userId!,
        session,
      );
      // §14.4: IRN cancellation only within 24 h of generation
      if (invoice.eInvoice.status === 'generated') {
        const age = Date.now() - (invoice.eInvoice.ackDate?.getTime() ?? 0);
        if (age > 24 * 3_600_000) throw new AppError('IRP_WINDOW_EXPIRED', 409);
        await getIrpClient().cancelIrn(invoice.eInvoice.irn!, reason);
        invoice.eInvoice.status = 'cancelled';
      }
      invoice.status = 'cancelled';
      invoice.amountDuePaise = 0;
      await invoice.save({ session });
      return invoice.toObject();
    });
  },

  async get(id: string): Promise<InvoiceDoc> {
    const invoice = await Invoice.findOne({ _id: id }).lean();
    if (!invoice) throw new AppError('SYS_NOT_FOUND', 404);
    return invoice;
  },

  list(status?: string): Promise<InvoiceDoc[]> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    return Invoice.find(filter).sort({ issueDate: -1, _id: -1 }).limit(200).lean();
  },
};
