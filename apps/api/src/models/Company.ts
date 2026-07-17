/**
 * Company — a legal entity with a GSTIN; the book of record (plan.md §9).
 * NOT plugin-scoped: it IS the tenant. Everything below it is scoped by it.
 */
import { Schema, model, type Types } from 'mongoose';

export interface CompanyDoc {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  legalName: string;
  tradeName?: string;
  pan?: string;
  gstin?: string;
  gstRegistrationType: 'regular' | 'composition' | 'unregistered' | 'sez' | 'casual';
  stateCode: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  };
  financialYearStartMonth: number;
  currency: string;
  booksBeginDate: Date;
  eInvoiceEnabled: boolean;
  aggregateTurnoverPaise: number;
  booksLockedUpto?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CompanySchema = new Schema<CompanyDoc>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    legalName: { type: String, required: true },
    tradeName: String,
    pan: { type: String, uppercase: true, match: /^[A-Z]{5}\d{4}[A-Z]$/ },
    // corrected 15-char GSTIN pattern (plan.md changelog v1.0.1)
    gstin: { type: String, uppercase: true, match: /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/ },
    gstRegistrationType: {
      type: String,
      enum: ['regular', 'composition', 'unregistered', 'sez', 'casual'],
      default: 'regular',
    },
    // '24' = Gujarat. Drives IGST vs CGST+SGST (§14).
    stateCode: { type: String, required: true, minlength: 2, maxlength: 2 },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: { type: String, match: /^\d{6}$/ },
      country: { type: String, default: 'IN' },
    },
    financialYearStartMonth: { type: Number, default: 4, min: 1, max: 12 }, // April
    currency: { type: String, default: 'INR', immutable: true },
    booksBeginDate: { type: Date, required: true },
    // e-invoicing applicability (§14.4) — a per-company flag, not a code branch
    eInvoiceEnabled: { type: Boolean, default: false },
    aggregateTurnoverPaise: { type: Number, default: 0 },
    // period locking (§10.2)
    booksLockedUpto: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Company = model<CompanyDoc>('Company', CompanySchema);
