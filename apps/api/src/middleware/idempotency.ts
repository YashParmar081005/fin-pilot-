/**
 * Idempotency middleware (I7, §18.6) for money-moving mutations.
 * insertOne is the lock; do NOT findOne-then-insert — that race pays a
 * supplier twice. A failed handler releases the key so the client may retry.
 */
import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { IdempotencyKey } from '../models/IdempotencyKey';
import { requireCompanyContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function idempotency(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 8 || key.length > 128) {
    throw new AppError('SYS_IDEMPOTENCY_KEY_REQUIRED', 400);
  }
  const ctx = requireCompanyContext();
  const _id = `${ctx.companyId}:${key}`;
  const requestHash = createHash('sha256')
    .update(`${req.method}${req.originalUrl.split('?')[0]}${canonicalJson(req.body ?? {})}`)
    .digest('hex');

  IdempotencyKey.create({ _id, requestHash, status: 'in_flight' })
    .then(() => {
      // we hold the lock — capture the response and store it on completion
      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        const status = res.statusCode;
        void (async () => {
          if (status >= 200 && status < 400) {
            await IdempotencyKey.updateOne(
              { _id },
              { status: 'completed', responseStatus: status, responseBody: body },
            ).catch(() => undefined);
          } else {
            // failed handler → release the key so a legitimate retry works
            await IdempotencyKey.deleteOne({ _id }).catch(() => undefined);
          }
        })();
        return originalJson(body);
      };
      next();
    })
    .catch(async (err: { code?: number }) => {
      if (err?.code !== 11000) return next(err);
      const existing = await IdempotencyKey.findById(_id).lean();
      if (!existing) return next(new AppError('SYS_REQUEST_IN_PROGRESS', 409));
      if (existing.requestHash !== requestHash) {
        return next(new AppError('SYS_IDEMPOTENCY_KEY_REUSE', 422));
      }
      if (existing.status === 'in_flight') {
        return next(new AppError('SYS_REQUEST_IN_PROGRESS', 409));
      }
      // completed → replay the stored response
      res.setHeader('Idempotency-Replayed', 'true');
      res.status(existing.responseStatus ?? 200).json(existing.responseBody);
    })
    .catch(next);
}
