/** Forecast / health / anomalies routes (§18.5). */
import { Router, type Request, type Response } from 'express';
import { forecastEngine } from '../../engines/forecast';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantResolve } from '../../middleware/tenantResolve';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';

export const forecastRoutes = Router();
forecastRoutes.use(authenticate, tenantResolve('header'), authorize('report:read'));

forecastRoutes.get(
  '/cash-flow',
  asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await forecastEngine.cashFlow());
  }),
);
forecastRoutes.get(
  '/health',
  asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await forecastEngine.healthScore());
  }),
);
forecastRoutes.get(
  '/anomalies',
  asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await forecastEngine.anomalies());
  }),
);
