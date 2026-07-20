/**
 * Super-admin console (plan.md §32 Phase 23). Platform-level: authenticate +
 * requireSuperAdmin, NO tenantResolve — these routes operate ABOVE the tenant
 * boundary. Impersonation start REQUIRES a written reason (min 10 chars) —
 * the Zod schema makes a reasonless session impossible, not just forbidden.
 */
import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { PLANS } from '@finpilot/shared';
import { authenticate } from '../../middleware/authenticate';
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin';
import { validate } from '../../middleware/validate';
import { adminService } from '../../services/admin/adminService';
import { subscriptionService } from '../../services/admin/subscriptionService';
import { dlqService } from '../../services/dlqService';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';

export const adminRoutes = Router();
adminRoutes.use(authenticate, requireSuperAdmin);

adminRoutes.get(
  '/organizations',
  asyncHandler(async (req: Request, res: Response) => {
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    ok(res, await adminService.listOrganizations(cursor));
  }),
);

adminRoutes.get(
  '/organizations/:id',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, { organization: await adminService.getOrganization(String(req.params.id)) });
  }),
);

adminRoutes.patch(
  '/organizations/:id/plan',
  validate(z.object({ plan: z.enum(PLANS), reason: z.string().min(10) })),
  asyncHandler(async (req: Request, res: Response) => {
    await subscriptionService.setPlan(
      new Types.ObjectId(req.user!.id),
      String(req.params.id),
      req.body.plan,
      req.body.reason,
    );
    ok(res, { organization: await adminService.getOrganization(String(req.params.id)) });
  }),
);

adminRoutes.post(
  '/impersonate',
  // no reason → 422 before any handler runs. "Impossible", not "discouraged".
  validate(z.object({ targetUserId: z.string().length(24), reason: z.string().min(10) })),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await adminService.startImpersonation(
      new Types.ObjectId(req.user!.id),
      req.body.targetUserId,
      req.body.reason,
    );
    ok(res, result, 201);
  }),
);

// §20.5: "A DLQ nobody can replay from is a graveyard." Inspect, fix, REPLAY.
adminRoutes.get(
  '/dlq',
  asyncHandler(async (req: Request, res: Response) => {
    const queue = typeof req.query.queue === 'string' ? req.query.queue : undefined;
    ok(res, { deadLetters: await dlqService.list(queue) });
  }),
);

adminRoutes.post(
  '/dlq/:id/replay',
  validate(z.object({ fixedData: z.unknown().optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await dlqService.replay(String(req.params.id), req.body.fixedData), 201);
  }),
);

adminRoutes.post(
  '/impersonate/:sessionId/end',
  asyncHandler(async (req: Request, res: Response) => {
    await adminService.endImpersonation(
      new Types.ObjectId(req.user!.id),
      String(req.params.sessionId),
    );
    ok(res, { ended: true });
  }),
);
