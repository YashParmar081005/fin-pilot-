/** Copilot routes (§18.5): conversations + SSE messages. */
import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { createInvoiceSchema, createJournalEntrySchema } from '@finpilot/shared';
import { runCopilotTurn } from '../../ai/gateway';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { idempotency } from '../../middleware/idempotency';
import { tenantResolve } from '../../middleware/tenantResolve';
import { validate } from '../../middleware/validate';
import { AiConversation, AiUsage } from '../../models/AiConversation';
import { AiProposal } from '../../models/AiProposal';
import { invoiceService } from '../../services/invoiceService';
import { journalService } from '../../services/journalService';
import { imsService } from '../../services/imsService';
import { requestContext, requireCompanyContext } from '../../plugins/tenantScope';
import { permissionCache } from '../../services/permissionCache';
import { AppError } from '../../utils/AppError';
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

/** The proposal inbox the UI renders (I10: human sees the diff, then confirms). */
aiRoutes.get(
  '/proposals',
  asyncHandler(async (_req: Request, res: Response) => {
    const proposals = await AiProposal.find({}).sort({ createdAt: -1 }).limit(20).lean();
    ok(res, {
      proposals: proposals.map((p) => ({
        id: String(p._id),
        type: p.type,
        status: p.status,
        payload: p.payload,
        preview: p.preview,
        expiresAt: p.expiresAt,
        createdAt: p.createdAt,
      })),
    });
  }),
);

/**
 * I10 confirm: re-validates the PAYLOAD through the same schemas and replays
 * it through the SAME services a human uses. The stored preview is ignored —
 * every amount is recomputed (I5). Requires ai:write on top of ai:read.
 */
aiRoutes.post(
  '/proposals/:id/confirm',
  authorize('ai:write'),
  idempotency,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = requireCompanyContext();
    const proposal = await AiProposal.findOne({ _id: req.params.id });
    if (!proposal) throw new AppError('SYS_NOT_FOUND', 404);
    if (proposal.status !== 'proposed')
      throw new AppError('DOC_INVALID_STATE', 409, { status: proposal.status });
    if (proposal.expiresAt <= new Date()) {
      proposal.status = 'expired';
      await proposal.save();
      throw new AppError('AI_PROPOSAL_EXPIRED', 409, { expiresAt: proposal.expiresAt });
    }

    let resultId: string;
    let result: unknown;
    if (proposal.type === 'invoice') {
      const input = createInvoiceSchema.parse(proposal.payload); // full re-validation
      const invoice = await invoiceService.createDraft(input);
      resultId = String(invoice._id);
      result = {
        invoiceId: resultId,
        grandTotalPaise: invoice.grandTotalPaise,
        status: invoice.status,
      };
    } else if (proposal.type === 'journal_entry') {
      const input = createJournalEntrySchema.parse(proposal.payload);
      const entry = await journalService.postManual(input);
      resultId = String(entry._id);
      result = { journalEntryId: resultId, entryNumber: entry.entryNumber };
    } else {
      const input = z
        .object({
          recordId: z.string(),
          action: z.enum(['accept', 'reject', 'pending']),
          remarks: z.string().optional(),
        })
        .parse(proposal.payload);
      await imsService.act([input.recordId], input.action, input.remarks);
      resultId = input.recordId;
      result = { recordId: resultId, action: input.action };
    }

    proposal.status = 'confirmed';
    proposal.confirmedBy = ctx.userId!;
    proposal.resultId = new Types.ObjectId(resultId);
    await proposal.save();
    ok(res, { proposalId: String(proposal._id), result }, 201);
  }),
);

aiRoutes.post(
  '/proposals/:id/reject',
  authorize('ai:write'),
  asyncHandler(async (req: Request, res: Response) => {
    const proposal = await AiProposal.findOne({ _id: req.params.id });
    if (!proposal || proposal.status !== 'proposed') throw new AppError('DOC_INVALID_STATE', 409);
    proposal.status = 'rejected';
    await proposal.save();
    ok(res, { rejected: true });
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
