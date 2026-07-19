/**
 * Bills + expenses (§18.5). Money-moving mutations carry Idempotency-Key.
 * Expense submit needs only expense:submit (employees have it); approve
 * needs expense:approve AND a different user than the submitter.
 */
import { Router, type Request, type Response } from 'express';
import { createBillSchema, createExpenseSchema, rejectSchema } from '@finpilot/shared';
import type {
  CancelInvoiceInput,
  CreateBillInput,
  CreateExpenseInput,
  RejectInput,
} from '@finpilot/shared';
import { cancelInvoiceSchema } from '@finpilot/shared';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { idempotency } from '../../middleware/idempotency';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { billService } from '../../services/billService';
import { expenseService } from '../../services/expenseService';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';

function dto(doc: Record<string, unknown>) {
  const { _id, companyId: _c, __v: _v, ...rest } = doc;
  return { id: String(_id), ...rest };
}

export const billRoutes = Router();
billRoutes.use(authenticate, tenantResolve('header'));

billRoutes.get(
  '/',
  authorize('report:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    ok(res, { bills: (await billService.list(status)).map((b) => dto(b as never)) });
  }),
);
billRoutes.post(
  '/',
  authorize('invoice:create'),
  idempotency,
  validate(createBillSchema),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, { bill: dto((await billService.create(req.body as CreateBillInput)) as never) }, 201);
  }),
);
billRoutes.get(
  '/:id',
  authorize('report:read'),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, { bill: dto((await billService.get(String(req.params.id))) as never) });
  }),
);
billRoutes.post(
  '/:id/approve',
  authorize('expense:approve'),
  idempotency,
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, { bill: dto((await billService.approve(String(req.params.id))) as never) }, 201);
  }),
);
billRoutes.post(
  '/:id/cancel',
  authorize('expense:approve'),
  idempotency,
  validate(cancelInvoiceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, {
      bill: dto(
        (await billService.cancel(
          String(req.params.id),
          (req.body as CancelInvoiceInput).reason,
        )) as never,
      ),
    });
  }),
);

export const expenseRoutes = Router();
expenseRoutes.use(authenticate, tenantResolve('header'));

expenseRoutes.get(
  '/',
  authorize('expense:submit'),
  asyncHandler(async (req: Request, res: Response) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    ok(res, { expenses: (await expenseService.list(status)).map((e) => dto(e as never)) });
  }),
);
expenseRoutes.post(
  '/',
  authorize('expense:submit'),
  idempotency,
  validate(createExpenseSchema),
  asyncHandler(async (req: Request, res: Response) => {
    ok(
      res,
      { expense: dto((await expenseService.submit(req.body as CreateExpenseInput)) as never) },
      201,
    );
  }),
);
expenseRoutes.post(
  '/:id/approve',
  authorize('expense:approve'),
  idempotency,
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, { expense: dto((await expenseService.approve(String(req.params.id))) as never) }, 201);
  }),
);
expenseRoutes.post(
  '/:id/reject',
  authorize('expense:approve'),
  validate(rejectSchema),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, {
      expense: dto(
        (await expenseService.reject(
          String(req.params.id),
          (req.body as RejectInput).reason,
        )) as never,
      ),
    });
  }),
);
