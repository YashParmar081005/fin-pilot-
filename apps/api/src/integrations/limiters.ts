/**
 * L5 — outbound limiting (§19.7). The classic mistake is skipping this:
 * you rate-limit your users and then get banned by the IRP for hammering it
 * during a retry storm. Every outbound client goes through a Bottleneck
 * limiter AND an opossum circuit breaker (5 failures/10 s → open 30 s →
 * half-open probe).
 *
 * Note for scale-out: Bottleneck.RedisConnection clusters the reservoir
 * across worker pods — wire it when workers multiply (Phase 11+).
 */
import Bottleneck from 'bottleneck';
import CircuitBreaker from 'opossum';
import { logger } from '../config/logger';

export const irpLimiter = new Bottleneck({
  reservoir: 100,
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60_000,
  maxConcurrent: 5,
  minTime: 100,
});

export const groqLimiter = new Bottleneck({ maxConcurrent: 8, minTime: 50 });

export const razorpayLimiter = new Bottleneck({ maxConcurrent: 10, minTime: 50 });

export const mailLimiter = new Bottleneck({ maxConcurrent: 4, minTime: 25 });

const BREAKER_DEFAULTS: CircuitBreaker.Options = {
  timeout: 15_000,
  errorThresholdPercentage: 50,
  rollingCountTimeout: 10_000,
  resetTimeout: 30_000,
  volumeThreshold: 5, // 5 failures in 10 s → open
};

/**
 * Wraps an outbound call in limiter + breaker. A dead upstream degrades to a
 * fast failure the caller can turn into "pending, we'll retry" — never a
 * queue full of jobs burning retries.
 */
export function guardOutbound<Args extends unknown[], R>(
  name: string,
  limiter: Bottleneck,
  fn: (...args: Args) => Promise<R>,
  options: Partial<CircuitBreaker.Options> = {},
): (...args: Args) => Promise<R> {
  const breaker = new CircuitBreaker((...args: Args) => fn(...args), {
    ...BREAKER_DEFAULTS,
    ...options,
    name,
  });
  breaker.on('open', () => logger.error({ breaker: name }, 'circuit OPEN — upstream failing'));
  breaker.on('halfOpen', () => logger.warn({ breaker: name }, 'circuit half-open — probing'));
  breaker.on('close', () => logger.info({ breaker: name }, 'circuit closed'));
  return (...args: Args) => limiter.schedule(() => breaker.fire(...args) as Promise<R>);
}
