/** GST return routes (§18.5). */
import { Router, type Request, type Response } from 'express';
import { GstEngine } from '../../engines/gst/GstEngine';
import { companyRepo } from '../../repositories/companyRepo';
import { imsService } from '../../services/imsService';
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

// ── IMS (§14.5) ─────────────────────────────────────────────────────────
gstRoutes.get(
  '/ims',
  authorize('ims:action'),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, { records: await imsService.list(period(req)) });
  }),
);
gstRoutes.post(
  '/ims/sync',
  authorize('ims:action'),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    const company = await companyRepo.findById(ctx.companyId);
    if (!company?.gstin) throw new AppError('GST_INVALID_GSTIN', 422);
    const p = typeof req.body?.period === 'string' ? req.body.period : '';
    if (!/^\d{4}-\d{2}$/.test(p)) throw new AppError('SYS_VALIDATION_FAILED', 422);
    ok(res, await imsService.sync(p, company.gstin));
  }),
);
gstRoutes.post(
  '/ims/:id/action',
  authorize('ims:action'),
  asyncHandler(async (req: Request, res: Response) => {
    const action = req.body?.action;
    if (!['accept', 'reject', 'pending'].includes(action)) {
      throw new AppError('SYS_VALIDATION_FAILED', 422, { action: 'accept|reject|pending' });
    }
    ok(res, await imsService.act([String(req.params.id)], action, req.body?.remarks));
  }),
);
gstRoutes.post(
  '/ims/actions',
  authorize('ims:action'),
  asyncHandler(async (req: Request, res: Response) => {
    const { ids, action, remarks } = req.body ?? {};
    if (!Array.isArray(ids) || !['accept', 'reject', 'pending'].includes(action)) {
      throw new AppError('SYS_VALIDATION_FAILED', 422);
    }
    ok(res, await imsService.act(ids.map(String), action, remarks));
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
