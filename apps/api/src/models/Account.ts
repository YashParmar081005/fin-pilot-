/**
 * Chart of accounts (plan.md §10). Tenant-scoped via the I8 plugin — every
 * query is companyId-injected from request context. The tree is a
 * materialised path of CODES ('/1000/1100') for cheap subtree rollups.
 */
import { Schema, model, type Types } from 'mongoose';
import { ACCOUNT_SUBTYPES, ACCOUNT_TYPES } from '@finpilot/shared';
import { tenantScope } from '../plugins/tenantScope';

export interface AccountDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  code: string;
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  subType: (typeof ACCOUNT_SUBTYPES)[number];
  parentId: Types.ObjectId | null;
  path: string; // '/1000/1100' — materialised path of codes
  depth: number;
  isSystem: boolean;
  isActive: boolean;
  currentBalancePaise: number; // denormalised, rebuilt nightly — NEVER the source of truth
  bankAccountId: Types.ObjectId | null;
  gstRate: number | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AccountSchema = new Schema<AccountDoc>(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true, enum: ACCOUNT_TYPES },
    subType: { type: String, required: true, enum: ACCOUNT_SUBTYPES },
    parentId: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    path: { type: String, required: true },
    depth: { type: Number, default: 0 },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    currentBalancePaise: { type: Number, default: 0 },
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'BankAccount', default: null },
    gstRate: { type: Number, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

AccountSchema.plugin(tenantScope);

AccountSchema.index({ companyId: 1, code: 1 }, { unique: true });
AccountSchema.index({ companyId: 1, path: 1 });
AccountSchema.index({ companyId: 1, type: 1, isActive: 1 });

export const Account = model<AccountDoc>('Account', AccountSchema);
