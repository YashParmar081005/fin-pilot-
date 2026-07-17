/**
 * Single-use tokens for email verification and password reset (plan.md §17.3):
 * 32 random bytes, sha256 at rest, 1-hour TTL, invalidated on use and on
 * password change.
 */
import { Schema, model, type Types } from 'mongoose';

export type TokenPurpose = 'email_verify' | 'password_reset';

export interface VerificationTokenDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  purpose: TokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const VerificationTokenSchema = new Schema<VerificationTokenDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    purpose: { type: String, enum: ['email_verify', 'password_reset'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

VerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VerificationToken = model<VerificationTokenDoc>(
  'VerificationToken',
  VerificationTokenSchema,
);
