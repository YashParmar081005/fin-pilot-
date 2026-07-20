/**
 * One place, one shape (plan.md §18.4). Everything the app can throw lands
 * here and leaves as the error envelope. Full stacks go to the log only —
 * never to the client. Unhandled errors go to Sentry tagged with the
 * requestId (§25 — a no-op unless SENTRY_DSN initialised it at boot).
 */
import * as Sentry from '@sentry/node';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { httpErrorsTotal, rateLimitRejections, routeLabel } from '../observability/metrics';
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
  // body-parser rejects malformed JSON with an exposable 400 SyntaxError —
  // a client mistake, not a server error.
  if (
    err instanceof SyntaxError &&
    'statusCode' in err &&
    (err as { statusCode?: number }).statusCode === 400
  ) {
    return res
      .status(400)
      .json(errorBody('SYS_VALIDATION_FAILED', { body: 'malformed JSON' }, requestId));
  }
  if (err instanceof AppError) {
    httpErrorsTotal.inc({ route: routeLabel(req), code: err.code });
    if (err.code === 'SYS_RATE_LIMIT_EXCEEDED') {
      const scope = (err.details as { scope?: string } | undefined)?.scope ?? 'unknown';
      rateLimitRejections.inc({ scope });
    }
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
  httpErrorsTotal.inc({ route: routeLabel(req), code: 'SYS_INTERNAL_ERROR' });
  Sentry.captureException(err, { tags: { requestId } });
  logger.error({ err, requestId }, 'unhandled error');
  return res.status(500).json(errorBody('SYS_INTERNAL_ERROR', undefined, requestId));
}
