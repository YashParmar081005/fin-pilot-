/**
 * Party — customers AND vendors, one collection; a party is often both
 * (plan.md §11). Tenant-scoped, optimistic concurrency (§22.3).
 */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

interface Address {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export interface PartyDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  type: Array<'customer' | 'vendor'>;
  name: string;
  legalName?: string;
  gstin?: string;
  gstRegistrationType: 'regular' | 'composition' | 'unregistered' | 'sez' | 'overseas';
  pan?: string;
  email?: string;
  phone?: string;
  billingAddress?: Address;
  shippingAddress?: Address;
  placeOfSupplyStateCode?: string;
  creditLimitPaise: number;
  creditDays: number;
  receivableAccountId?: Types.ObjectId | null;
  payableAccountId?: Types.ObjectId | null;
  // denormalised, rebuilt from the ledger; display-only, never used in a decision
  outstandingReceivablePaise: number;
  outstandingPayablePaise: number;
  tags: string[];
  notes?: string;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AddressSchema = new Schema<Address>(
  {
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: { type: String, match: /^\d{6}$/ },
    country: { type: String, default: 'IN' },
  },
  { _id: false },
);

const PartySchema = new Schema<PartyDoc>(
  {
    type: [{ type: String, enum: ['customer', 'vendor'] }],
    name: { type: String, required: true },
    legalName: String,
    gstin: { type: String, uppercase: true, sparse: true },
    gstRegistrationType: {
      type: String,
      enum: ['regular', 'composition', 'unregistered', 'sez', 'overseas'],
      default: 'unregistered',
    },
    pan: String,
    email: String,
    phone: String,
    billingAddress: AddressSchema,
    shippingAddress: AddressSchema,
    placeOfSupplyStateCode: { type: String, minlength: 2, maxlength: 2 },
    creditLimitPaise: { type: Number, default: 0 },
    creditDays: { type: Number, default: 0 },
    // control accounts
    receivableAccountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    payableAccountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    outstandingReceivablePaise: { type: Number, default: 0 },
    outstandingPayablePaise: { type: Number, default: 0 },
    tags: [String],
    notes: String,
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

PartySchema.plugin(tenantScope);
PartySchema.index({ companyId: 1, type: 1, name: 1 });
PartySchema.index({ companyId: 1, gstin: 1 }, { sparse: true });
PartySchema.index({ name: 'text', legalName: 'text' });

export const Party = model<PartyDoc>('Party', PartySchema);

/**
 * Snapshot for embedding in documents at issue time (§11) — a customer
 * renaming themselves must not rewrite history.
 */
export interface PartySnapshot {
  name: string;
  gstin: string | null;
  address: Address | null;
  stateCode: string | null;
}

export function partySnapshot(party: PartyDoc): PartySnapshot {
  return {
    name: party.name,
    gstin: party.gstin ?? null,
    address: party.billingAddress ?? null,
    stateCode: party.placeOfSupplyStateCode ?? party.gstin?.slice(0, 2) ?? null,
  };
}
