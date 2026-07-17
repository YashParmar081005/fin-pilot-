/**
 * Per-route RBAC (plan.md §17.4). The permission is declared AT THE ROUTE,
 * visible in one grep. Never `if (user.role === 'admin')` anywhere — roles
 * are data; permissions are the interface.
 */
import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '@finpilot/shared';
import { requestContext } from '../plugins/tenantScope';
import { permissionCache } from '../services/permissionCache';
import { AppError } from '../utils/AppError';

export function authorize(permission: Permission) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    const ctx = requestContext.getStore();
    if (!ctx?.userId || !ctx.companyId) {
      throw new AppError('TENANT_CONTEXT_MISSING', 500);
    }
    permissionCache
      .get(String(ctx.userId), String(ctx.companyId))
      .then((perms) => {
        if (!perms.includes(permission)) {
          return next(new AppError('AUTH_FORBIDDEN', 403, { required: permission }));
        }
        next();
      })
      .catch(next);
  };
}
