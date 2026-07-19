/**
 * Engine 2 — GST (plan.md §14, §32 Phase 12).
 * Builds GSTR-1 / GSTR-3B working papers FROM THE DOCUMENTS the ledger
 * already posted — every rupee in a return traces to journalEntryIds, and
 * every table must sum to the trial balance's tax accounts (the test
 * asserts it). The GSTN-shape validation here is a strict Zod model of the
 * GSTR-1 structure; the versioned official ajv schemas ride in with the
 * GSP client (Phase 13+), per §14.4.
 */
import { z } from 'zod';
import { Types } from 'mongoose';
import { Bill } from '../../models/Bill';
import { Company } from '../../models/Company';
import { GstReturn, type GstReturnDoc } from '../../models/GstReturn';
import { Invoice } from '../../models/Invoice';
import { AppError } from '../../utils/AppError';

/** GSTN GSTR-1 shape (compact): fp = filing period MMYYYY. */
export const gstr1Schema = z.object({
  gstin: z.string().length(15),
  fp: z.string().regex(/^\d{6}$/),
  gt: z.number(), // gross turnover
  b2b: z.array(
    z.object({
      ctin: z.string().length(15),
      inv: z.array(
        z.object({
          inum: z.string().min(1),
          idt: z.string().regex(/^\d{2}-\d{2}-\d{4}$/),
          val: z.number(),
          pos: z.string().length(2),
          rchrg: z.enum(['Y', 'N']),
          itms: z.array(
            z.object({
              num: z.number().int(),
              itm_det: z.object({
                rt: z.number(),
                txval: z.number(),
                iamt: z.number(),
                camt: z.number(),
                samt: z.number(),
                csamt: z.number(),
              }),
            }),
          ),
        }),
      ),
    }),
  ),
  b2cs: z.array(
    z.object({
      sply_ty: z.enum(['INTRA', 'INTER']),
      pos: z.string().length(2),
      rt: z.number(),
      typ: z.literal('OE'),
      txval: z.number(),
      iamt: z.number(),
      camt: z.number(),
      samt: z.number(),
      csamt: z.number(),
    }),
  ),
});

function periodRange(period: string): { from: Date; to: Date } {
  const [y, m] = period.split('-').map(Number);
  return { from: new Date(Date.UTC(y!, m! - 1, 1)), to: new Date(Date.UTC(y!, m!, 1)) };
}

const paiseToRupees = (p: number) => Math.round(p) / 100;
const ddmmyyyy = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;

export const GstEngine = {
  /** GSTR-1: outward supplies, B2B per counterparty GSTIN + B2C summary. */
  async generateGstr1(companyId: Types.ObjectId | string, period: string): Promise<GstReturnDoc> {
    const company = await Company.findById(companyId).lean();
    if (!company?.gstin)
      throw new AppError('GST_INVALID_GSTIN', 422, { reason: 'company has no GSTIN' });
    const { from, to } = periodRange(period);

    // cancelled invoices stay OUT of the return; their reversal nets the TB
    const invoices = await Invoice.find({
      status: { $in: ['issued', 'partially_paid', 'paid', 'overdue'] },
      issueDate: { $gte: from, $lt: to },
    }).lean();

    const b2bByCtin = new Map<string, Array<Record<string, unknown>>>();
    const b2cs = new Map<
      string,
      {
        sply_ty: 'INTRA' | 'INTER';
        pos: string;
        rt: number;
        txval: number;
        iamt: number;
        camt: number;
        samt: number;
        csamt: number;
      }
    >();
    const trace: GstReturnDoc['trace'] = [];
    let grossPaise = 0;

    for (const inv of invoices) {
      grossPaise += inv.grandTotalPaise;
      const rateGroups = new Map<
        number,
        { txval: number; iamt: number; camt: number; samt: number; csamt: number }
      >();
      for (const line of inv.lines) {
        const g = rateGroups.get(line.gstRate) ?? { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
        g.txval += line.taxablePaise;
        g.iamt += line.igstPaise;
        g.camt += line.cgstPaise;
        g.samt += line.sgstPaise;
        g.csamt += line.cessPaise;
        rateGroups.set(line.gstRate, g);
      }

      if (inv.partySnapshot?.gstin) {
        const rows = b2bByCtin.get(inv.partySnapshot.gstin) ?? [];
        rows.push({
          inum: inv.invoiceNumber,
          idt: ddmmyyyy(inv.issueDate),
          val: paiseToRupees(inv.grandTotalPaise),
          pos: inv.placeOfSupplyStateCode,
          rchrg: inv.reverseCharge ? 'Y' : 'N',
          itms: [...rateGroups.entries()].map(([rt, g], i) => ({
            num: i + 1,
            itm_det: {
              rt,
              txval: paiseToRupees(g.txval),
              iamt: paiseToRupees(g.iamt),
              camt: paiseToRupees(g.camt),
              samt: paiseToRupees(g.samt),
              csamt: paiseToRupees(g.csamt),
            },
          })),
        });
        b2bByCtin.set(inv.partySnapshot.gstin, rows);
        trace.push({
          ref: `b2b:${inv.invoiceNumber}`,
          journalEntryIds: inv.journalEntryId ? [inv.journalEntryId] : [],
        });
      } else {
        for (const [rt, g] of rateGroups) {
          const key = `${inv.supplyType === 'intra' ? 'INTRA' : 'INTER'}:${inv.placeOfSupplyStateCode}:${rt}`;
          const row = b2cs.get(key) ?? {
            sply_ty: inv.supplyType === 'intra' ? ('INTRA' as const) : ('INTER' as const),
            pos: inv.placeOfSupplyStateCode,
            rt,
            txval: 0,
            iamt: 0,
            camt: 0,
            samt: 0,
            csamt: 0,
          };
          row.txval += g.txval;
          row.iamt += g.iamt;
          row.camt += g.camt;
          row.samt += g.samt;
          row.csamt += g.csamt;
          b2cs.set(key, row);
          const t = trace.find((x) => x.ref === `b2cs:${key}`);
          if (t) {
            if (inv.journalEntryId) t.journalEntryIds.push(inv.journalEntryId);
          } else
            trace.push({
              ref: `b2cs:${key}`,
              journalEntryIds: inv.journalEntryId ? [inv.journalEntryId] : [],
            });
        }
      }
    }

    const [y, m] = period.split('-');
    const data = gstr1Schema.parse({
      gstin: company.gstin,
      fp: `${m}${y}`,
      gt: paiseToRupees(grossPaise),
      b2b: [...b2bByCtin.entries()].map(([ctin, inv]) => ({ ctin, inv })),
      b2cs: [...b2cs.values()].map((r) => ({
        ...r,
        typ: 'OE' as const,
        txval: paiseToRupees(r.txval),
        iamt: paiseToRupees(r.iamt),
        camt: paiseToRupees(r.camt),
        samt: paiseToRupees(r.samt),
        csamt: paiseToRupees(r.csamt),
      })),
    });

    return GstReturn.findOneAndUpdate(
      { type: 'gstr1', period },
      { data, trace, status: 'draft', generatedAt: new Date() },
      { new: true, upsert: true },
    ).lean() as Promise<GstReturnDoc>;
  },

  /** GSTR-3B: 3.1(a) outward supplies + 4(A) eligible ITC + net payable. */
  async generateGstr3b(companyId: Types.ObjectId | string, period: string): Promise<GstReturnDoc> {
    const { from, to } = periodRange(period);
    const invoices = await Invoice.find({
      status: { $in: ['issued', 'partially_paid', 'paid', 'overdue'] },
      issueDate: { $gte: from, $lt: to },
    }).lean();
    const bills = await Bill.find({ status: 'approved', billDate: { $gte: from, $lt: to } }).lean();

    const out = { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
    const outTrace: Types.ObjectId[] = [];
    for (const inv of invoices) {
      out.txval += inv.taxableValuePaise;
      out.iamt += inv.igstPaise;
      out.camt += inv.cgstPaise;
      out.samt += inv.sgstPaise;
      out.csamt += inv.cessPaise;
      if (inv.journalEntryId) outTrace.push(inv.journalEntryId);
    }
    const itc = { iamt: 0, camt: 0, samt: 0, csamt: 0 };
    const itcTrace: Types.ObjectId[] = [];
    for (const bill of bills) {
      for (const line of bill.lines) {
        if (!line.itcEligible) continue;
        itc.iamt += line.igstPaise;
        itc.camt += line.cgstPaise;
        itc.samt += line.sgstPaise;
        itc.csamt += line.cessPaise;
      }
      if (bill.journalEntryId) itcTrace.push(bill.journalEntryId);
    }

    const data = {
      period,
      outward_3_1_a: {
        txval: paiseToRupees(out.txval),
        iamt: paiseToRupees(out.iamt),
        camt: paiseToRupees(out.camt),
        samt: paiseToRupees(out.samt),
        csamt: paiseToRupees(out.csamt),
      },
      itc_4a: {
        iamt: paiseToRupees(itc.iamt),
        camt: paiseToRupees(itc.camt),
        samt: paiseToRupees(itc.samt),
        csamt: paiseToRupees(itc.csamt),
      },
      net_payable: {
        iamt: paiseToRupees(out.iamt - itc.iamt),
        camt: paiseToRupees(out.camt - itc.camt),
        samt: paiseToRupees(out.samt - itc.samt),
        csamt: paiseToRupees(out.csamt - itc.csamt),
      },
    };

    return GstReturn.findOneAndUpdate(
      { type: 'gstr3b', period },
      {
        data,
        trace: [
          { ref: 'outward_3_1_a', journalEntryIds: outTrace },
          { ref: 'itc_4a', journalEntryIds: itcTrace },
        ],
        status: 'draft',
        generatedAt: new Date(),
      },
      { new: true, upsert: true },
    ).lean() as Promise<GstReturnDoc>;
  },

  /** §32: /gst/returns/:id/trace returns the EXACT journalEntryId[] for any row. */
  async trace(returnId: string, ref: string): Promise<string[]> {
    const doc = await GstReturn.findOne({ _id: returnId }).lean();
    if (!doc) throw new AppError('SYS_NOT_FOUND', 404);
    const row = doc.trace.find((t) => t.ref === ref);
    if (!row) throw new AppError('SYS_NOT_FOUND', 404, { ref });
    return row.journalEntryIds.map(String);
  },
};
