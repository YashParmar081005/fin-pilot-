/**
 * Role — a named bag of permissions, per organization (plan.md §9).
 * System roles (§2.1 matrix) are seeded per org and are not editable.
 */
import { Schema, model, type Types } from 'mongoose';

export interface RoleDoc {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  key: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<RoleDoc>(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true }, // 'Accountant'
    key: { type: String, required: true }, // 'accountant'
    isSystem: { type: Boolean, default: false },
    permissions: [{ type: String }],
  },
  { timestamps: true },
);

RoleSchema.index({ organizationId: 1, key: 1 }, { unique: true });

export const Role = model<RoleDoc>('Role', RoleSchema);
