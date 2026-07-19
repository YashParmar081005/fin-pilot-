/**
 * Invoice routes (§18.5). Named action endpoints, never PUT. Money-moving
 * mutations (create/issue/cancel) require an Idempotency-Key (I7).
 */
import { Router } from 'express';
import { cancelInvoiceSchema, createInvoiceSchema, updateInvoiceSchema } from '@finpilot/shared';
import { invoiceController as ctrl } from '../../controllers/invoiceController';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { idempotency } from '../../middleware/idempotency';
import { userRateLimit } from '../../middleware/rateLimit';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';

export const invoiceRoutes = Router();

invoiceRoutes.use(authenticate, tenantResolve('header'));

// §19.3 route costs: GET 1, POST 2 — fails OPEN when Redis is down (§19.6)
invoiceRoutes.get('/', userRateLimit(1), authorize('report:read'), asyncHandler(ctrl.list));
invoiceRoutes.post(
  '/',
  userRateLimit(2),
  authorize('invoice:create'),
  idempotency,
  validate(createInvoiceSchema),
  asyncHandler(ctrl.create),
);
invoiceRoutes.get('/:id', authorize('report:read'), asyncHandler(ctrl.get));
invoiceRoutes.patch(
  '/:id',
  authorize('invoice:create'),
  validate(updateInvoiceSchema),
  asyncHandler(ctrl.update),
);
invoiceRoutes.post(
  '/:id/issue',
  authorize('invoice:create'),
  idempotency,
  asyncHandler(ctrl.issue),
);
invoiceRoutes.post(
  '/:id/cancel',
  authorize('invoice:create'),
  idempotency,
  validate(cancelInvoiceSchema),
  asyncHandler(ctrl.cancel),
);
invoiceRoutes.post('/:id/send', authorize('invoice:create'), asyncHandler(ctrl.send));
