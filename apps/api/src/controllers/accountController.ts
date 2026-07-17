import type { Request, Response } from 'express';
import type { CreateAccountInput, UpdateAccountInput } from '@finpilot/shared';
import { accountService } from '../services/accountService';
import { ok } from '../utils/respond';

function dto(account: Record<string, unknown>) {
  const { _id, companyId: _companyId, deletedAt: _deletedAt, __v: _v, ...rest } = account;
  return { id: String(_id), ...rest };
}

export const accountController = {
  async list(_req: Request, res: Response) {
    const accounts = await accountService.list();
    ok(res, { accounts: accounts.map((a) => dto(a as never)) });
  },

  async create(req: Request, res: Response) {
    const account = await accountService.create(req.body as CreateAccountInput);
    ok(res, { account: dto(account as never) }, 201);
  },

  async update(req: Request, res: Response) {
    const account = await accountService.update(
      String(req.params.id),
      req.body as UpdateAccountInput,
    );
    ok(res, { account: dto(account as never) });
  },

  async remove(req: Request, res: Response) {
    await accountService.remove(String(req.params.id));
    ok(res, { deleted: true });
  },

  async importTemplate(_req: Request, res: Response) {
    const result = await accountService.seedTemplate();
    ok(res, result, 201);
  },
};
