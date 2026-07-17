/**
 * Membership — user × company × role; the heart of tenancy (plan.md §9).
 * NOT plugin-scoped: memberships are looked up while RESOLVING the tenant
 * context, before any context exists.
 */
import { Schema, model, type Types } from 'mongoose';

export interface MembershipDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  companyId: Types.ObjectId;
  roleId: Types.ObjectId;
  status: 'invited' | 'active' | 'suspended';
  invitedBy?: Types.ObjectId;
  acceptedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<MembershipDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    status: { type: String, enum: ['invited', 'active', 'suspended'], default: 'invited' },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

MembershipSchema.index({ userId: 1, companyId: 1 }, { unique: true });
MembershipSchema.index({ companyId: 1, status: 1 });
MembershipSchema.index({ roleId: 1 });

export const Membership = model<MembershipDoc>('Membership', MembershipSchema);
