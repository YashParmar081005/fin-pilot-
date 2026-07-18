import type { Request, Response } from 'express';
import type { CreatePartyInput, ImportPartiesInput, UpdatePartyInput } from '@finpilot/shared';
import { partyService } from '../services/partyService';
import { ok } from '../utils/respond';

function dto(party: Record<string, unknown>) {
  const { _id, companyId: _c, deletedAt: _d, __v: _v, ...rest } = party;
  return { id: String(_id), ...rest };
}

export const partyController = {
  async list(req: Request, res: Response) {
    const type =
      req.query.type === 'customer' || req.query.type === 'vendor' ? req.query.type : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const parties = await partyService.list({ type, search });
    ok(res, { parties: parties.map((p) => dto(p as never)) });
  },

  async create(req: Request, res: Response) {
    const party = await partyService.create(req.body as CreatePartyInput);
    ok(res, { party: dto(party as never) }, 201);
  },

  async get(req: Request, res: Response) {
    ok(res, { party: dto((await partyService.get(String(req.params.id))) as never) });
  },

  async update(req: Request, res: Response) {
    const party = await partyService.update(String(req.params.id), req.body as UpdatePartyInput);
    ok(res, { party: dto(party as never) });
  },

  async remove(req: Request, res: Response) {
    await partyService.remove(String(req.params.id));
    ok(res, { deleted: true });
  },

  async import(req: Request, res: Response) {
    ok(res, await partyService.import((req.body as ImportPartiesInput).rows), 201);
  },
};
