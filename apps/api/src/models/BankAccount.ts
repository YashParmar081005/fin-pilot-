/** Bank accounts (plan.md §8.1) — connected (AA) + manual. Tenant-scoped. */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface BankAccountDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  name: string;
  bankName?: string;
  accountNumberMasked?: string;
  ifsc?: string;
  ledgerAccountId: Types.ObjectId; // the COA bank account it posts to
  source: 'manual' | 'aa';
  aaConsentId?: string | null;
  aaConsentStatus?: 'none' | 'pending' | 'active' | 'revoked';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BankAccountSchema = new Schema<BankAccountDoc>(
  {
    name: { type: String, required: true },
    bankName: String,
    accountNumberMasked: String,
    ifsc: String,
    ledgerAccountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    source: { type: String, enum: ['manual', 'aa'], default: 'manual' },
    aaConsentId: { type: String, default: null },
    aaConsentStatus: {
      type: String,
      enum: ['none', 'pending', 'active', 'revoked'],
      default: 'none',
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

BankAccountSchema.plugin(tenantScope);

export const BankAccount = model<BankAccountDoc>('BankAccount', BankAccountSchema);
