/** Copilot routes (§18.5): conversations + SSE messages. */
import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { runCopilotTurn } from '../../ai/gateway';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { AiConversation, AiUsage } from '../../models/AiConversation';
import { requestContext, requireCompanyContext } from '../../plugins/tenantScope';
import { permissionCache } from '../../services/permissionCache';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/respond';

export const aiRoutes = Router();
aiRoutes.use(authenticate, tenantResolve('header'), authorize('ai:read'));

aiRoutes.post(
  '/conversations',
  asyncHandler(async (_req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    const conversation = await AiConversation.create({ userId: ctx.userId, messages: [] });
    ok(res, { id: String(conversation._id) }, 201);
  }),
);

aiRoutes.post(
  '/conversations/:id/messages',
  validate(z.object({ message: z.string().trim().min(1).max(4_000) })),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    const permissions = await permissionCache.get(String(ctx.userId), String(ctx.companyId));

    // SSE stream: tool-call chips, content, done
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const emit = (event: { type: string; data: unknown }) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    };
    try {
      await runCopilotTurn(
        new Types.ObjectId(String(req.params.id)),
        req.body.message,
        permissions,
        emit,
      );
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      const code = (err as { code?: string }).code ?? 'SYS_INTERNAL_ERROR';
      res.statusCode = status; // headers may already be out — best effort
      emit({ type: 'error', data: { code, status } });
    }
    res.end();
  }),
);

aiRoutes.get(
  '/usage',
  asyncHandler(async (_req: Request, res: Response) => {
    requestContext.getStore();
    const usage = await AiUsage.findOne({ month: new Date().toISOString().slice(0, 7) }).lean();
    ok(res, { month: usage?.month ?? null, tokensUsed: usage?.tokensUsed ?? 0 });
  }),
);
