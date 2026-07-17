/**
 * Middleware #7 (plan.md §5.3): verifies the Bearer access JWT → req.user.
 * No companyId here — tenantResolve (Phase 3) handles company context.
 */
import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../services/tokenService';
import { AppError } from '../utils/AppError';

export interface AuthUser {
  id: string;
  familyId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError('AUTH_UNAUTHORIZED', 401);
  const claims = verifyAccessToken(header.slice('Bearer '.length));
  req.user = { id: claims.sub, familyId: claims.fam };
  next();
}
