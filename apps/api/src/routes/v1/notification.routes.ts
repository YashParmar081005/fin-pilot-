/** Notification routes (§18.5) + preferences. */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { NotificationPreference } from '../../models/Notification';
import { requireCompanyContext } from '../../plugins/tenantScope';
import { notificationService } from '../../services/notificationService';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';

export const notificationRoutes = Router();
notificationRoutes.use(authenticate, tenantResolve('header'));

notificationRoutes.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    ok(res, { notifications: await notificationService.listFor(ctx.userId!) });
  }),
);
notificationRoutes.post(
  '/read',
  validate(z.object({ ids: z.array(z.string().length(24)).min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    await notificationService.markRead(ctx.userId!, req.body.ids);
    ok(res, { read: true });
  }),
);
notificationRoutes.get(
  '/preferences',
  asyncHandler(async (_req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    const prefs = await NotificationPreference.findOne({ userId: ctx.userId }).lean();
    ok(res, {
      channels: prefs?.channels ?? { inApp: true, email: true, whatsapp: false },
      events: prefs?.events ?? {},
    });
  }),
);
notificationRoutes.patch(
  '/preferences',
  validate(
    z.object({
      channels: z
        .object({ inApp: z.boolean(), email: z.boolean(), whatsapp: z.boolean() })
        .partial()
        .optional(),
      events: z.record(z.boolean()).optional(),
    }),
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    // event names contain dots ('invoice.overdue') — dot-notation $set would
    // nest them; merge in JS and write the whole objects instead
    const existing = await NotificationPreference.findOne({ userId: ctx.userId }).lean();
    const channels = {
      ...(existing?.channels ?? { inApp: true, email: true, whatsapp: false }),
      ...(req.body.channels ?? {}),
    };
    const events = { ...(existing?.events ?? {}), ...(req.body.events ?? {}) };
    const prefs = await NotificationPreference.findOneAndUpdate(
      { userId: ctx.userId },
      { $set: { channels, events }, $setOnInsert: { companyId: ctx.companyId } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    ok(res, { channels: prefs!.channels, events: prefs!.events });
  }),
);
