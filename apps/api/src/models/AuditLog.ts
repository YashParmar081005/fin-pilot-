/**
 * Audit log (plan.md §8.1) — append-only, who did what, TTL 7 years.
 * Written inside the same transaction as the action it records (§12.1 #11).
 */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface AuditLogDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  action: string; // 'journal.posted', 'journal.reversed', …
  entityType: string;
  entityId: Types.ObjectId;
  actorId: Types.ObjectId;
  at: Date;
  meta?: Record<string, unknown>;
}

const AuditLogSchema = new Schema<AuditLogDoc>(
  {
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    actorId: { type: Schema.Types.ObjectId, required: true },
    at: { type: Date, default: Date.now },
    meta: Object,
  },
  { versionKey: false },
);

AuditLogSchema.plugin(tenantScope);
AuditLogSchema.index({ at: 1 }, { expireAfterSeconds: 220_752_000 }); // 7 years
AuditLogSchema.index({ companyId: 1, entityType: 1, entityId: 1, at: -1 });

export const AuditLog = model<AuditLogDoc>('AuditLog', AuditLogSchema);
