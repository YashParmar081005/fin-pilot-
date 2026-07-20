/**
 * L4 — AI budget (plan.md §19.6, §24). FAILS CLOSED: Mongo is the source of
 * truth; Redis is only ever a cache. assertBudget runs BEFORE the first LLM
 * call — over-quota costs ZERO tokens.
 */
import { upgradePathFor } from '@finpilot/shared';
import { AiUsage } from '../models/AiConversation';
import { Company } from '../models/Company';
import { Organization } from '../models/Organization';
import { requireCompanyContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';

const month = () => new Date().toISOString().slice(0, 7);

export async function assertBudget(): Promise<void> {
  const ctx = requireCompanyContext();
  const company = await Company.findById(ctx.companyId).lean();
  const org = company ? await Organization.findById(company.organizationId).lean() : null;
  const limit = org?.limits.aiTokensMonth ?? 200_000;
  const usage = await AiUsage.findOne({ month: month() }).lean();
  if ((usage?.tokensUsed ?? 0) >= limit) {
    throw new AppError('AI_QUOTA_EXCEEDED', 402, {
      limit,
      used: usage?.tokensUsed ?? 0,
      upgrade: upgradePathFor(org?.plan ?? 'free'), // §32 Phase 23 contract
    });
  }
}

export async function recordUsage(tokens: number): Promise<void> {
  const ctx = requireCompanyContext();
  await AiUsage.findOneAndUpdate(
    { month: month() },
    { $inc: { tokensUsed: tokens }, $setOnInsert: { companyId: ctx.companyId } },
    { upsert: true, setDefaultsOnInsert: true },
  );
}
