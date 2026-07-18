import type { Request, Response } from 'express';
import type { CreateItemInput, ImportItemsInput, UpdateItemInput } from '@finpilot/shared';
import { itemService } from '../services/itemService';
import { ok } from '../utils/respond';

function dto(item: Record<string, unknown>) {
  const { _id, companyId: _c, deletedAt: _d, __v: _v, ...rest } = item;
  return { id: String(_id), ...rest };
}

export const itemController = {
  async list(req: Request, res: Response) {
    const kind =
      req.query.kind === 'goods' || req.query.kind === 'service' ? req.query.kind : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const items = await itemService.list({ kind, search });
    ok(res, { items: items.map((i) => dto(i as never)) });
  },

  async create(req: Request, res: Response) {
    const item = await itemService.create(req.body as CreateItemInput);
    ok(res, { item: dto(item as never) }, 201);
  },

  async get(req: Request, res: Response) {
    ok(res, { item: dto((await itemService.get(String(req.params.id))) as never) });
  },

  async update(req: Request, res: Response) {
    const item = await itemService.update(String(req.params.id), req.body as UpdateItemInput);
    ok(res, { item: dto(item as never) });
  },

  async remove(req: Request, res: Response) {
    await itemService.remove(String(req.params.id));
    ok(res, { deleted: true });
  },

  async import(req: Request, res: Response) {
    ok(res, await itemService.import((req.body as ImportItemsInput).rows), 201);
  },
};
