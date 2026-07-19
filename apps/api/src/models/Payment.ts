/**
 * Payment (plan.md §11) — money in/out with APPEND-ONLY allocations.
 * unallocatedPaise is the advance; refunds only come out of it.
 */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface PaymentAllocation {
  documentModel: 'Invoice' | 'Bill';
  documentId: Types.ObjectId;
  amountPaise: number;
  allocatedAt: Date;
  allocatedBy: Types.ObjectId;
}

export interface PaymentDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  paymentNumber: string;
  direction: 'inflow' | 'outflow';
  partyId: Types.ObjectId;
  date: Date;
  amountPaise: number;
  method: string;
  reference?: string;
  depositAccountId: Types.ObjectId;
  allocations: PaymentAllocation[];
  unallocatedPaise: number;
  refundedPaise: number;
  advanceGst: {
    rate: number | null;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    /** gross advance pool at creation — denominator for proportional tax reversal */
    originalAdvancePaise: number;
  };
  journalEntryId: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<PaymentDoc>(
  {
    paymentNumber: { type: String, required: true },
    direction: { type: String, enum: ['inflow', 'outflow'], required: true },
    partyId: { type: Schema.Types.ObjectId, ref: 'Party', required: true },
    date: { type: Date, required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    method: {
      type: String,
      enum: ['cash', 'bank_transfer', 'upi', 'neft', 'rtgs', 'imps', 'cheque', 'card', 'razorpay'],
    },
    reference: String,
    depositAccountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    // append-only — never rewritten, only appended (§11)
    allocations: [
      {
        _id: false,
        documentModel: { type: String, enum: ['Invoice', 'Bill'] },
        documentId: Schema.Types.ObjectId,
        amountPaise: Number,
        allocatedAt: { type: Date, default: Date.now },
        allocatedBy: Schema.Types.ObjectId,
      },
    ],
    unallocatedPaise: { type: Number, default: 0 },
    refundedPaise: { type: Number, default: 0 },
    advanceGst: {
      rate: { type: Number, default: null },
      cgstPaise: { type: Number, default: 0 },
      sgstPaise: { type: Number, default: 0 },
      igstPaise: { type: Number, default: 0 },
      originalAdvancePaise: { type: Number, default: 0 },
    },
    journalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true, optimisticConcurrency: true },
);

// sum(allocations) + refunded <= amountPaise, ALWAYS (§29.2)
PaymentSchema.pre('validate', function () {
  const allocated = this.allocations.reduce((s, a) => s + (a.amountPaise ?? 0), 0);
  if (allocated + this.refundedPaise > this.amountPaise) {
    throw new Error('PAYMENT_OVER_ALLOCATED');
  }
  this.unallocatedPaise = this.amountPaise - allocated - this.refundedPaise;
});

PaymentSchema.plugin(tenantScope);
PaymentSchema.index({ companyId: 1, date: -1 });
PaymentSchema.index({ companyId: 1, 'allocations.documentId': 1 });
PaymentSchema.index({ companyId: 1, paymentNumber: 1 }, { unique: true });
// webhook replay protection: one payment per gateway reference
PaymentSchema.index(
  { companyId: 1, reference: 1 },
  { unique: true, partialFilterExpression: { method: 'razorpay' } },
);

export const Payment = model<PaymentDoc>('Payment', PaymentSchema);
