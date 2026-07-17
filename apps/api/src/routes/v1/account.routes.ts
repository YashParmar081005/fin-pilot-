/**
 * Chart of accounts routes (§18.5). First book-data routes: the tenant comes
 * from the X-Company-Id header (tenantResolve('header')), and the I8 plugin
 * scopes every query behind them.
 */
import { Router } from 'express';
import { createAccountSchema, updateAccountSchema } from '@finpilot/shared';
import { accountController as ctrl } from '../../controllers/accountController';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';

export const accountRoutes = Router();

accountRoutes.use(authenticate, tenantResolve('header'));

accountRoutes.get('/', authorize('report:read'), asyncHandler(ctrl.list));
accountRoutes.post(
  '/',
  authorize('journal:post'),
  validate(createAccountSchema),
  asyncHandler(ctrl.create),
);
accountRoutes.post(
  '/import-template',
  authorize('journal:post'),
  asyncHandler(ctrl.importTemplate),
);
accountRoutes.patch(
  '/:id',
  authorize('journal:post'),
  validate(updateAccountSchema),
  asyncHandler(ctrl.update),
);
accountRoutes.delete('/:id', authorize('journal:post'), asyncHandler(ctrl.remove));
