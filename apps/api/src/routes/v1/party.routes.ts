import { Router } from 'express';
import {
  createItemSchema,
  createPartySchema,
  importItemsSchema,
  importPartiesSchema,
  updateItemSchema,
  updatePartySchema,
} from '@finpilot/shared';
import { itemController } from '../../controllers/itemController';
import { partyController } from '../../controllers/partyController';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';

export const partyRoutes = Router();
partyRoutes.use(authenticate, tenantResolve('header'));
partyRoutes.get('/', authorize('report:read'), asyncHandler(partyController.list));
partyRoutes.post(
  '/',
  authorize('invoice:create'),
  validate(createPartySchema),
  asyncHandler(partyController.create),
);
partyRoutes.post(
  '/import',
  authorize('invoice:create'),
  validate(importPartiesSchema),
  asyncHandler(partyController.import),
);
partyRoutes.get('/:id', authorize('report:read'), asyncHandler(partyController.get));
partyRoutes.patch(
  '/:id',
  authorize('invoice:create'),
  validate(updatePartySchema),
  asyncHandler(partyController.update),
);
partyRoutes.delete('/:id', authorize('invoice:create'), asyncHandler(partyController.remove));

export const itemRoutes = Router();
itemRoutes.use(authenticate, tenantResolve('header'));
itemRoutes.get('/', authorize('report:read'), asyncHandler(itemController.list));
itemRoutes.post(
  '/',
  authorize('invoice:create'),
  validate(createItemSchema),
  asyncHandler(itemController.create),
);
itemRoutes.post(
  '/import',
  authorize('invoice:create'),
  validate(importItemsSchema),
  asyncHandler(itemController.import),
);
itemRoutes.get('/:id', authorize('report:read'), asyncHandler(itemController.get));
itemRoutes.patch(
  '/:id',
  authorize('invoice:create'),
  validate(updateItemSchema),
  asyncHandler(itemController.update),
);
itemRoutes.delete('/:id', authorize('invoice:create'), asyncHandler(itemController.remove));
