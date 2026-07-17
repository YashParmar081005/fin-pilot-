import type { Types } from 'mongoose';
import { Session, type SessionDoc, type RevokedReason } from '../models/Session';

export const sessionRepo = {
  create(data: {
    userId: Types.ObjectId;
    familyId: string;
    tokenHash: string;
    userAgent?: string;
    ip?: string;
    expiresAt: Date;
  }): Promise<SessionDoc> {
    return Session.create(data).then((d) => d.toObject());
  },

  findByTokenHash(tokenHash: string): Promise<SessionDoc | null> {
    return Session.findOne({ tokenHash }).lean();
  },

  findById(id: string): Promise<SessionDoc | null> {
    return Session.findById(id).lean();
  },

  revoke(id: Types.ObjectId, reason: RevokedReason): Promise<unknown> {
    return Session.updateOne(
      { _id: id, revokedAt: null },
      { revokedAt: new Date(), revokedReason: reason },
    );
  },

  /** Reuse detected → burn every session descended from that login (§17.2). */
  async revokeFamily(familyId: string, reason: RevokedReason): Promise<number> {
    const result = await Session.updateMany(
      { familyId, revokedAt: null },
      { revokedAt: new Date(), revokedReason: reason },
    );
    return result.modifiedCount;
  },

  revokeAllForUser(userId: Types.ObjectId, reason: RevokedReason): Promise<unknown> {
    return Session.updateMany(
      { userId, revokedAt: null },
      { revokedAt: new Date(), revokedReason: reason },
    );
  },

  /** Active sessions for the session-listing UI: newest first, one row per family. */
  listActiveForUser(userId: Types.ObjectId): Promise<SessionDoc[]> {
    return Session.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .lean();
  },
};
