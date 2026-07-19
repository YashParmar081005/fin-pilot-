import { Router, type Request, type Response } from 'express';
import {
  allocatePaymentSchema,
  createPaymentSchema,
  refundPaymentSchema,
  type AllocatePaymentInput,
  type CreatePaymentInput,
  type RefundPaymentInput,
} from '@finpilot/shared';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { idempotency } from '../../middleware/idempotency';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { paymentService } from '../../services/paymentService';
import { handleRazorpayEvent, verifyRazorpaySignature } from '../../services/razorpayService';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';

function dto(doc: Record<string, unknown>) {
  const { _id, companyId: _c, __v: _v, ...rest } = doc;
  return { id: String(_id), ...rest };
}

export const paymentRoutes = Router();
paymentRoutes.use(authenticate, tenantResolve('header'));

paymentRoutes.get(
  '/',
  authorize('report:read'),
  asyncHandler(async (_req: Request, res: Response) => {
    ok(res, { payments: (await paymentService.list()).map((p) => dto(p as never)) });
  }),
);
paymentRoutes.post(
  '/',
  authorize('bank:reconcile'),
  idempotency,
  validate(createPaymentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    ok(
      res,
      { payment: dto((await paymentService.create(req.body as CreatePaymentInput)) as never) },
      201,
    );
  }),
);
paymentRoutes.get(
  '/:id',
  authorize('report:read'),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, { payment: dto((await paymentService.get(String(req.params.id))) as never) });
  }),
);
paymentRoutes.post(
  '/:id/allocate',
  authorize('bank:reconcile'),
  idempotency,
  validate(allocatePaymentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    ok(
      res,
      {
        payment: dto(
          (await paymentService.allocate(
            String(req.params.id),
            req.body as AllocatePaymentInput,
          )) as never,
        ),
      },
      201,
    );
  }),
);
paymentRoutes.post(
  '/:id/refund',
  authorize('bank:reconcile'),
  idempotency,
  validate(refundPaymentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as RefundPaymentInput;
    ok(
      res,
      {
        payment: dto(
          (await paymentService.refund(
            String(req.params.id),
            body.amountPaise,
            body.reason,
          )) as never,
        ),
      },
      201,
    );
  }),
);

/** No auth — Razorpay calls this. Signature IS the authentication. */
export const webhookRoutes = Router();
webhookRoutes.post(
  '/razorpay',
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (typeof signature !== 'string' || !rawBody || !verifyRazorpaySignature(rawBody, signature)) {
      throw new AppError('AUTH_UNAUTHORIZED', 400, { webhook: 'bad signature' });
    }
    const result = await handleRazorpayEvent(req.body);
    ok(res, result);
  }),
);
