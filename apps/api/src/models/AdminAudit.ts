/**
 * Platform-level audit trail (plan.md §32 Phase 23) for super-admin actions:
 * plan changes, impersonation start/end. Tenant AuditLog cannot hold these —
 * it requires a companyId; these actions happen ABOVE the tenant boundary.
 * Append-only, 7-year TTL like the tenant audit log.
 */
import { Schema, model, type Types } from 'mongoose';

export interface AdminAuditDoc {
  _id: Types.ObjectId;
  adminUserId: Types.ObjectId;
  action: string; // 'org.plan_changed', 'impersonation.started', …
  targetType: string;
  targetId: Types.ObjectId;
  reason?: string;
  meta?: Record<string, unknown>;
  at: Date;
}

const AdminAuditSchema = new Schema<AdminAuditDoc>(
  {
    adminUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reason: String,
    meta: Object,
    at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

AdminAuditSchema.index({ at: 1 }, { expireAfterSeconds: 220_752_000 }); // 7 years
AdminAuditSchema.index({ adminUserId: 1, at: -1 });

export const AdminAudit = model<AdminAuditDoc>('AdminAudit', AdminAuditSchema);
