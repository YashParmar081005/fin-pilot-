import type { Types } from 'mongoose';
import {
  VerificationToken,
  type TokenPurpose,
  type VerificationTokenDoc,
} from '../models/VerificationToken';

export const verificationTokenRepo = {
  create(data: {
    userId: Types.ObjectId;
    purpose: TokenPurpose;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<VerificationTokenDoc> {
    return VerificationToken.create(data).then((d) => d.toObject());
  },

  /**
   * Atomically consumes an unused, unexpired token. Returns null when the
   * token is unknown, expired, or already used — single-use by construction.
   */
  consume(tokenHash: string, purpose: TokenPurpose): Promise<VerificationTokenDoc | null> {
    return VerificationToken.findOneAndUpdate(
      { tokenHash, purpose, usedAt: null, expiresAt: { $gt: new Date() } },
      { usedAt: new Date() },
      { new: true },
    ).lean();
  },

  /** Invalidated on password change (§17.3). */
  invalidateAllForUser(userId: Types.ObjectId): Promise<unknown> {
    return VerificationToken.updateMany({ userId, usedAt: null }, { usedAt: new Date() });
  },
};
