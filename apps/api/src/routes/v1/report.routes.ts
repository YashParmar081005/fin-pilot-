/** Report routes (§18.5). Exports go through the queue → GET /jobs/:id. */
import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantResolve } from '../../middleware/tenantResolve';
import { requireCompanyContext } from '../../plugins/tenantScope';
import { ReportJob } from '../../models/ReportJob';
import { QUEUES, QUEUE_POLICY } from '../../queues/definitions';
import { backoffOpts, getQueue } from '../../queues/infra';
import { reportService } from '../../services/reportService';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';

function asOf(req: Request): Date {
  const value = typeof req.query.asOf === 'string' ? new Date(req.query.asOf) : new Date();
  if (Number.isNaN(value.getTime())) throw new AppError('SYS_VALIDATION_FAILED', 422);
  return value;
}

export const reportRoutes = Router();
reportRoutes.use(authenticate, tenantResolve('header'), authorize('report:read'));

reportRoutes.get(
  '/trial-balance',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, { rows: await reportService.trialBalance(asOf(req)) });
  }),
);
reportRoutes.get(
  '/profit-loss',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await reportService.profitLoss(asOf(req)));
  }),
);
reportRoutes.get(
  '/balance-sheet',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await reportService.balanceSheet(asOf(req)));
  }),
);
reportRoutes.get(
  '/cash-flow',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await reportService.cashFlow(asOf(req)));
  }),
);
reportRoutes.get(
  '/aged-receivables',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await reportService.agedReceivables(asOf(req)));
  }),
);
reportRoutes.get(
  '/aged-payables',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await reportService.agedPayables(asOf(req)));
  }),
);

reportRoutes.post(
  '/:type/export',
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    const job = await ReportJob.create({
      companyId: ctx.companyId,
      type: String(req.params.type),
      params: { asOf: asOf(req).toISOString() },
      requestedBy: ctx.userId,
    });
    const policy = QUEUE_POLICY[QUEUES.REPORT_EXPORT];
    await getQueue(QUEUES.REPORT_EXPORT).add(
      'export',
      { reportJobId: String(job._id) },
      { jobId: `report-${job._id}`, ...backoffOpts(policy.attempts, policy.backoffMs) },
    );
    ok(res, { jobId: String(job._id) }, 202);
  }),
);

export const jobRoutes = Router();
jobRoutes.use(authenticate, tenantResolve('header'));
jobRoutes.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const job = await ReportJob.findOne({ _id: req.params.id }).lean();
    if (!job) throw new AppError('SYS_NOT_FOUND', 404);
    ok(res, {
      id: String(job._id),
      type: job.type,
      status: job.status,
      progress: job.progress,
      error: job.error,
    });
  }),
);
jobRoutes.get(
  '/:id/download',
  asyncHandler(async (req: Request, res: Response) => {
    const job = await ReportJob.findOne({ _id: req.params.id }).lean();
    if (!job || job.status !== 'completed' || !job.artefactCsv) {
      throw new AppError('SYS_NOT_FOUND', 404);
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${job.type}.csv"`);
    res.send(job.artefactCsv);
  }),
);
