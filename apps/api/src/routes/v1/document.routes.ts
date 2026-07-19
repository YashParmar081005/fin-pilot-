/** Document routes (§18.5). */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { idempotency } from '../../middleware/idempotency';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { documentService } from '../../services/documentService';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';

function dto(doc: Record<string, unknown>) {
  const { _id, companyId: _c, content: _b, __v: _v, ...rest } = doc;
  return { id: String(_id), ...rest };
}

export const documentRoutes = Router();
documentRoutes.use(authenticate, tenantResolve('header'));

documentRoutes.post(
  '/',
  authorize('expense:submit'),
  validate(
    z.object({
      filename: z.string().min(1).max(200),
      mimeType: z.string().min(1).max(100),
      contentBase64: z.string().min(1).max(10_000_000), // 10 mb only on /uploads (§5.3)
    }),
  ),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, { document: dto((await documentService.upload(req.body)) as never) }, 201);
  }),
);
documentRoutes.get(
  '/:id',
  authorize('expense:submit'),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, { document: dto((await documentService.get(String(req.params.id))) as never) });
  }),
);

export const billFromDocumentRoutes = Router();
billFromDocumentRoutes.use(authenticate, tenantResolve('header'));
billFromDocumentRoutes.post(
  '/from-document/:documentId',
  authorize('invoice:create'),
  idempotency,
  validate(z.object({ partyId: z.string().length(24), gstRate: z.number() })),
  asyncHandler(async (req: Request, res: Response) => {
    const bill = await documentService.createBill(String(req.params.documentId), req.body);
    ok(res, { bill: { ...bill, id: String(bill._id) } }, 201);
  }),
);
