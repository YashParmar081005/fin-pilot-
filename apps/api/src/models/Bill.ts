/**
 * Purchase bill (plan.md §8.1). The vendor's own bill number is recorded —
 * OUR gapless numbering applies to documents we issue, not receive.
 * draft → approved (posts to GL) → cancelled (reverses).
 */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface BillLine {
  itemId?: Types.ObjectId | null;
  description: string;
  hsn?: string;
  qty: number;
  ratePaise: number;
  gstRate: number;
  cessRate: number;
  itcEligible: boolean;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  lineTotalPaise: number;
}

export interface BillDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  partyId: Types.ObjectId;
  partySnapshot?: { name: string; gstin: string | null };
  vendorBillNumber: string;
  billDate: Date;
  dueDate: Date;
  supplyType: 'intra' | 'inter' | 'export' | 'sez';
  lines: BillLine[];
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  grandTotalPaise: number;
  amountPaidPaise: number;
  status: 'draft' | 'approved' | 'cancelled';
  journalEntryId: Types.ObjectId | null;
  approvedBy?: Types.ObjectId | null;
  recurring?: { enabled: boolean; frequency: 'monthly' | 'quarterly'; nextRunOn?: Date | null };
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BillLineSchema = new Schema<BillLine>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', default: null },
    description: { type: String, required: true },
    hsn: String,
    qty: { type: Number, required: true, min: 0 },
    ratePaise: { type: Number, required: true },
    gstRate: { type: Number, required: true },
    cessRate: { type: Number, default: 0 },
    itcEligible: { type: Boolean, default: true },
    taxablePaise: { type: Number, required: true },
    cgstPaise: { type: Number, default: 0 },
    sgstPaise: { type: Number, default: 0 },
    igstPaise: { type: Number, default: 0 },
    cessPaise: { type: Number, default: 0 },
    lineTotalPaise: { type: Number, required: true },
  },
  { _id: false },
);

const BillSchema = new Schema<BillDoc>(
  {
    partyId: { type: Schema.Types.ObjectId, ref: 'Party', required: true },
    partySnapshot: { name: String, gstin: String },
    vendorBillNumber: { type: String, required: true },
    billDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    supplyType: { type: String, enum: ['intra', 'inter', 'export', 'sez'], required: true },
    lines: [BillLineSchema],
    taxableValuePaise: { type: Number, required: true },
    cgstPaise: { type: Number, default: 0 },
    sgstPaise: { type: Number, default: 0 },
    igstPaise: { type: Number, default: 0 },
    cessPaise: { type: Number, default: 0 },
    grandTotalPaise: { type: Number, required: true },
    amountPaidPaise: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'approved', 'cancelled'], default: 'draft' },
    journalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    approvedBy: { type: Schema.Types.ObjectId, default: null },
    recurring: {
      enabled: { type: Boolean, default: false },
      frequency: { type: String, enum: ['monthly', 'quarterly'], default: 'monthly' },
      nextRunOn: { type: Date, default: null }, // generator job arrives with the queues phase
    },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true, optimisticConcurrency: true },
);

BillSchema.plugin(tenantScope);
BillSchema.index({ companyId: 1, partyId: 1, billDate: -1 });
// same vendor bill twice = double payment risk
BillSchema.index({ companyId: 1, partyId: 1, vendorBillNumber: 1 }, { unique: true });

export const Bill = model<BillDoc>('Bill', BillSchema);
