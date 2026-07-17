import { Router } from 'express';
import { createJournalEntrySchema, reverseJournalEntrySchema } from '@finpilot/shared';
import { journalController as ctrl } from '../../controllers/journalController';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';

export const journalRoutes = Router();

journalRoutes.use(authenticate, tenantResolve('header'));

journalRoutes.get('/', authorize('report:read'), asyncHandler(ctrl.list));
journalRoutes.post(
  '/',
  authorize('journal:post'),
  validate(createJournalEntrySchema),
  asyncHandler(ctrl.create),
);
journalRoutes.get('/:id', authorize('report:read'), asyncHandler(ctrl.get));
journalRoutes.post(
  '/:id/reverse',
  authorize('journal:reverse'),
  validate(reverseJournalEntrySchema),
  asyncHandler(ctrl.reverse),
);
