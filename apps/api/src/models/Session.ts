/**
 * Session — a refresh-token family (plan.md §9, §17.2).
 * Rotation stays within a familyId; reuse of a revoked token burns the family.
 */
import { Schema, model, type Types } from 'mongoose';

export type RevokedReason = 'logout' | 'rotation' | 'reuse_detected' | 'admin' | 'expired';

export interface SessionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  familyId: string;
  tokenHash: string;
  userAgent?: string;
  ip?: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  revokedReason?: RevokedReason | null;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<SessionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    familyId: { type: String, required: true, index: true }, // uuid; rotation stays in the family
    tokenHash: { type: String, required: true }, // sha256 of the current refresh token
    userAgent: String,
    ip: String,
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: {
      type: String,
      enum: ['logout', 'rotation', 'reuse_detected', 'admin', 'expired', null],
      default: null,
    },
  },
  { timestamps: true },
);

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ tokenHash: 1 }, { unique: true });

export const Session = model<SessionDoc>('Session', SessionSchema);
