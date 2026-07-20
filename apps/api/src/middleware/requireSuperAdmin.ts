/**
 * Platform-operator gate (§2.1 "Manage platform tenants"). superAdmin is a
 * User flag no API can grant — seed/ops only. An impersonation token NEVER
 * passes: the admin console is off-limits while acting as someone else.
 */
import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.impersonation) {
    throw new AppError('AUTH_FORBIDDEN', 403, { reason: 'not available while impersonating' });
  }
  User.findById(req.user!.id)
    .select('+superAdmin')
    .lean()
    .then((user) => {
      if (!user?.superAdmin) return next(new AppError('AUTH_FORBIDDEN', 403));
      next();
    })
    .catch(next);
}
