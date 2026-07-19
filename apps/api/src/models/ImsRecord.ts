/**
 * IMS record (plan.md §14.5) — every inward B2B document on the recipient's
 * IMS dashboard. No action = deemed accepted; silence is a decision.
 */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface ImsRecordDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  taxPeriod: string; // '2026-07'
  supplierGstin: string;
  supplierTradeName?: string;
  documentType: 'invoice' | 'debit_note' | 'credit_note' | 'amendment';
  documentNumber: string;
  documentDate: Date;
  taxableValuePaise: number;
  igstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  cessPaise: number;
  action: 'no_action' | 'accept' | 'reject' | 'pending';
  actionTakenAt?: Date | null;
  actionTakenBy?: Types.ObjectId | null;
  remarks?: string | null;
  pendingPeriodsUsed: number;
  pushedBackAt?: Date | null;
  // reconciliation against OUR books
  matchStatus: 'matched' | 'amount_mismatch' | 'not_in_books';
  matchedBillId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ImsRecordSchema = new Schema<ImsRecordDoc>(
  {
    taxPeriod: { type: String, required: true },
    supplierGstin: { type: String, required: true },
    supplierTradeName: String,
    documentType: {
      type: String,
      enum: ['invoice', 'debit_note', 'credit_note', 'amendment'],
      required: true,
    },
    documentNumber: { type: String, required: true },
    documentDate: { type: Date, required: true },
    taxableValuePaise: Number,
    igstPaise: Number,
    cgstPaise: Number,
    sgstPaise: Number,
    cessPaise: Number,
    action: {
      type: String,
      enum: ['no_action', 'accept', 'reject', 'pending'],
      default: 'no_action',
    },
    actionTakenAt: { type: Date, default: null },
    actionTakenBy: { type: Schema.Types.ObjectId, default: null },
    remarks: { type: String, default: null },
    pendingPeriodsUsed: { type: Number, default: 0 },
    pushedBackAt: { type: Date, default: null },
    matchStatus: {
      type: String,
      enum: ['matched', 'amount_mismatch', 'not_in_books'],
      default: 'not_in_books',
    },
    matchedBillId: { type: Schema.Types.ObjectId, ref: 'Bill', default: null },
  },
  { timestamps: true },
);

ImsRecordSchema.plugin(tenantScope);
ImsRecordSchema.index({ companyId: 1, supplierGstin: 1, documentNumber: 1 }, { unique: true });
ImsRecordSchema.index({ companyId: 1, taxPeriod: 1, action: 1 });

export const ImsRecord = model<ImsRecordDoc>('ImsRecord', ImsRecordSchema);
