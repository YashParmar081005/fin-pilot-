/**
 * Billing (plan.md §32 Phase 23): the org's plan, live usage vs limits, and
 * the Razorpay subscription flow. Company-scoped for context resolution, but
 * the numbers are ORG-wide — the whole point of a plan.
 */
import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { idempotency } from '../../middleware/idempotency';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { subscriptionService } from '../../services/admin/subscriptionService';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';

export const billingRoutes = Router();
billingRoutes.use(authenticate, tenantResolve('header'));

billingRoutes.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await subscriptionService.billingOverview());
  }),
);

billingRoutes.post(
  '/subscribe',
  idempotency,
  validate(z.object({ plan: z.enum(['starter', 'professional', 'enterprise']) })),
  asyncHandler(async (req: Request, res: Response) => {
    const created = await subscriptionService.subscribe(
      new Types.ObjectId(req.user!.id),
      req.body.plan,
    );
    ok(res, { subscription: created }, 201);
  }),
);
