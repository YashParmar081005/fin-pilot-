import { Router } from 'express';
import {
  acceptInviteSchema,
  createCompanySchema,
  inviteMemberSchema,
  updateCompanySchema,
  updateMemberSchema,
} from '@finpilot/shared';
import { companyController as ctrl } from '../../controllers/companyController';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';

export const companyRoutes = Router();

companyRoutes.use(authenticate);

companyRoutes.get('/', asyncHandler(ctrl.list)); // the company switcher
companyRoutes.post('/', validate(createCompanySchema), asyncHandler(ctrl.create));
companyRoutes.get('/:id', asyncHandler(ctrl.get)); // membership checked in service

// From here on the :id param IS the tenant — context + RBAC per route (§17.4).
companyRoutes.patch(
  '/:id',
  tenantResolve('param'),
  authorize('company:update'),
  validate(updateCompanySchema),
  asyncHandler(ctrl.update),
);
companyRoutes.get(
  '/:id/members',
  tenantResolve('param'),
  authorize('user:invite'),
  asyncHandler(ctrl.listMembers),
);
companyRoutes.post(
  '/:id/members',
  tenantResolve('param'),
  authorize('user:invite'),
  validate(inviteMemberSchema),
  asyncHandler(ctrl.inviteMember),
);
companyRoutes.patch(
  '/:id/members/:userId',
  tenantResolve('param'),
  authorize('role:assign'),
  validate(updateMemberSchema),
  asyncHandler(ctrl.updateMember),
);

export const inviteRoutes = Router();
inviteRoutes.post(
  '/accept',
  authenticate,
  validate(acceptInviteSchema),
  asyncHandler(ctrl.acceptInvite),
);
