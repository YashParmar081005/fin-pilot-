/**
 * Subscriptions + usage metering (plan.md §32 Phase 23).
 * Limits live on Organization.limits (§19.4 — raising one never needs a
 * deploy); this service is the single place that reads them and throws the
 * 402 SYS_PLAN_LIMIT_EXCEEDED **with an upgrade path** in details.upgrade.
 *
 * Lives in services/admin/ because metering is ORG-wide: it must count across
 * every company of the organization, which crosses the tenant boundary —
 * the sanctioned skipTenantScope path (§9.1).
 */
import { Types } from 'mongoose';
import { PLAN_LIMITS, upgradePathFor, type Plan } from '@finpilot/shared';
import {
  getRazorpaySubscriptionClient,
  type CreatedSubscription,
} from '../../integrations/razorpay/subscriptions';
import { logger } from '../../config/logger';
import { AdminAudit } from '../../models/AdminAudit';
import { AiUsage } from '../../models/AiConversation';
import { Company } from '../../models/Company';
import { Document } from '../../models/Document';
import { Invoice } from '../../models/Invoice';
import { Membership } from '../../models/Membership';
import { Organization, type OrganizationDoc } from '../../models/Organization';
import { Subscription, type SubscriptionDoc } from '../../models/Subscription';
import { requireCompanyContext } from '../../plugins/tenantScope';
import { AppError } from '../../utils/AppError';

const monthOf = (d: Date) => d.toISOString().slice(0, 7);
const monthStart = (month: string) => new Date(`${month}-01T00:00:00.000Z`);

async function orgForCompany(companyId: Types.ObjectId): Promise<OrganizationDoc> {
  const company = await Company.findById(companyId).lean();
  const org = company ? await Organization.findById(company.organizationId).lean() : null;
  if (!org) throw new AppError('SYS_NOT_FOUND', 404, { organization: 'not found' });
  return org;
}

async function companyIdsOf(orgId: Types.ObjectId): Promise<Types.ObjectId[]> {
  const companies = await Company.find({ organizationId: orgId }).select('_id').lean();
  return companies.map((c) => c._id);
}

export interface OrgUsage {
  aiTokens: number;
  ocrPages: number;
  invoices: number;
}

async function usageForOrg(orgId: Types.ObjectId, month: string): Promise<OrgUsage> {
  const ids = await companyIdsOf(orgId);
  const since = monthStart(month);
  const [ai, ocrPages, invoices] = await Promise.all([
    AiUsage.aggregate<{ _id: null; tokens: number }>([
      { $match: { companyId: { $in: ids }, month } },
      { $group: { _id: null, tokens: { $sum: '$tokensUsed' } } },
    ]).option({ skipTenantScope: true }),
    // v1 meters one page per extracted document — the Document model stores
    // no page count yet; revisit when multi-page OCR lands
    Document.countDocuments({
      companyId: { $in: ids },
      status: 'extracted',
      createdAt: { $gte: since },
    }).setOptions({ skipTenantScope: true }),
    Invoice.countDocuments({
      companyId: { $in: ids },
      createdAt: { $gte: since },
    }).setOptions({ skipTenantScope: true }),
  ]);
  return { aiTokens: ai[0]?.tokens ?? 0, ocrPages, invoices };
}

function planLimitError(
  org: OrganizationDoc,
  limit: keyof OrganizationDoc['limits'],
  used: number,
): AppError {
  return new AppError('SYS_PLAN_LIMIT_EXCEEDED', 402, {
    limit,
    used,
    max: org.limits[limit],
    plan: org.plan,
    upgrade: upgradePathFor(org.plan), // §32: 402 WITH an upgrade path
  });
}

export const subscriptionService = {
  /** Called by invoiceService.createDraft — org-wide invoices this month. */
  async assertInvoiceQuota(): Promise<void> {
    const ctx = requireCompanyContext();
    const org = await orgForCompany(ctx.companyId);
    const ids = await companyIdsOf(org._id);
    const used = await Invoice.countDocuments({
      companyId: { $in: ids },
      createdAt: { $gte: monthStart(monthOf(new Date())) },
    }).setOptions({ skipTenantScope: true });
    if (used >= org.limits.maxInvoicesMonth) throw planLimitError(org, 'maxInvoicesMonth', used);
  },

  /** Called by memberService.invite — distinct users across the org. */
  async assertSeatQuota(organizationId: Types.ObjectId): Promise<void> {
    const org = await Organization.findById(organizationId).lean();
    if (!org) throw new AppError('SYS_NOT_FOUND', 404);
    const ids = await companyIdsOf(org._id);
    const users = await Membership.distinct('userId', { companyId: { $in: ids } }).setOptions({
      skipTenantScope: true,
    });
    if (users.length >= org.limits.maxUsers) throw planLimitError(org, 'maxUsers', users.length);
  },

  /** Billing page data for the current company's organization. */
  async billingOverview(): Promise<{
    plan: Plan;
    status: SubscriptionDoc['status'];
    limits: OrganizationDoc['limits'];
    usage: OrgUsage;
    month: string;
  }> {
    const ctx = requireCompanyContext();
    const org = await orgForCompany(ctx.companyId);
    const sub = await Subscription.findOne({ organizationId: org._id }).lean();
    const month = monthOf(new Date());
    return {
      plan: org.plan,
      status: sub?.status ?? 'active',
      limits: org.limits,
      usage: await usageForOrg(org._id, month),
      month,
    };
  },

  /** Org OWNER starts a paid subscription; Razorpay hosts the checkout. */
  async subscribe(
    userId: Types.ObjectId,
    plan: Plan,
  ): Promise<CreatedSubscription & { plan: Plan }> {
    if (plan === 'free') {
      throw new AppError('SYS_VALIDATION_FAILED', 422, { plan: 'free needs no subscription' });
    }
    const ctx = requireCompanyContext();
    const org = await orgForCompany(ctx.companyId);
    if (!org.ownerUserId.equals(userId)) {
      throw new AppError('AUTH_FORBIDDEN', 403, { reason: 'only the org owner can subscribe' });
    }
    const created = await getRazorpaySubscriptionClient().createSubscription({
      plan,
      notes: { organizationId: String(org._id), plan },
    });
    await Subscription.findOneAndUpdate(
      { organizationId: org._id },
      {
        plan,
        status: 'created',
        razorpaySubscriptionId: created.id,
        seats: PLAN_LIMITS[plan].maxUsers,
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    return { ...created, plan };
  },

  /**
   * Webhook path (subscription.activated / subscription.charged): flips the
   * subscription active and copies PLAN_LIMITS onto the org. Idempotent —
   * replaying the event sets the same state again.
   */
  async activateFromWebhook(
    razorpaySubscriptionId: string,
    periodEndUnix?: number,
  ): Promise<{ activated: boolean }> {
    const sub = await Subscription.findOne({ razorpaySubscriptionId }).lean();
    if (!sub) throw new AppError('SYS_NOT_FOUND', 404, { razorpaySubscriptionId });
    await Subscription.updateOne(
      { _id: sub._id },
      {
        status: 'active',
        ...(periodEndUnix ? { currentPeriodEnd: new Date(periodEndUnix * 1000) } : {}),
      },
    );
    await Organization.updateOne(
      { _id: sub.organizationId },
      { plan: sub.plan, limits: PLAN_LIMITS[sub.plan] },
    );
    logger.info({ razorpaySubscriptionId, plan: sub.plan }, 'subscription activated');
    return { activated: true };
  },

  /** Super-admin manual plan change (support path) — always audited. */
  async setPlan(
    adminUserId: Types.ObjectId,
    organizationId: string,
    plan: Plan,
    reason: string,
  ): Promise<void> {
    const org = await Organization.findById(organizationId).lean();
    if (!org) throw new AppError('SYS_NOT_FOUND', 404);
    await Organization.updateOne({ _id: org._id }, { plan, limits: PLAN_LIMITS[plan] });
    await Subscription.findOneAndUpdate(
      { organizationId: org._id },
      { plan, status: 'active', seats: PLAN_LIMITS[plan].maxUsers },
      { upsert: true, setDefaultsOnInsert: true },
    );
    await AdminAudit.create({
      adminUserId,
      action: 'org.plan_changed',
      targetType: 'Organization',
      targetId: org._id,
      reason,
      meta: { from: org.plan, to: plan },
    });
  },

  /** Nightly §20.7 `subscription.usage_rollup` — meters every organization. */
  async rollupUsage(now: Date = new Date()): Promise<number> {
    const month = monthOf(now);
    const orgs = await Organization.find({}).select('_id').lean();
    for (const org of orgs) {
      const usage = await usageForOrg(org._id, month);
      await Subscription.findOneAndUpdate(
        { organizationId: org._id },
        { $set: { [`usage.${month}`]: { ...usage, rolledUpAt: now } } },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
    return orgs.length;
  },

  async usageForOrg(orgId: Types.ObjectId, month: string): Promise<OrgUsage> {
    return usageForOrg(orgId, month);
  },
};
