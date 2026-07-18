import type { Types } from 'mongoose';
import { Item, type ItemDoc } from '../models/Item';

export const itemRepo = {
  create(data: Partial<ItemDoc>): Promise<ItemDoc> {
    return Item.create(data).then((d) => d.toObject());
  },

  findById(id: Types.ObjectId | string): Promise<ItemDoc | null> {
    return Item.findOne({ _id: id, deletedAt: null }).lean();
  },

  list(filter: { kind?: 'goods' | 'service'; search?: string } = {}): Promise<ItemDoc[]> {
    const query: Record<string, unknown> = { deletedAt: null };
    if (filter.kind) query.kind = filter.kind;
    if (filter.search) query.$text = { $search: filter.search };
    return Item.find(query).sort({ name: 1 }).limit(500).lean();
  },

  update(id: Types.ObjectId | string, patch: Record<string, unknown>): Promise<ItemDoc | null> {
    return Item.findOneAndUpdate({ _id: id, deletedAt: null }, patch, {
      new: true,
      runValidators: true,
    }).lean();
  },

  softDelete(id: Types.ObjectId | string): Promise<ItemDoc | null> {
    return Item.findOneAndUpdate({ _id: id }, { deletedAt: new Date() }, { new: true }).lean();
  },
};
