/**
 * Access + refresh tokens (plan.md §17.1).
 * Access: 15-min JWT {sub, fam, jti} — deliberately NO companyId and NO
 * permission list; company is chosen per request and permissions live in a
 * short-TTL cache (Phase 3).
 * Refresh: opaque random 256-bit, sha256-hashed at rest, httpOnly cookie.
 */
import jwt from 'jsonwebtoken';
import { v7 as uuidv7 } from 'uuid';
import { getEnv } from '../config/env';
import { AppError } from '../utils/AppError';
import { parseDuration, randomToken, sha256 } from '../utils/crypto';

export interface AccessClaims {
  sub: string; // userId
  fam: string; // session familyId — lets logout/current-session work statelessly
  jti: string;
  iat: number;
  exp: number;
}

export function signAccessToken(userId: string, familyId: string): string {
  const env = getEnv();
  return jwt.sign({ sub: userId, fam: familyId, jti: uuidv7() }, env.JWT_ACCESS_SECRET, {
    expiresIn: Math.floor(parseDuration(env.JWT_ACCESS_TTL) / 1000),
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    return jwt.verify(token, getEnv().JWT_ACCESS_SECRET) as AccessClaims;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new AppError('AUTH_TOKEN_EXPIRED', 401);
    throw new AppError('AUTH_TOKEN_INVALID', 401);
  }
}

export interface RefreshToken {
  raw: string; // goes into the cookie, never stored
  hash: string; // sha256, stored on the Session
  expiresAt: Date;
}

export function mintRefreshToken(): RefreshToken {
  const raw = randomToken();
  return {
    raw,
    hash: sha256(raw),
    expiresAt: new Date(Date.now() + parseDuration(getEnv().JWT_REFRESH_TTL)),
  };
}

export const REFRESH_COOKIE = 'fp_rt';

export function refreshCookieOptions() {
  const env = getEnv();
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/v1/auth', // the cookie never travels on non-auth routes (§17.1)
    maxAge: parseDuration(env.JWT_REFRESH_TTL),
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}
