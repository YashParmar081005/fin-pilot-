/**
 * The response envelope (plan.md §18.2). ONE shape, always:
 *   success:   { data, meta: { requestId, ... } }
 *   error:     { error: { code, message, details?, requestId } }
 */
import type { Response } from 'express';
import { ERROR_MESSAGES, type ErrorCode } from '@finpilot/shared';

export interface Meta {
  nextCursor?: string;
  hasMore?: boolean;
  [key: string]: unknown;
}

export function ok(res: Response, data: unknown, status = 200, meta: Meta = {}): Response {
  return res.status(status).json({ data, meta: { requestId: res.req.id, ...meta } });
}

export function errorBody(code: string, details: unknown, requestId: string | undefined) {
  return {
    error: {
      code,
      message: ERROR_MESSAGES[code as ErrorCode] ?? code,
      ...(details === undefined ? {} : { details }),
      requestId,
    },
  };
}
