import { Types } from 'mongoose';
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

  /**
   * One round trip, always — an aggregation-pipeline update increments the
   * counter and sets lockedUntil in the same operation. Constant cost matters:
   * the login timing-parity guarantee (§17.3) depends on this path costing
   * the same as recordFailedLoginDummy below.
   */
  recordFailedLogin(id: Types.ObjectId, lockAt: number, lockMs: number): Promise<unknown> {
    return User.updateOne({ _id: id }, [
      {
        $set: {
          failedLoginCount: { $add: ['$failedLoginCount', 1] },
          lockedUntil: {
            $cond: [
              { $gte: [{ $add: ['$failedLoginCount', 1] }, lockAt] },
              new Date(Date.now() + lockMs),
              '$lockedUntil',
            ],
          },
        },
      },
    ]);
  },

  /** Timing pad for the unknown-email path — same query shape, matches nothing. */
  recordFailedLoginDummy(lockAt: number, lockMs: number): Promise<unknown> {
    return this.recordFailedLogin(new Types.ObjectId(), lockAt, lockMs);
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
