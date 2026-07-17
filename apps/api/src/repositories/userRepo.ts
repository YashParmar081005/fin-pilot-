import type { Types } from 'mongoose';
import { User, type UserDoc } from '../models/User';

export const userRepo = {
  create(data: {
    email: string;
    passwordHash: string;
    name: string;
    phone?: string;
  }): Promise<UserDoc> {
    return User.create(data).then((d) => d.toObject());
  },

  findByEmail(email: string): Promise<UserDoc | null> {
    return User.findOne({ email }).lean();
  },

  /** Includes passwordHash — login path only. */
  findByEmailWithSecrets(email: string): Promise<UserDoc | null> {
    return User.findOne({ email })
      .select('+passwordHash +totpSecretEnc +recoveryCodeHashes')
      .lean();
  },

  findById(id: Types.ObjectId | string): Promise<UserDoc | null> {
    return User.findById(id).lean();
  },

  findByIdWithSecrets(id: Types.ObjectId | string): Promise<UserDoc | null> {
    return User.findById(id).select('+passwordHash +totpSecretEnc +recoveryCodeHashes').lean();
  },

  async recordFailedLogin(id: Types.ObjectId, lockAt: number, lockMs: number): Promise<void> {
    const user = await User.findByIdAndUpdate(
      id,
      { $inc: { failedLoginCount: 1 } },
      { new: true },
    ).lean();
    if (user && user.failedLoginCount >= lockAt) {
      await User.updateOne({ _id: id }, { lockedUntil: new Date(Date.now() + lockMs) });
    }
  },

  recordSuccessfulLogin(id: Types.ObjectId): Promise<unknown> {
    return User.updateOne(
      { _id: id },
      { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    );
  },

  markEmailVerified(id: Types.ObjectId): Promise<unknown> {
    return User.updateOne({ _id: id }, { emailVerifiedAt: new Date() });
  },

  setPasswordHash(id: Types.ObjectId, passwordHash: string): Promise<unknown> {
    return User.updateOne({ _id: id }, { passwordHash, failedLoginCount: 0, lockedUntil: null });
  },

  setTotpSecret(id: Types.ObjectId, totpSecretEnc: string): Promise<unknown> {
    return User.updateOne({ _id: id }, { totpSecretEnc, totpEnabledAt: null });
  },

  enableTotp(id: Types.ObjectId, recoveryCodeHashes: string[]): Promise<unknown> {
    return User.updateOne({ _id: id }, { totpEnabledAt: new Date(), recoveryCodeHashes });
  },

  disableTotp(id: Types.ObjectId): Promise<unknown> {
    return User.updateOne(
      { _id: id },
      { totpSecretEnc: null, totpEnabledAt: null, recoveryCodeHashes: [] },
    );
  },

  consumeRecoveryCode(id: Types.ObjectId, hash: string): Promise<unknown> {
    return User.updateOne({ _id: id }, { $pull: { recoveryCodeHashes: hash } });
  },
};
