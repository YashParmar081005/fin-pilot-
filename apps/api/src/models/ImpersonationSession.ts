/**
 * Impersonation record (plan.md §32 Phase 23): impossible without a written
 * reason, and EVERY action during it is tagged — each authenticated request
 * made with an impersonation token is appended to `actions`, and every audit
 * row written during it carries `impersonatedBy`.
 * Platform-level — NOT tenant-scoped.
 */
import { Schema, model, type Types } from 'mongoose';

export interface ImpersonationAction {
  at: Date;
  method: string;
  path: string;
}

export interface ImpersonationSessionDoc {
  _id: Types.ObjectId;
  adminUserId: Types.ObjectId;
  targetUserId: Types.ObjectId;
  reason: string;
  startedAt: Date;
  endedAt?: Date | null;
  actions: ImpersonationAction[];
}

const ImpersonationSessionSchema = new Schema<ImpersonationSessionDoc>(
  {
    adminUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, required: true, minlength: 10 }, // no reason → no session
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    actions: {
      type: [
        new Schema<ImpersonationAction>(
          { at: { type: Date, required: true }, method: String, path: String },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { versionKey: false },
);

export const ImpersonationSession = model<ImpersonationSessionDoc>(
  'ImpersonationSession',
  ImpersonationSessionSchema,
);
