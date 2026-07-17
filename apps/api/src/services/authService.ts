/**
 * Auth service (plan.md §17). Owns every auth flow:
 * register → verify email, login (lockout + timing safety + TOTP),
 * refresh rotation with family reuse detection, logout, password reset,
 * TOTP 2FA with recovery codes, session listing/revoke.
 */
import { randomUUID } from 'node:crypto';
import type { Types } from 'mongoose';
import { authenticator } from 'otplib';
import argon2 from 'argon2';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';
import { userRepo } from '../repositories/userRepo';
import { sessionRepo } from '../repositories/sessionRepo';
import { verificationTokenRepo } from '../repositories/verificationTokenRepo';
import { AppError } from '../utils/AppError';
import { decryptSecret, encryptSecret, randomToken, sha256 } from '../utils/crypto';
import { mailTemplates, sendMail } from './mailService';
import { dummyVerify, hashPassword, verifyPassword } from './passwordService';
import { mintRefreshToken, signAccessToken } from './tokenService';
import type { UserDoc } from '../models/User';

// §32 Phase 2 "Done when": 6 failed logins locks the account for 15 min.
const LOCK_AFTER_FAILURES = 6;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const VERIFICATION_TTL_MS = 60 * 60 * 1000; // 1 hour (§17.3)
const RECOVERY_CODE_COUNT = 10;

/**
 * Every failed login responds in the SAME wall-clock time (§17.3: response
 * time must not leak account existence). The dummy verify + dummy write make
 * the paths structurally equal; this floor absorbs the residual micro-cost
 * differences deterministically.
 */
const MIN_FAILED_LOGIN_MS = 200;

async function padFailure(startedAt: bigint): Promise<void> {
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  const waitMs = MIN_FAILED_LOGIN_MS - elapsedMs;
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

export interface ClientInfo {
  userAgent?: string;
  ip?: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string; // raw — controller puts it in the httpOnly cookie
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  totpEnabled: boolean;
}

function toPublicUser(user: UserDoc): PublicUser {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    emailVerified: Boolean(user.emailVerifiedAt),
    totpEnabled: Boolean(user.totpEnabledAt),
  };
}

async function issueSession(user: UserDoc, client: ClientInfo): Promise<AuthResult> {
  const familyId = randomUUID();
  const refresh = mintRefreshToken();
  await sessionRepo.create({
    userId: user._id,
    familyId,
    tokenHash: refresh.hash,
    userAgent: client.userAgent,
    ip: client.ip,
    expiresAt: refresh.expiresAt,
  });
  return {
    accessToken: signAccessToken(String(user._id), familyId),
    refreshToken: refresh.raw,
    user: toPublicUser(user),
  };
}

async function createVerificationToken(
  userId: Types.ObjectId,
  purpose: 'email_verify' | 'password_reset',
): Promise<string> {
  const raw = randomToken();
  await verificationTokenRepo.create({
    userId,
    purpose,
    tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
  });
  return raw;
}

export const authService = {
  async register(input: { email: string; password: string; name: string; phone?: string }) {
    const existing = await userRepo.findByEmail(input.email);
    if (existing) throw new AppError('AUTH_EMAIL_ALREADY_REGISTERED', 409);

    const user = await userRepo.create({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      name: input.name,
      phone: input.phone,
    });

    const token = await createVerificationToken(user._id, 'email_verify');
    const templates = mailTemplates(getEnv().APP_URL);
    await sendMail({ to: user.email, ...templates.verifyEmail(token) });

    return toPublicUser(user);
  },

  async verifyEmail(rawToken: string): Promise<void> {
    const token = await verificationTokenRepo.consume(sha256(rawToken), 'email_verify');
    if (!token) throw new AppError('AUTH_TOKEN_INVALID', 401);
    await userRepo.markEmailVerified(token.userId);
  },

  async login(
    input: { email: string; password: string; totp?: string },
    client: ClientInfo,
  ): Promise<AuthResult> {
    const startedAt = process.hrtime.bigint();
    const user = await userRepo.findByEmailWithSecrets(input.email);

    if (!user) {
      // Timing safety (§17.3): burn the same argon2 AND the same DB write
      // as the real wrong-password path — response time must not leak
      // account existence.
      await dummyVerify(input.password);
      await userRepo.recordFailedLoginDummy(LOCK_AFTER_FAILURES, LOCK_DURATION_MS);
      await padFailure(startedAt);
      throw new AppError('AUTH_INVALID_CREDENTIALS', 401);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await padFailure(startedAt);
      throw new AppError('AUTH_ACCOUNT_LOCKED', 423, {
        retryAt: user.lockedUntil.toISOString(),
      });
    }

    const passwordOk = await verifyPassword(user.passwordHash!, input.password);
    if (!passwordOk) {
      await userRepo.recordFailedLogin(user._id, LOCK_AFTER_FAILURES, LOCK_DURATION_MS);
      await padFailure(startedAt);
      throw new AppError('AUTH_INVALID_CREDENTIALS', 401);
    }

    if (user.totpEnabledAt) {
      if (!input.totp) {
        await padFailure(startedAt);
        throw new AppError('AUTH_TOTP_REQUIRED', 401);
      }
      const ok = await this.verifySecondFactor(user, input.totp);
      if (!ok) {
        await userRepo.recordFailedLogin(user._id, LOCK_AFTER_FAILURES, LOCK_DURATION_MS);
        await padFailure(startedAt);
        throw new AppError('AUTH_TOTP_INVALID', 401);
      }
    }

    await userRepo.recordSuccessfulLogin(user._id);
    return issueSession(user, client);
  },

  /** TOTP code or single-use recovery code. */
  async verifySecondFactor(user: UserDoc, code: string): Promise<boolean> {
    if (/^\d{6}$/.test(code) && user.totpSecretEnc) {
      return authenticator.check(code, decryptSecret(user.totpSecretEnc));
    }
    for (const hash of user.recoveryCodeHashes ?? []) {
      if (await argon2.verify(hash, code).catch(() => false)) {
        await userRepo.consumeRecoveryCode(user._id, hash);
        return true;
      }
    }
    return false;
  },

  /** Refresh rotation with reuse detection — the exact flow of §17.2. */
  async refresh(rawRefreshToken: string, client: ClientInfo): Promise<AuthResult> {
    const session = await sessionRepo.findByTokenHash(sha256(rawRefreshToken));

    if (!session) throw new AppError('AUTH_TOKEN_INVALID', 401); // someone is fishing

    if (session.revokedAt) {
      // REUSE DETECTED → burn the entire family, alert the user, force re-login.
      const burned = await sessionRepo.revokeFamily(session.familyId, 'reuse_detected');
      logger.warn(
        { userId: String(session.userId), familyId: session.familyId, burned },
        'auth.refresh_reuse',
      );
      // Alert once per family burn — replays against an already-dead family
      // must not spam the user.
      if (burned > 0) {
        const user = await userRepo.findById(session.userId);
        if (user) {
          await sendMail({
            to: user.email,
            ...mailTemplates(getEnv().APP_URL).refreshReuseAlert(),
          });
        }
      }
      throw new AppError('AUTH_TOKEN_REUSE', 401);
    }

    if (session.expiresAt <= new Date()) throw new AppError('AUTH_TOKEN_EXPIRED', 401);

    const user = await userRepo.findById(session.userId);
    if (!user) throw new AppError('AUTH_TOKEN_INVALID', 401);

    // Rotate: revoke old, issue R' in the SAME family.
    await sessionRepo.revoke(session._id, 'rotation');
    const refresh = mintRefreshToken();
    await sessionRepo.create({
      userId: user._id,
      familyId: session.familyId,
      tokenHash: refresh.hash,
      userAgent: client.userAgent,
      ip: client.ip,
      expiresAt: refresh.expiresAt,
    });

    return {
      accessToken: signAccessToken(String(user._id), session.familyId),
      refreshToken: refresh.raw,
      user: toPublicUser(user),
    };
  },

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    const session = await sessionRepo.findByTokenHash(sha256(rawRefreshToken));
    if (session) await sessionRepo.revokeFamily(session.familyId, 'logout');
  },

  async forgotPassword(email: string): Promise<void> {
    // Never reveal whether the email exists (§17.3) — same response either way.
    const user = await userRepo.findByEmail(email);
    if (!user) return;
    const token = await createVerificationToken(user._id, 'password_reset');
    await sendMail({ to: user.email, ...mailTemplates(getEnv().APP_URL).resetPassword(token) });
  },

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const token = await verificationTokenRepo.consume(sha256(rawToken), 'password_reset');
    if (!token) throw new AppError('AUTH_TOKEN_INVALID', 401);

    await userRepo.setPasswordHash(token.userId, await hashPassword(newPassword));
    // Password change invalidates outstanding tokens and every session (§17.3).
    await verificationTokenRepo.invalidateAllForUser(token.userId);
    await sessionRepo.revokeAllForUser(token.userId, 'admin');
  },

  // ── 2FA ────────────────────────────────────────────────────────────────

  async totpSetup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await userRepo.findById(userId);
    if (!user) throw new AppError('AUTH_UNAUTHORIZED', 401);
    if (user.totpEnabledAt)
      throw new AppError('AUTH_FORBIDDEN', 403, { reason: '2FA already enabled' });

    const secret = authenticator.generateSecret();
    await userRepo.setTotpSecret(user._id, encryptSecret(secret));
    return {
      secret,
      otpauthUrl: authenticator.keyuri(user.email, 'FinPilot', secret),
    };
  },

  async totpVerify(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await userRepo.findByIdWithSecrets(userId);
    if (!user?.totpSecretEnc) throw new AppError('AUTH_TOTP_REQUIRED', 400);
    if (!authenticator.check(code, decryptSecret(user.totpSecretEnc))) {
      throw new AppError('AUTH_TOTP_INVALID', 401);
    }

    // 10 single-use recovery codes, argon2-hashed at rest (§17.3).
    // Sequential + tuned params: the library default memoryCost in a
    // Promise.all would spike ~650 MB of RAM.
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      randomToken().slice(0, 10).toUpperCase(),
    );
    const hashes: string[] = [];
    for (const code of codes) {
      hashes.push(
        await argon2.hash(code, {
          type: argon2.argon2id,
          memoryCost: getEnv().ARGON2_MEMORY_KIB,
          timeCost: 2,
          parallelism: 1,
        }),
      );
    }
    await userRepo.enableTotp(user._id, hashes);
    return { recoveryCodes: codes };
  },

  async totpDisable(userId: string, code: string): Promise<void> {
    const user = await userRepo.findByIdWithSecrets(userId);
    if (!user?.totpEnabledAt) return;
    if (!(await this.verifySecondFactor(user, code))) {
      throw new AppError('AUTH_TOTP_INVALID', 401);
    }
    await userRepo.disableTotp(user._id);
  },

  // ── Sessions ───────────────────────────────────────────────────────────

  async listSessions(userId: string, currentFamilyId: string | undefined) {
    const user = await userRepo.findById(userId);
    if (!user) throw new AppError('AUTH_UNAUTHORIZED', 401);
    const sessions = await sessionRepo.listActiveForUser(user._id);
    return sessions.map((s) => ({
      id: String(s._id),
      createdAt: s.createdAt,
      userAgent: s.userAgent ?? null,
      ip: s.ip ?? null,
      current: s.familyId === currentFamilyId,
    }));
  },

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await sessionRepo.findById(sessionId);
    if (!session || String(session.userId) !== userId) {
      throw new AppError('SYS_NOT_FOUND', 404);
    }
    await sessionRepo.revokeFamily(session.familyId, 'admin');
  },
};
