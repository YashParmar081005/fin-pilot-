/**
 * Middleware #7 (plan.md §5.3): verifies the Bearer access JWT → req.user.
 * No companyId here — tenantResolve (Phase 3) handles company context.
 *
 * Impersonation tokens (§32 Phase 23) take the slow path: the session must
 * still be open, EVERY request is appended to its action log, and every
 * response carries X-Impersonation-Session / X-Impersonated-By so the client
 * can render the loud banner.
 */
import type { NextFunction, Request, Response } from 'express';
import { ImpersonationSession } from '../models/ImpersonationSession';
import { verifyAccessToken } from '../services/tokenService';
import { AppError } from '../utils/AppError';

export interface AuthUser {
  id: string;
  familyId: string;
  impersonation?: { by: string; sessionId: string };
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError('AUTH_UNAUTHORIZED', 401);
  const claims = verifyAccessToken(header.slice('Bearer '.length));

  if (!claims.imp) {
    req.user = { id: claims.sub, familyId: claims.fam };
    next();
    return;
  }

  const { by, sid } = claims.imp;
  ImpersonationSession.findOneAndUpdate(
    { _id: sid, endedAt: null }, // an ended session's token is dead immediately
    // originalUrl, not req.path — inside a mounted router req.path is relative
    {
      $push: {
        actions: { at: new Date(), method: req.method, path: req.originalUrl.split('?')[0] },
      },
    },
  )
    .lean()
    .then((session) => {
      if (!session) return next(new AppError('AUTH_TOKEN_INVALID', 401));
      req.user = { id: claims.sub, familyId: claims.fam, impersonation: { by, sessionId: sid } };
      res.setHeader('X-Impersonation-Session', sid);
      res.setHeader('X-Impersonated-By', by);
      next();
    })
    .catch(next);
}
