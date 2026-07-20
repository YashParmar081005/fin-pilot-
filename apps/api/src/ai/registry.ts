/**
 * The tool registry (plan.md §24, Prompt 19). READ tools only — writes are
 * Phase 20 proposals. Each tool declares its permission; the list sent to
 * the model is FILTERED by the caller's permissions, and executeTool
 * OVERWRITES any model-supplied companyId with the server's (I8 + I9).
 */
import { z } from 'zod';
import { Types } from 'mongoose';
import { reportService } from '../services/reportService';
import { requestContext } from '../plugins/tenantScope';
import { AiToolCall } from '../models/AiConversation';
import { AppError } from '../utils/AppError';

export interface AiTool {
  name: string;
  description: string;
  permission: string;
  schema: z.ZodTypeAny;
  execute(args: Record<string, unknown>): Promise<unknown>;
}

const asOfArg = z.object({ asOf: z.string().optional() });
const asOf = (args: Record<string, unknown>) =>
  typeof args.asOf === 'string' ? new Date(args.asOf) : new Date();

/** The §32.1 MVP five. */
export const TOOLS: AiTool[] = [
  {
    name: 'getRevenue',
    description: 'Total income for the company as of a date',
    permission: 'report:read',
    schema: asOfArg,
    async execute(args) {
      const pnl = await reportService.profitLoss(asOf(args));
      return { totalIncomePaise: pnl.totalIncomePaise, income: pnl.income };
    },
  },
  {
    name: 'getExpenses',
    description: 'Total expenses for the company as of a date',
    permission: 'report:read',
    schema: asOfArg,
    async execute(args) {
      const pnl = await reportService.profitLoss(asOf(args));
      return { totalExpensesPaise: pnl.totalExpensesPaise, expenses: pnl.expenses };
    },
  },
  {
    name: 'getProfitAndLoss',
    description: 'Full P&L as of a date',
    permission: 'report:read',
    schema: asOfArg,
    execute: (args) => reportService.profitLoss(asOf(args)),
  },
  {
    name: 'getOutstandingReceivables',
    description: 'Aged accounts receivable as of a date',
    permission: 'report:read',
    schema: asOfArg,
    execute: (args) => reportService.agedReceivables(asOf(args)),
  },
  {
    name: 'getCashPosition',
    description: 'Cash and bank position as of a date',
    permission: 'report:read',
    schema: asOfArg,
    execute: (args) => reportService.cashFlow(asOf(args)),
  },
];

export function toolsFor(permissions: string[]): AiTool[] {
  return TOOLS.filter((t) => permissions.includes(t.permission));
}

/** Injects the SERVER's companyId, overwriting anything the model supplied. */
export async function executeTool(
  tool: AiTool,
  modelArgs: Record<string, unknown>,
  conversationId: Types.ObjectId,
): Promise<unknown> {
  const ctx = requestContext.getStore();
  if (!ctx?.companyId) throw new AppError('TENANT_CONTEXT_MISSING', 500);
  const args = { ...tool.schema.parse(modelArgs), companyId: String(ctx.companyId) };
  // ↑ even if the model sent companyId, the parse strips unknown keys and the
  // server's is written — a prompt-injected foreign tenant CANNOT leak (I8)
  const result = await tool.execute(args);
  await AiToolCall.create({
    companyId: ctx.companyId,
    conversationId,
    toolName: tool.name,
    args,
    resultPreview: JSON.stringify(result).slice(0, 2_000),
  });
  return result;
}
