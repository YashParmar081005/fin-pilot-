/** Reconciliation routes (§18.5). Suggestions never post; confirm is human. */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { idempotency } from '../../middleware/idempotency';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { reconciliationService } from '../../services/reconciliationService';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';

export const reconciliationRoutes = Router();
reconciliationRoutes.use(authenticate, tenantResolve('header'), authorize('bank:reconcile'));

reconciliationRoutes.get(
  '/suggestions',
  asyncHandler(async (req: Request, res: Response) => {
    const bankAccountId = req.query.bankAccountId;
    if (typeof bankAccountId !== 'string') throw new AppError('SYS_VALIDATION_FAILED', 422);
    ok(res, { suggestions: await reconciliationService.suggestions(bankAccountId) });
  }),
);
reconciliationRoutes.post(
  '/confirm',
  idempotency,
  validate(
    z.object({
      matches: z
        .array(
          z.object({
            bankTransactionId: z.string().length(24),
            journalEntryId: z.string().length(24),
            score: z.number().optional(),
          }),
        )
        .min(1),
    }),
  ),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await reconciliationService.confirm(req.body.matches), 201);
  }),
);
reconciliationRoutes.post(
  '/from-line',
  idempotency,
  validate(
    z.object({
      bankTransactionId: z.string().length(24),
      accountId: z.string().length(24),
      description: z.string().max(500).default(''),
    }),
  ),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await reconciliationService.createFromLine(req.body.bankTransactionId, req.body), 201);
  }),
);
