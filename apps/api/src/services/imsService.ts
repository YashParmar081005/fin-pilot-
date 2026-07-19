/**
 * IMS (plan.md §14.5, §32 Phase 14 — the differentiator).
 * Sync pulls the recipient dashboard from the GSP, the matcher reconciles
 * every record against OUR bills, actions push back via the GSP, and any
 * action after the 14th carries recompute-GSTR-2B guidance.
 */
import { Types } from 'mongoose';
import { Bill } from '../models/Bill';
import { ImsRecord, type ImsRecordDoc } from '../models/ImsRecord';
import { Party } from '../models/Party';
import { requireCompanyContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';

/** GSP IMS surface — mock in dev/test; a real GSP is a new file. */
export interface ImsGspRecord {
  supplierGstin: string;
  supplierTradeName?: string;
  documentType: 'invoice' | 'debit_note' | 'credit_note' | 'amendment';
  documentNumber: string;
  documentDate: string;
  taxableValuePaise: number;
  igstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  cessPaise: number;
}
export interface ImsGspClient {
  fetchRecords(gstin: string, period: string): Promise<ImsGspRecord[]>;
  pushAction(record: {
    supplierGstin: string;
    documentNumber: string;
    action: string;
    remarks?: string | null;
  }): Promise<void>;
}

export class MockImsGspClient implements ImsGspClient {
  records: ImsGspRecord[] = [];
  pushed: Array<{ supplierGstin: string; documentNumber: string; action: string }> = [];
  async fetchRecords(): Promise<ImsGspRecord[]> {
    return this.records;
  }
  async pushAction(record: { supplierGstin: string; documentNumber: string; action: string }) {
    this.pushed.push(record);
  }
}

let client: ImsGspClient = new MockImsGspClient();
export function getImsClient(): ImsGspClient {
  return client;
}
export function setImsClient(next: ImsGspClient): void {
  client = next;
}

/** Matcher: supplier GSTIN → our vendor parties → bill by vendorBillNumber. */
async function matchRecord(rec: ImsGspRecord): Promise<{
  matchStatus: ImsRecordDoc['matchStatus'];
  matchedBillId: Types.ObjectId | null;
}> {
  const suppliers = await Party.find({ gstin: rec.supplierGstin, deletedAt: null }).lean();
  if (suppliers.length === 0) return { matchStatus: 'not_in_books', matchedBillId: null };
  const bill = await Bill.findOne({
    partyId: { $in: suppliers.map((s) => s._id) },
    vendorBillNumber: rec.documentNumber,
    status: 'approved',
  }).lean();
  if (!bill) return { matchStatus: 'not_in_books', matchedBillId: null };
  const taxesMatch =
    bill.taxableValuePaise === rec.taxableValuePaise &&
    bill.igstPaise === rec.igstPaise &&
    bill.cgstPaise === rec.cgstPaise &&
    bill.sgstPaise === rec.sgstPaise;
  return { matchStatus: taxesMatch ? 'matched' : 'amount_mismatch', matchedBillId: bill._id };
}

const itcAtRisk = (r: {
  igstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  cessPaise: number;
}) => r.igstPaise + r.cgstPaise + r.sgstPaise + r.cessPaise;

export const imsService = {
  /** Pull the period from the GSP, upsert, and reconcile every record. */
  async sync(period: string, gstin: string): Promise<{ synced: number }> {
    const records = await getImsClient().fetchRecords(gstin, period);
    for (const rec of records) {
      const match = await matchRecord(rec);
      await ImsRecord.findOneAndUpdate(
        { supplierGstin: rec.supplierGstin, documentNumber: rec.documentNumber },
        {
          $set: {
            taxPeriod: period,
            supplierTradeName: rec.supplierTradeName,
            documentType: rec.documentType,
            documentDate: new Date(rec.documentDate),
            taxableValuePaise: rec.taxableValuePaise,
            igstPaise: rec.igstPaise,
            cgstPaise: rec.cgstPaise,
            sgstPaise: rec.sgstPaise,
            cessPaise: rec.cessPaise,
            ...match,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }
    return { synced: records.length };
  },

  list(period: string): Promise<ImsRecordDoc[]> {
    return ImsRecord.find({ taxPeriod: period }).sort({ documentDate: 1 }).lean();
  },

  /**
   * Accept / reject / pending, pushed back via the GSP. Pending is capped at
   * ONE carried period for specified records (§14.5). After the 14th the
   * caller gets recompute guidance — draft GSTR-2B is already generated.
   */
  async act(
    ids: string[],
    action: 'accept' | 'reject' | 'pending',
    remarks: string | undefined,
    now = new Date(),
  ): Promise<{ actioned: number; gstr2bRecomputeRequired: boolean }> {
    const ctx = requireCompanyContext();
    let actioned = 0;
    for (const id of ids) {
      const record = await ImsRecord.findOne({ _id: id });
      if (!record) throw new AppError('SYS_NOT_FOUND', 404, { id });
      if (action === 'pending' && record.pendingPeriodsUsed >= 1) {
        throw new AppError('GST_IMS_ACTION_LOCKED', 409, {
          reason: 'pending is capped at one tax period for specified records',
        });
      }
      record.action = action;
      record.actionTakenAt = now;
      record.actionTakenBy = ctx.userId!;
      record.remarks = remarks ?? null;
      if (action === 'pending') record.pendingPeriodsUsed += 1;
      await record.save();
      await getImsClient().pushAction({
        supplierGstin: record.supplierGstin,
        documentNumber: record.documentNumber,
        action,
        remarks,
      });
      record.pushedBackAt = new Date();
      await record.save();
      actioned += 1;
    }
    // draft GSTR-2B generates on the 14th; later actions require a recompute
    return { actioned, gstr2bRecomputeRequired: now.getUTCDate() > 14 };
  },

  /** The 10th-of-month alarm: unactioned records and the ITC at risk. */
  async deadlineAlarm(period: string): Promise<{ unactioned: number; itcAtRiskPaise: number }> {
    const rows = await ImsRecord.find({ taxPeriod: period, action: 'no_action' }).lean();
    return {
      unactioned: rows.length,
      itcAtRiskPaise: rows.reduce((s, r) => s + itcAtRisk(r), 0),
    };
  },
};
