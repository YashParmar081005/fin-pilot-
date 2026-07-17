/**
 * Account repository. All queries are tenant-scoped by the I8 plugin —
 * callers never pass companyId; it comes from request context.
 */
import type { ClientSession, Types } from 'mongoose';
import { Account, type AccountDoc } from '../models/Account';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const accountRepo = {
  create(data: Partial<AccountDoc>): Promise<AccountDoc> {
    return Account.create(data).then((d) => d.toObject());
  },

  findById(id: Types.ObjectId | string): Promise<AccountDoc | null> {
    return Account.findOne({ _id: id, deletedAt: null }).lean();
  },

  findByCode(code: string): Promise<AccountDoc | null> {
    return Account.findOne({ code, deletedAt: null }).lean();
  },

  list(): Promise<AccountDoc[]> {
    return Account.find({ deletedAt: null }).sort({ code: 1 }).lean();
  },

  count(): Promise<number> {
    return Account.countDocuments({ deletedAt: null });
  },

  hasChildren(id: Types.ObjectId): Promise<number> {
    return Account.countDocuments({ parentId: id, deletedAt: null });
  },

  /** Everything strictly under `path` — the subtree, excluding the node itself. */
  subtree(path: string): Promise<AccountDoc[]> {
    return Account.find({ path: new RegExp(`^${escapeRegex(path)}/`), deletedAt: null }).lean();
  },

  updateById(
    id: Types.ObjectId | string,
    patch: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<AccountDoc | null> {
    return Account.findOneAndUpdate({ _id: id }, patch, { new: true, session }).lean();
  },

  softDelete(id: Types.ObjectId | string): Promise<AccountDoc | null> {
    return Account.findOneAndUpdate(
      { _id: id },
      { deletedAt: new Date(), isActive: false },
      { new: true },
    ).lean();
  },

  existingCodes(codes: string[]): Promise<AccountDoc[]> {
    return Account.find({ code: { $in: codes } })
      .select('code')
      .lean();
  },
};
