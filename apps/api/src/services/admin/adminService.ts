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
import { Invoice } from '../../models/Invoice';
import { Bill } from '../../models/Bill';
import { Membership } from '../../models/Membership';
import { sessionRepo } from '../../repositories/sessionRepo';
import { hashPassword } from '../passwordService';
import { invalidateModuleCache } from '../../middleware/requireModule';
import { MODULE_KEYS } from '@finpilot/shared';
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

  /**
   * Everything below reads ACROSS tenants, which is the whole point of a
   * platform console — so these queries opt out of the tenant plugin with
   * `skipTenantScope`. That escape hatch is greppable and CI only tolerates it
   * in this directory (plus the plugin, engines, jobs and migrations), which is
   * why the cross-tenant reads live here rather than in a controller.
   */
  async overview() {
    const [orgs, companies, users, disabledUsers] = await Promise.all([
      Organization.countDocuments({}),
      Company.countDocuments({}),
      User.countDocuments({}),
      User.countDocuments({ disabledAt: { $ne: null } }),
    ]);
    // No journal-entry count here on purpose: CI enforces I3 by restricting
    // which modules may even import the JournalEntry model, and the admin
    // console is deliberately not one of them. A vanity number on an overview
    // screen is not worth widening that list.
    const [invoices, bills] = await Promise.all([
      Invoice.countDocuments({}).setOptions({ skipTenantScope: true }),
      Bill.countDocuments({}).setOptions({ skipTenantScope: true }),
    ]);
    const byPlan = await Organization.aggregate([
      { $group: { _id: '$plan', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const companiesWithDisabled = await Company.countDocuments({
      disabledModules: { $exists: true, $ne: [] },
    });
    return {
      organizations: orgs,
      companies,
      users,
      disabledUsers,
      invoices,
      bills,
      companiesWithDisabledSections: companiesWithDisabled,
      plans: byPlan.map((row: { _id: string; count: number }) => ({
        plan: row._id,
        count: row.count,
      })),
    };
  },

  /** Every company on the platform, newest first. Keyset, never skip. */
  async listCompanies(cursor?: string, q?: string, limit = 50) {
    const filter: Record<string, unknown> = {};
    if (cursor) filter._id = { $lt: new Types.ObjectId(cursor) };
    if (q && q.trim()) filter.legalName = { $regex: q.trim(), $options: 'i' };

    const companies = await Company.find(filter).sort({ _id: -1 }).limit(limit).lean();
    const orgIds = [...new Set(companies.map((c) => String(c.organizationId)))];
    const orgs = await Organization.find({ _id: { $in: orgIds } })
      .select('name plan')
      .lean();
    const orgById = new Map(orgs.map((o) => [String(o._id), o]));

    return {
      companies: companies.map((c) => ({
        id: String(c._id),
        legalName: c.legalName,
        gstin: c.gstin ?? null,
        stateCode: c.stateCode,
        organizationId: String(c.organizationId),
        organizationName: orgById.get(String(c.organizationId))?.name ?? '-',
        plan: orgById.get(String(c.organizationId))?.plan ?? '-',
        disabledModules: c.disabledModules ?? [],
        createdAt: c.createdAt,
      })),
      nextCursor: companies.length === limit ? String(companies[companies.length - 1]!._id) : null,
    };
  },

  async getCompany(id: string) {
    const company = await Company.findById(id).lean();
    if (!company) throw new AppError('SYS_NOT_FOUND', 404);
    const org = await Organization.findById(company.organizationId).lean();
    const scoped = { skipTenantScope: true };
    const [invoices, bills, members] = await Promise.all([
      Invoice.countDocuments({ companyId: company._id }).setOptions(scoped),
      Bill.countDocuments({ companyId: company._id }).setOptions(scoped),
      Membership.find({ companyId: company._id }).lean(),
    ]);
    const users = await User.find({ _id: { $in: members.map((m) => m.userId) } })
      .select('email name disabledAt')
      .lean();

    return {
      id: String(company._id),
      legalName: company.legalName,
      gstin: company.gstin ?? null,
      stateCode: company.stateCode,
      booksBeginDate: company.booksBeginDate,
      disabledModules: company.disabledModules ?? [],
      organization: org ? { id: String(org._id), name: org.name, plan: org.plan } : null,
      stats: { invoices, bills, members: members.length },
      members: users.map((u) => ({
        id: String(u._id),
        email: u.email,
        name: u.name,
        disabled: Boolean(u.disabledAt),
      })),
    };
  },

  /**
   * Switch sections on or off for one company. Stores the DISABLED list, so an
   * empty array means everything is on — and a module added to the product
   * later is on by default rather than silently missing for everyone.
   */
  async setCompanyModules(
    adminUserId: Types.ObjectId,
    companyId: string,
    disabledModules: string[],
    reason: string,
  ) {
    const unknown = disabledModules.filter((m) => !MODULE_KEYS.includes(m));
    if (unknown.length > 0) throw new AppError('SYS_VALIDATION_FAILED', 422, { unknown });

    const company = await Company.findByIdAndUpdate(
      companyId,
      { disabledModules: [...new Set(disabledModules)] },
      { new: true },
    ).lean();
    if (!company) throw new AppError('SYS_NOT_FOUND', 404);

    // the gate caches per company for a few seconds; drop it so a toggle takes
    // effect while the operator is still looking at the screen
    invalidateModuleCache(String(company._id));

    await AdminAudit.create({
      adminUserId,
      action: 'company.modules_changed',
      targetType: 'Company',
      targetId: company._id,
      reason,
      meta: { disabledModules: company.disabledModules, legalName: company.legalName },
    });
    return { id: String(company._id), disabledModules: company.disabledModules ?? [] };
  },

  async listUsers(cursor?: string, q?: string, limit = 50) {
    const filter: Record<string, unknown> = {};
    if (cursor) filter._id = { $lt: new Types.ObjectId(cursor) };
    if (q && q.trim()) filter.email = { $regex: q.trim(), $options: 'i' };

    const users = await User.find(filter)
      .select('email name disabledAt lastLoginAt superAdmin createdAt')
      .sort({ _id: -1 })
      .limit(limit)
      .lean();
    const memberships = await Membership.find({ userId: { $in: users.map((u) => u._id) } }).lean();
    const countByUser = new Map<string, number>();
    for (const m of memberships) {
      const key = String(m.userId);
      countByUser.set(key, (countByUser.get(key) ?? 0) + 1);
    }
    return {
      users: users.map((u) => ({
        id: String(u._id),
        email: u.email,
        name: u.name,
        disabled: Boolean(u.disabledAt),
        superAdmin: u.superAdmin === true,
        companies: countByUser.get(String(u._id)) ?? 0,
        lastLoginAt: u.lastLoginAt ?? null,
        createdAt: u.createdAt,
      })),
      nextCursor: users.length === limit ? String(users[users.length - 1]!._id) : null,
    };
  },

  /**
   * Disabling revokes every session as well as setting the flag: login and
   * refresh both refuse a disabled account, so the only access that survives is
   * an access token already in flight, for at most its 15-minute life.
   * A platform operator cannot be disabled here - that flag is ops-only.
   */
  async setUserStatus(
    adminUserId: Types.ObjectId,
    userId: string,
    disabled: boolean,
    reason: string,
  ) {
    const user = await User.findById(userId).select('+superAdmin').lean();
    if (!user) throw new AppError('SYS_NOT_FOUND', 404);
    if (user.superAdmin === true && disabled) {
      throw new AppError('AUTH_FORBIDDEN', 403, { reason: 'cannot disable a platform operator' });
    }
    if (String(user._id) === String(adminUserId)) {
      throw new AppError('AUTH_FORBIDDEN', 403, { reason: 'cannot disable yourself' });
    }

    await User.updateOne({ _id: user._id }, { disabledAt: disabled ? new Date() : null });
    if (disabled) await sessionRepo.revokeAllForUser(user._id, 'admin');

    await AdminAudit.create({
      adminUserId,
      action: disabled ? 'user.disabled' : 'user.enabled',
      targetType: 'User',
      targetId: user._id,
      reason,
      meta: { email: user.email },
    });
    return { id: String(user._id), email: user.email, disabled };
  },

  /** What operators have done, newest first - the console's own audit trail. */
  async listAudit(cursor?: string, limit = 50) {
    const filter = cursor ? { _id: { $lt: new Types.ObjectId(cursor) } } : {};
    const rows = await AdminAudit.find(filter).sort({ _id: -1 }).limit(limit).lean();
    const admins = await User.find({ _id: { $in: rows.map((r) => r.adminUserId) } })
      .select('email')
      .lean();
    const emailById = new Map(admins.map((a) => [String(a._id), a.email]));
    return {
      audit: rows.map((r) => ({
        id: String(r._id),
        action: r.action,
        adminEmail: emailById.get(String(r.adminUserId)) ?? '-',
        targetType: r.targetType,
        targetId: String(r.targetId),
        reason: r.reason ?? null,
        meta: r.meta ?? {},
        at: r.at,
      })),
      nextCursor: rows.length === limit ? String(rows[rows.length - 1]!._id) : null,
    };
  },

  /**
   * Platform operators are their own accounts, not customers wearing a second
   * hat: an operator may hold no company membership, and a user who belongs to
   * a company may not be promoted. Keeping the two apart is what stops "I was
   * only checking my own books" and "I was operating the platform" from being
   * the same session.
   *
   * The very first operator is made by the admin:grant script, out of band. If
   * the console could mint the first one, compromising any account would be
   * enough to take the platform.
   */
  async listOperators() {
    const operators = await User.find({ superAdmin: true })
      .select('email name disabledAt lastLoginAt createdAt')
      .sort({ _id: 1 })
      .lean();
    // An operator holding memberships is a rule violation from before the
    // accounts were separated; surface it rather than hide it.
    const memberships = await Membership.find({
      userId: { $in: operators.map((o) => o._id) },
    }).lean();
    const memberCount = new Map<string, number>();
    for (const m of memberships) {
      const key = String(m.userId);
      memberCount.set(key, (memberCount.get(key) ?? 0) + 1);
    }
    return {
      operators: operators.map((o) => ({
        id: String(o._id),
        email: o.email,
        name: o.name,
        disabled: Boolean(o.disabledAt),
        lastLoginAt: o.lastLoginAt ?? null,
        createdAt: o.createdAt,
        companyMemberships: memberCount.get(String(o._id)) ?? 0,
      })),
    };
  },

  async createOperator(
    adminUserId: Types.ObjectId,
    input: { email: string; name: string; password: string },
    reason: string,
  ) {
    const email = input.email.trim().toLowerCase();
    const existing = await User.findOne({ email }).select('+superAdmin').lean();

    if (existing) {
      if (existing.superAdmin === true) {
        throw new AppError('SYS_DUPLICATE_KEY', 409, { reason: 'already an operator' });
      }
      // Promoting an existing customer would blur the two roles, which is the
      // thing separate operator accounts exist to prevent.
      const memberships = await Membership.countDocuments({ userId: existing._id });
      if (memberships > 0) {
        throw new AppError('AUTH_FORBIDDEN', 403, {
          reason: 'that account belongs to a company; operators may not be customers',
        });
      }
      await User.updateOne({ _id: existing._id }, { superAdmin: true, disabledAt: null });
      await AdminAudit.create({
        adminUserId,
        action: 'operator.promoted',
        targetType: 'User',
        targetId: existing._id,
        reason,
        meta: { email },
      });
      return { id: String(existing._id), email, created: false };
    }

    const user = await User.create({
      email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      superAdmin: true,
      // An operator account is created by another operator, so there is nobody
      // to send a verification mail to but the operator themselves.
      emailVerifiedAt: new Date(),
    });
    await AdminAudit.create({
      adminUserId,
      action: 'operator.created',
      targetType: 'User',
      targetId: user._id,
      reason,
      meta: { email },
    });
    return { id: String(user._id), email, created: true };
  },

  /** Take the flag away. The account survives; it just stops being an operator. */
  async revokeOperator(adminUserId: Types.ObjectId, userId: string, reason: string) {
    if (String(userId) === String(adminUserId)) {
      throw new AppError('AUTH_FORBIDDEN', 403, { reason: 'cannot revoke yourself' });
    }
    const user = await User.findById(userId).select('+superAdmin').lean();
    if (!user) throw new AppError('SYS_NOT_FOUND', 404);
    if (user.superAdmin !== true) throw new AppError('SYS_NOT_FOUND', 404);

    const remaining = await User.countDocuments({ superAdmin: true, disabledAt: null });
    if (remaining <= 1) {
      throw new AppError('AUTH_FORBIDDEN', 403, {
        reason: 'that is the last active operator; the platform would be unreachable',
      });
    }

    await User.updateOne({ _id: user._id }, { superAdmin: false });
    await sessionRepo.revokeAllForUser(user._id, 'admin');
    await AdminAudit.create({
      adminUserId,
      action: 'operator.revoked',
      targetType: 'User',
      targetId: user._id,
      reason,
      meta: { email: user.email },
    });
    return { id: String(user._id), email: user.email };
  },

  /** Who am I, for the portal's own header and guard. */
  async me(userId: string) {
    const user = await User.findById(userId).select('email name superAdmin').lean();
    if (!user) throw new AppError('SYS_NOT_FOUND', 404);
    return {
      id: String(user._id),
      email: user.email,
      name: user.name,
      operator: user.superAdmin === true,
    };
  },
};
