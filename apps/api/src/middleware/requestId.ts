/**
 * Middleware #1 (plan.md §5.3): uuid v7 request id, propagated as
 * X-Request-Id and stamped into every log line and every envelope.
 */
import type { NextFunction, Request, Response } from 'express';
import { v7 as uuidv7 } from 'uuid';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.id = uuidv7();
  res.setHeader('X-Request-Id', req.id);
  next();
}
