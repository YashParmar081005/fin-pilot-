/** Banking routes (§18.5). */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { requireCompanyContext } from '../../plugins/tenantScope';
import { bankingService } from '../../services/bankingService';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  bankName: z.string().max(100).optional(),
  accountNumberMasked: z.string().max(30).optional(),
  ifsc: z.string().max(11).optional(),
});
const importSchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  mapping: z
    .object({
      date: z.string(),
      narration: z.string(),
      amount: z.string().optional(),
      credit: z.string().optional(),
      debit: z.string().optional(),
      reference: z.string().optional(),
    })
    .refine((m) => m.amount || (m.credit && m.debit), 'map amount OR credit+debit columns'),
});
const manualSchema = z.object({
  date: z.coerce.date(),
  narration: z.string().trim().min(1).max(500),
  amountPaise: z.number().int().positive(),
  direction: z.enum(['credit', 'debit']),
});

export const bankingRoutes = Router();
bankingRoutes.use(authenticate, tenantResolve('header'));

bankingRoutes.get(
  '/',
  authorize('bank:reconcile'),
  asyncHandler(async (_req: Request, res: Response) => {
    ok(res, { bankAccounts: await bankingService.list() });
  }),
);
bankingRoutes.post(
  '/',
  authorize('bank:reconcile'),
  validate(createSchema),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, { bankAccount: await bankingService.createAccount(req.body) }, 201);
  }),
);
bankingRoutes.post(
  '/aa/consent',
  authorize('bank:reconcile'),
  validate(z.object({ bankAccountId: z.string().length(24) })),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    ok(res, await bankingService.aaConsent(String(ctx.companyId), req.body.bankAccountId), 201);
  }),
);
bankingRoutes.post(
  '/aa/callback',
  authorize('bank:reconcile'),
  validate(z.object({ consentId: z.string(), status: z.enum(['active', 'revoked']) })),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await bankingService.aaCallback(req.body.consentId, req.body.status));
  }),
);
bankingRoutes.post(
  '/:id/import',
  authorize('bank:reconcile'),
  validate(importSchema),
  asyncHandler(async (req: Request, res: Response) => {
    ok(
      res,
      await bankingService.importCsv(String(req.params.id), req.body.csv, req.body.mapping),
      201,
    );
  }),
);
bankingRoutes.post(
  '/:id/transactions',
  authorize('bank:reconcile'),
  validate(manualSchema),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await bankingService.manualEntry(String(req.params.id), req.body), 201);
  }),
);
bankingRoutes.get(
  '/:id/transactions',
  authorize('bank:reconcile'),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, { transactions: await bankingService.listTransactions(String(req.params.id)) });
  }),
);
