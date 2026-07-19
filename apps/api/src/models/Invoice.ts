/**
 * Invoice (plan.md §11). Tenant-scoped, optimistic concurrency.
 * invoiceNumber is assigned at ISSUE time (gapless numbers are a legal
 * requirement for issued documents; drafts must not burn one — §11 shows it
 * required, but a deleted draft burning a number is exactly the failure I6
 * exists to prevent, so the unique index is partial on its existence).
 */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface InvoiceLine {
  itemId?: Types.ObjectId | null;
  description: string;
  hsn?: string;
  qty: number;
  ratePaise: number;
  discountPercent: number;
  discountPaise: number; // server-computed
  taxablePaise: number; // server-computed
  gstRate: number;
  cessRate: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  lineTotalPaise: number;
}

export interface InvoiceDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  invoiceNumber?: string | null;
  series: string;
  fy?: string | null;
  partyId: Types.ObjectId;
  partySnapshot?: {
    name: string;
    gstin: string | null;
    address: unknown;
    stateCode: string | null;
  };
  issueDate: Date;
  dueDate: Date;
  placeOfSupplyStateCode: string;
  supplyType: 'intra' | 'inter' | 'export' | 'sez' | 'deemed_export';
  reverseCharge: boolean;
  lines: InvoiceLine[];
  subtotalPaise: number;
  totalDiscountPaise: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  roundOffPaise: number;
  grandTotalPaise: number;
  amountPaidPaise: number;
  amountDuePaise: number;
  status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  journalEntryId: Types.ObjectId | null;
  eInvoice: {
    required: boolean;
    irn?: string | null;
    ackNo?: string | null;
    ackDate?: Date | null;
    signedQrCode?: string | null;
    status: 'not_applicable' | 'pending' | 'generated' | 'failed' | 'cancelled';
    lastError?: string | null;
    attemptCount: number;
  };
  notes?: string;
  termsAndConditions?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceLineSchema = new Schema<InvoiceLine>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', default: null },
    description: { type: String, required: true },
    hsn: String,
    qty: { type: Number, required: true, min: 0 },
    ratePaise: { type: Number, required: true },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountPaise: { type: Number, default: 0 },
    taxablePaise: { type: Number, required: true },
    gstRate: { type: Number, required: true },
    cessRate: { type: Number, default: 0 },
    cgstPaise: { type: Number, default: 0 },
    sgstPaise: { type: Number, default: 0 },
    igstPaise: { type: Number, default: 0 },
    cessPaise: { type: Number, default: 0 },
    lineTotalPaise: { type: Number, required: true },
  },
  { _id: false },
);

const InvoiceSchema = new Schema<InvoiceDoc>(
  {
    invoiceNumber: { type: String, default: null }, // gapless, assigned at issue (I6)
    series: { type: String, default: 'INV' },
    fy: { type: String, default: null },
    partyId: { type: Schema.Types.ObjectId, ref: 'Party', required: true },
    partySnapshot: { name: String, gstin: String, address: Object, stateCode: String },
    issueDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    placeOfSupplyStateCode: { type: String, required: true },
    supplyType: {
      type: String,
      enum: ['intra', 'inter', 'export', 'sez', 'deemed_export'],
      required: true,
    },
    reverseCharge: { type: Boolean, default: false },
    lines: [InvoiceLineSchema],
    subtotalPaise: { type: Number, required: true },
    totalDiscountPaise: { type: Number, default: 0 },
    taxableValuePaise: { type: Number, required: true },
    cgstPaise: { type: Number, default: 0 },
    sgstPaise: { type: Number, default: 0 },
    igstPaise: { type: Number, default: 0 },
    cessPaise: { type: Number, default: 0 },
    roundOffPaise: { type: Number, default: 0 },
    grandTotalPaise: { type: Number, required: true },
    amountPaidPaise: { type: Number, default: 0 },
    amountDuePaise: { type: Number, required: true },
    status: {
      type: String,
      enum: ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'],
      default: 'draft',
    },
    journalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    // §14.4 — per-company applicability flag, never a code branch
    eInvoice: {
      required: { type: Boolean, default: false },
      irn: { type: String, default: null },
      ackNo: { type: String, default: null },
      ackDate: { type: Date, default: null },
      signedQrCode: { type: String, default: null },
      status: {
        type: String,
        enum: ['not_applicable', 'pending', 'generated', 'failed', 'cancelled'],
        default: 'not_applicable',
      },
      lastError: { type: String, default: null },
      attemptCount: { type: Number, default: 0 },
    },
    notes: String,
    termsAndConditions: String,
  },
  { timestamps: true, optimisticConcurrency: true },
);

InvoiceSchema.plugin(tenantScope);
InvoiceSchema.index(
  { companyId: 1, invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { invoiceNumber: { $type: 'string' } } },
);
InvoiceSchema.index({ companyId: 1, partyId: 1, issueDate: -1 });
InvoiceSchema.index({ companyId: 1, status: 1, dueDate: 1 });
InvoiceSchema.index({ companyId: 1, issueDate: -1 });

export const Invoice = model<InvoiceDoc>('Invoice', InvoiceSchema);
