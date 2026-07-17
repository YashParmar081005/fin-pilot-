/**
 * Company + membership controllers (plan.md §5.2): parse, one service call,
 * serialise. The tenant context for :id routes is entered by
 * tenantResolve('param') before authorize() runs.
 */
import type { Request, Response } from 'express';
import type {
  AcceptInviteInput,
  CreateCompanyInput,
  InviteMemberInput,
  UpdateCompanyInput,
  UpdateMemberInput,
} from '@finpilot/shared';
import { requireCompanyContext } from '../plugins/tenantScope';
import { companyService } from '../services/companyService';
import { memberService } from '../services/memberService';
import { ok } from '../utils/respond';

function companyDto(company: Record<string, unknown>) {
  const { _id, ...rest } = company;
  return { id: String(_id), ...rest };
}

export const companyController = {
  async create(req: Request, res: Response) {
    const company = await companyService.create(req.user!.id, req.body as CreateCompanyInput);
    ok(res, { company: companyDto(company as never) }, 201);
  },

  async list(req: Request, res: Response) {
    const rows = await companyService.listForUser(req.user!.id);
    ok(res, {
      companies: rows.map((r) => ({
        ...companyDto(r.company as never),
        role: { key: r.roleKey, name: r.roleName },
      })),
    });
  },

  async get(req: Request, res: Response) {
    const company = await companyService.getForMember(req.user!.id, String(req.params.id));
    ok(res, { company: companyDto(company as never) });
  },

  async update(req: Request, res: Response) {
    const company = await companyService.update(
      String(req.params.id),
      req.body as UpdateCompanyInput,
    );
    ok(res, { company: companyDto(company as never) });
  },

  async inviteMember(req: Request, res: Response) {
    const ctx = requireCompanyContext();
    const result = await memberService.invite(
      { userId: String(ctx.userId), companyId: String(ctx.companyId) },
      req.body as InviteMemberInput,
    );
    ok(res, result, 201);
  },

  async listMembers(req: Request, res: Response) {
    const ctx = requireCompanyContext();
    ok(res, { members: await memberService.listMembers(String(ctx.companyId)) });
  },

  async updateMember(req: Request, res: Response) {
    const ctx = requireCompanyContext();
    await memberService.updateMember(
      { userId: String(ctx.userId), companyId: String(ctx.companyId) },
      String(req.params.userId),
      req.body as UpdateMemberInput,
    );
    ok(res, { updated: true });
  },

  async acceptInvite(req: Request, res: Response) {
    const result = await memberService.accept(req.user!.id, (req.body as AcceptInviteInput).token);
    ok(res, result);
  },
};
