/**
 * Rate limiting middleware (plan.md §19).
 * L1 global per-IP sliding window · L2/L3 per-user token bucket with route
 * cost weighting · auth limiter that FAILS CLOSED (§19.6).
 * RateLimit-* headers on every limited response; Retry-After on 429.
 */
import type { NextFunction, Request, Response } from 'express';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';
import { requestContext } from '../plugins/tenantScope';
import { companyRepo } from '../repositories/companyRepo';
import { organizationRepo } from '../repositories/organizationRepo';
import { AppError } from '../utils/AppError';
import { MemoryStore, getRateLimitStore } from '../ratelimit/store';

// §19.4 tiers — org plan → bucket. Live on Organization; changing a
// customer's limit must not require a deploy.
const TIERS: Record<string, { capacity: number; refillPerSec: number }> = {
  free: { capacity: 60, refillPerSec: 1 },
  starter: { capacity: 300, refillPerSec: 5 },
  professional: { capacity: 1_200, refillPerSec: 20 },
  enterprise: { capacity: 6_000, refillPerSec: 100 },
};

const L1_WINDOW_MS = 60_000;
const AUTH_WINDOW_MS = 60_000;

// conservative per-pod fallback when Redis fails open (§19.6)
const fallback = new MemoryStore();

function setHeaders(res: Response, limit: number, remaining: number, resetSec: number): void {
  res.setHeader('RateLimit-Limit', limit);
  res.setHeader('RateLimit-Remaining', Math.max(0, remaining));
  res.setHeader('RateLimit-Reset', Math.max(0, resetSec));
}

function tooMany(res: Response, retryAfterSec: number, limit: number, scope: string): never {
  res.setHeader('Retry-After', retryAfterSec);
  throw new AppError('SYS_RATE_LIMIT_EXCEEDED', 429, {
    retryAfterSeconds: retryAfterSec,
    limit,
    scope,
  });
}

/** L1 — global per-IP sliding window. Fails OPEN with a per-pod fallback. */
export function globalRateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = `rl:ip:${req.ip}`;
  const limit = getEnv().RL_L1_LIMIT;
  getRateLimitStore()
    .slidingWindow(key, L1_WINDOW_MS, limit)
    .catch(async (err) => {
      logger.error({ err: String(err) }, 'L1 limiter: redis down — failing OPEN (P1)');
      return fallback.slidingWindow(key, L1_WINDOW_MS, limit);
    })
    .then((result) => {
      setHeaders(res, limit, result.remaining, result.retryAfterSec);
      if (!result.allowed) return tooMany(res, result.retryAfterSec, limit, 'ip');
      next();
    })
    .catch(next);
}

/**
 * Auth limiter — login / password reset / 2FA. FAILS CLOSED (§19.6):
 * unlimited credential stuffing is worse than an outage.
 */
export function authRateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = `rl:auth:${req.ip}`;
  const limit = getEnv().RL_AUTH_LIMIT;
  getRateLimitStore()
    .slidingWindow(key, AUTH_WINDOW_MS, limit)
    .then((result) => {
      setHeaders(res, limit, result.remaining, result.retryAfterSec);
      if (!result.allowed) return tooMany(res, result.retryAfterSec, limit, 'auth');
      next();
    })
    .catch((err) => {
      if (err instanceof AppError) return next(err);
      logger.error({ err: String(err) }, 'auth limiter: redis down — failing CLOSED');
      next(new AppError('SYS_SERVICE_UNAVAILABLE', 503, { reason: 'rate limiter unavailable' }));
    });
}

const tierCache = new Map<string, { tier: (typeof TIERS)[string]; expiresAt: number }>();

async function tierFor(companyId: string): Promise<(typeof TIERS)[string]> {
  const cached = tierCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.tier;
  const company = await companyRepo.findById(companyId);
  const org = company ? await organizationRepo.findById(company.organizationId) : null;
  const tier = TIERS[org?.plan ?? 'free'] ?? TIERS.free!;
  tierCache.set(companyId, { tier, expiresAt: Date.now() + 60_000 });
  return tier;
}

/**
 * L2/L3 — per-user token bucket with route cost (§19.3). Bursty-but-bounded:
 * a paste of 30 invoices bursts to the bucket size, then throttles to the
 * refill rate. Fails OPEN with the per-pod fallback.
 */
export function userRateLimit(cost = 1) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = requestContext.getStore();
    if (!ctx?.userId || !ctx.companyId) return next(); // unauthenticated routes: L1 owns it
    const key = `rl:user:${ctx.userId}:${ctx.companyId}`;

    tierFor(String(ctx.companyId))
      .then(async (tier) => {
        try {
          return {
            tier,
            result: await getRateLimitStore().tokenBucket(
              key,
              tier.capacity,
              tier.refillPerSec,
              cost,
            ),
          };
        } catch (err) {
          logger.error({ err: String(err) }, 'L2/L3 limiter: redis down — failing OPEN (P1)');
          return {
            tier,
            result: await fallback.tokenBucket(key, tier.capacity, tier.refillPerSec, cost),
          };
        }
      })
      .then(({ tier, result }) => {
        setHeaders(res, tier.capacity, result.allowed ? tier.capacity : 0, result.retryAfterSec);
        if (!result.allowed) return tooMany(res, result.retryAfterSec, tier.capacity, 'user');
        next();
      })
      .catch(next);
  };
}
