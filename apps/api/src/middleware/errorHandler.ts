/**
 * One place, one shape (plan.md §18.4). Everything the app can throw lands
 * here and leaves as the error envelope. Full stacks go to the log only —
 * never to the client. Sentry wiring arrives in Phase 24.
 */
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';
import { errorBody } from '../utils/respond';

interface MongoLikeError extends Error {
  code?: number;
  keyPattern?: Record<string, unknown>;
  hasErrorLabel?: (label: string) => boolean;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): Response {
  const requestId = req.id;

  if (err instanceof ZodError) {
    return res.status(422).json(errorBody('SYS_VALIDATION_FAILED', err.flatten(), requestId));
  }
  if (err instanceof AppError) {
    return res.status(err.status).json(errorBody(err.code, err.details, requestId));
  }

  const e = err as MongoLikeError;
  if (e?.code === 11000) {
    return res
      .status(409)
      .json(errorBody('SYS_DUPLICATE_KEY', { keyPattern: e.keyPattern }, requestId));
  }
  if (e?.name === 'VersionError') {
    return res.status(409).json(errorBody('SYS_CONCURRENT_MODIFICATION', undefined, requestId));
  }
  if (e?.name === 'MongoServerError' && e.hasErrorLabel?.('TransientTransactionError')) {
    return res.status(503).json(errorBody('SYS_RETRY_TRANSACTION', undefined, requestId));
  }

  // Unhandled: full stack server-side only, opaque envelope to the client.
  logger.error({ err, requestId }, 'unhandled error');
  return res.status(500).json(errorBody('SYS_INTERNAL_ERROR', undefined, requestId));
}
