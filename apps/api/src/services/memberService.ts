/**
 * Membership + invite flow (plan.md §17.3):
 * an invite creates Membership{status:'invited'} + a signed token; accepting
 * requires the invitee to AUTHENTICATE first — a bare token never grants
 * access to books.
 */
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import type { InviteMemberInput, UpdateMemberInput } from '@finpilot/shared';
import { getEnv } from '../config/env';
import { companyRepo } from '../repositories/companyRepo';
import { membershipRepo } from '../repositories/membershipRepo';
import { roleRepo } from '../repositories/roleRepo';
import { userRepo } from '../repositories/userRepo';
import { AppError } from '../utils/AppError';
import { subscriptionService } from './admin/subscriptionService';
import { sendMail } from './mailService';
import { permissionCache } from './permissionCache';

const INVITE_TTL = '7d';

interface InviteClaims {
  typ: 'invite';
  email: string;
  companyId: string;
  roleId: string;
  invitedBy: string;
}

export const memberService = {
  async invite(
    inviter: { userId: string; companyId: string },
    input: InviteMemberInput,
  ): Promise<{ invitedEmail: string; roleKey: string; userExists: boolean }> {
    const company = await companyRepo.findById(inviter.companyId);
    if (!company) throw new AppError('SYS_NOT_FOUND', 404);

    // §32 Phase 23: seats are an org-level plan limit — 402 + upgrade path
    await subscriptionService.assertSeatQuota(company.organizationId);

    // 'owner' is org-level and never invitable — enforced by the Zod enum
    // too, but the service is the authority.
    const role = await roleRepo.findByKey(company.organizationId, input.roleKey);
    if (!role || role.key === 'owner') {
      throw new AppError('AUTH_FORBIDDEN', 403, { reason: 'role not invitable' });
    }

    const invitee = await userRepo.findByEmail(input.email);
    if (invitee) {
      const existing = await membershipRepo.find(invitee._id, company._id);
      if (existing && existing.status !== 'invited') {
        throw new AppError('TENANT_ALREADY_A_MEMBER', 409);
      }
      if (!existing) {
        await membershipRepo.create({
          userId: invitee._id,
          companyId: company._id,
          roleId: role._id,
          status: 'invited',
          invitedBy: new Types.ObjectId(inviter.userId),
        });
      }
    }
    // If no account exists yet, the membership is created at accept time —
    // the invite email tells them to register first.

    const token = jwt.sign(
      {
        typ: 'invite',
        email: input.email,
        companyId: String(company._id),
        roleId: String(role._id),
        invitedBy: inviter.userId,
      } satisfies InviteClaims,
      getEnv().JWT_ACCESS_SECRET,
      { expiresIn: INVITE_TTL },
    );

    await sendMail({
      to: input.email,
      subject: `You've been invited to ${company.legalName} on FinPilot`,
      text: [
        `You've been invited to join ${company.legalName} as ${role.name}.`,
        '',
        `Accept: ${getEnv().APP_URL}/invites/accept?token=${token}`,
        '',
        'You need a FinPilot account with this email address to accept. The invite expires in 7 days.',
      ].join('\n'),
    });

    return { invitedEmail: input.email, roleKey: role.key, userExists: Boolean(invitee) };
  },

  /** The caller must be authenticated; the token alone grants nothing. */
  async accept(userId: string, token: string): Promise<{ companyId: string }> {
    let claims: InviteClaims;
    try {
      claims = jwt.verify(token, getEnv().JWT_ACCESS_SECRET) as InviteClaims;
      if (claims.typ !== 'invite') throw new Error('wrong token type');
    } catch {
      throw new AppError('TENANT_INVITE_INVALID', 401);
    }

    const user = await userRepo.findById(userId);
    if (!user) throw new AppError('AUTH_UNAUTHORIZED', 401);
    if (user.email !== claims.email) {
      throw new AppError('AUTH_FORBIDDEN', 403, { reason: 'invite was issued to another email' });
    }

    const companyId = new Types.ObjectId(claims.companyId);
    const roleId = new Types.ObjectId(claims.roleId);

    const existing = await membershipRepo.find(user._id, companyId);
    if (existing?.status === 'active') throw new AppError('TENANT_ALREADY_A_MEMBER', 409);

    if (existing) {
      await membershipRepo.activate(existing._id, roleId);
    } else {
      await membershipRepo.create({
        userId: user._id,
        companyId,
        roleId,
        status: 'active',
        invitedBy: new Types.ObjectId(claims.invitedBy),
        acceptedAt: new Date(),
      });
    }

    await permissionCache.invalidate(userId, claims.companyId);
    return { companyId: claims.companyId };
  },

  async listMembers(companyId: string) {
    const memberships = await membershipRepo.listForCompany(companyId);
    const result = [];
    for (const m of memberships) {
      const [user, role] = await Promise.all([
        userRepo.findById(m.userId),
        roleRepo.findById(m.roleId),
      ]);
      result.push({
        userId: String(m.userId),
        name: user?.name ?? null,
        email: user?.email ?? null,
        roleKey: role?.key ?? null,
        roleName: role?.name ?? null,
        status: m.status,
        acceptedAt: m.acceptedAt,
      });
    }
    return result;
  },

  /**
   * Role/status change. Invalidates the permission cache immediately —
   * Phase 3 "Done when": takes effect within one second.
   */
  async updateMember(
    actor: { userId: string; companyId: string },
    targetUserId: string,
    patch: UpdateMemberInput,
  ): Promise<void> {
    const company = await companyRepo.findById(actor.companyId);
    if (!company) throw new AppError('SYS_NOT_FOUND', 404);

    const target = await membershipRepo.find(targetUserId, actor.companyId);
    if (!target) throw new AppError('SYS_NOT_FOUND', 404);

    const targetRole = await roleRepo.findById(target.roleId);
    if (targetRole?.key === 'owner') {
      throw new AppError('AUTH_FORBIDDEN', 403, { reason: 'the org owner cannot be modified' });
    }

    const update: { roleId?: Types.ObjectId; status?: 'active' | 'suspended' } = {};
    if (patch.roleKey) {
      const role = await roleRepo.findByKey(company.organizationId, patch.roleKey);
      if (!role) throw new AppError('SYS_NOT_FOUND', 404, { roleKey: patch.roleKey });
      update.roleId = role._id;
    }
    if (patch.status) update.status = patch.status;

    await membershipRepo.update(targetUserId, actor.companyId, update);
    await permissionCache.invalidate(targetUserId, actor.companyId);
  },
};
