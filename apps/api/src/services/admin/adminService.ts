/**
 * Super-admin console (plan.md §2.1 "Manage platform tenants", §32 Phase 23).
 * Impersonation contract: IMPOSSIBLE without a written reason; every action
 * during it is tagged (session action log + X-Impersonation-* headers +
 * `impersonatedBy` on audit rows). Start/end are AdminAudit rows.
 */
import { Types } from 'mongoose';
import { AdminAudit } from '../../models/AdminAudit';
import { Company } from '../../models/Company';
import { ImpersonationSession } from '../../models/ImpersonationSession';
import { Organization } from '../../models/Organization';
import { Subscription } from '../../models/Subscription';
import { User } from '../../models/User';
import { signImpersonationToken } from '../../services/tokenService';
import { AppError } from '../../utils/AppError';
import { subscriptionService } from './subscriptionService';

const IMPERSONATION_TTL_SECONDS = 900; // 15 min — same as a normal access token

export const adminService = {
  async startImpersonation(
    adminUserId: Types.ObjectId,
    targetUserId: string,
    reason: string,
  ): Promise<{ token: string; sessionId: string; expiresInSeconds: number }> {
    const target = await User.findById(targetUserId).lean();
    if (!target) throw new AppError('SYS_NOT_FOUND', 404, { targetUserId });

    const session = await ImpersonationSession.create({
      adminUserId,
      targetUserId: target._id,
      reason,
    });
    await AdminAudit.create({
      adminUserId,
      action: 'impersonation.started',
      targetType: 'User',
      targetId: target._id,
      reason,
      meta: { sessionId: String(session._id), targetEmail: target.email },
    });
    return {
      token: signImpersonationToken(String(target._id), String(adminUserId), String(session._id)),
      sessionId: String(session._id),
      expiresInSeconds: IMPERSONATION_TTL_SECONDS,
    };
  },

  async endImpersonation(adminUserId: Types.ObjectId, sessionId: string): Promise<void> {
    const session = await ImpersonationSession.findOneAndUpdate(
      { _id: sessionId, adminUserId, endedAt: null },
      { endedAt: new Date() },
    ).lean();
    if (!session) throw new AppError('SYS_NOT_FOUND', 404, { sessionId });
    await AdminAudit.create({
      adminUserId,
      action: 'impersonation.ended',
      targetType: 'User',
      targetId: session.targetUserId,
      meta: { sessionId, actions: session.actions.length },
    });
  },

  async getImpersonationSession(sessionId: string) {
    return ImpersonationSession.findById(sessionId).lean();
  },

  /** Keyset-paginated org list for the console. Never `skip` (§ CLAUDE.md). */
  async listOrganizations(cursor?: string, limit = 50) {
    const filter = cursor ? { _id: { $gt: new Types.ObjectId(cursor) } } : {};
    const orgs = await Organization.find(filter).sort({ _id: 1 }).limit(limit).lean();
    const orgIds = orgs.map((o) => o._id);
    const [subs, companies] = await Promise.all([
      Subscription.find({ organizationId: { $in: orgIds } }).lean(),
      Company.find({ organizationId: { $in: orgIds } })
        .select('organizationId')
        .lean(),
    ]);
    const subByOrg = new Map(subs.map((s) => [String(s.organizationId), s]));
    const companyCount = new Map<string, number>();
    for (const c of companies) {
      const key = String(c.organizationId);
      companyCount.set(key, (companyCount.get(key) ?? 0) + 1);
    }
    return {
      organizations: orgs.map((o) => ({
        id: String(o._id),
        name: o.name,
        type: o.type,
        plan: o.plan,
        limits: o.limits,
        companies: companyCount.get(String(o._id)) ?? 0,
        subscriptionStatus: subByOrg.get(String(o._id))?.status ?? 'active',
        createdAt: o.createdAt,
      })),
      nextCursor: orgs.length === limit ? String(orgs[orgs.length - 1]!._id) : null,
    };
  },

  async getOrganization(id: string) {
    const org = await Organization.findById(id).lean();
    if (!org) throw new AppError('SYS_NOT_FOUND', 404);
    const month = new Date().toISOString().slice(0, 7);
    const [companies, subscription, usage] = await Promise.all([
      Company.find({ organizationId: org._id }).select('legalName gstin stateCode').lean(),
      Subscription.findOne({ organizationId: org._id }).lean(),
      subscriptionService.usageForOrg(org._id, month),
    ]);
    return {
      id: String(org._id),
      name: org.name,
      type: org.type,
      plan: org.plan,
      limits: org.limits,
      companies: companies.map((c) => ({
        id: String(c._id),
        legalName: c.legalName,
        gstin: c.gstin ?? null,
        stateCode: c.stateCode,
      })),
      subscription: subscription
        ? {
            status: subscription.status,
            razorpaySubscriptionId: subscription.razorpaySubscriptionId ?? null,
            currentPeriodEnd: subscription.currentPeriodEnd ?? null,
          }
        : null,
      usage: { month, ...usage },
    };
  },
};
