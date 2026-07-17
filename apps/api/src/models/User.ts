/**
 * User model (plan.md §9). Global identity — NOT tenant-scoped; membership
 * ties users to companies in Phase 3. Sensitive fields are `select: false`
 * and must be asked for explicitly.
 */
import { Schema, model } from 'mongoose';

export interface UserDoc {
  _id: import('mongoose').Types.ObjectId;
  email: string;
  passwordHash?: string;
  name: string;
  phone?: string;
  emailVerifiedAt?: Date | null;
  totpSecretEnc?: string | null;
  totpEnabledAt?: Date | null;
  recoveryCodeHashes?: string[];
  failedLoginCount: number;
  lockedUntil?: Date | null;
  lastLoginAt?: Date | null;
  locale: 'en-IN' | 'hi-IN' | 'gu-IN';
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false }, // argon2id
    name: { type: String, required: true },
    phone: { type: String, match: /^\+91\d{10}$/ },
    emailVerifiedAt: { type: Date, default: null },
    // 2FA — AES-256-GCM encrypted (envelope-encrypted with KMS in prod)
    totpSecretEnc: { type: String, select: false, default: null },
    totpEnabledAt: { type: Date, default: null },
    recoveryCodeHashes: { type: [String], select: false, default: [] },
    // lockout (§17.3)
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    locale: { type: String, enum: ['en-IN', 'hi-IN', 'gu-IN'], default: 'en-IN' },
  },
  { timestamps: true },
);

export const User = model<UserDoc>('User', UserSchema);
