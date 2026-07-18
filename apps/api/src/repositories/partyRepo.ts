import type { Types } from 'mongoose';
import { Party, type PartyDoc } from '../models/Party';

export const partyRepo = {
  create(data: Partial<PartyDoc>): Promise<PartyDoc> {
    return Party.create(data).then((d) => d.toObject());
  },

  findById(id: Types.ObjectId | string): Promise<PartyDoc | null> {
    return Party.findOne({ _id: id, deletedAt: null }).lean();
  },

  list(filter: { type?: 'customer' | 'vendor'; search?: string } = {}): Promise<PartyDoc[]> {
    const query: Record<string, unknown> = { deletedAt: null };
    if (filter.type) query.type = filter.type;
    if (filter.search) query.$text = { $search: filter.search };
    return Party.find(query).sort({ name: 1 }).limit(500).lean();
  },

  update(id: Types.ObjectId | string, patch: Record<string, unknown>): Promise<PartyDoc | null> {
    return Party.findOneAndUpdate({ _id: id, deletedAt: null }, patch, {
      new: true,
      runValidators: true,
    }).lean();
  },

  softDelete(id: Types.ObjectId | string): Promise<PartyDoc | null> {
    return Party.findOneAndUpdate({ _id: id }, { deletedAt: new Date() }, { new: true }).lean();
  },
};
