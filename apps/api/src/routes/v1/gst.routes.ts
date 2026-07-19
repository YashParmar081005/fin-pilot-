/** GST return routes (§18.5). */
import { Router, type Request, type Response } from 'express';
import { GstEngine } from '../../engines/gst/GstEngine';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantResolve } from '../../middleware/tenantResolve';
import { requireCompanyContext } from '../../plugins/tenantScope';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';

export const gstRoutes = Router();
gstRoutes.use(authenticate, tenantResolve('header'));

function period(req: Request): string {
  const p = req.query.period;
  if (typeof p !== 'string' || !/^\d{4}-\d{2}$/.test(p)) {
    throw new AppError('SYS_VALIDATION_FAILED', 422, { period: 'expected YYYY-MM' });
  }
  return p;
}

gstRoutes.get(
  '/gstr1',
  authorize('report:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    const doc = await GstEngine.generateGstr1(ctx.companyId, period(req));
    ok(res, { id: String(doc._id), period: doc.period, data: doc.data });
  }),
);

gstRoutes.get(
  '/gstr3b',
  authorize('report:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    const doc = await GstEngine.generateGstr3b(ctx.companyId, period(req));
    ok(res, { id: String(doc._id), period: doc.period, data: doc.data });
  }),
);

gstRoutes.get(
  '/returns/:id/trace',
  authorize('report:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const ref = typeof req.query.ref === 'string' ? req.query.ref : '';
    ok(res, { ref, journalEntryIds: await GstEngine.trace(String(req.params.id), ref) });
  }),
);
