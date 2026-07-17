/**
 * Chart-of-accounts service (plan.md §32 Phase 4).
 * Owns the materialised path: '/1000/1100' of codes, depth = segments − 1.
 * Reparenting rewrites the whole subtree inside a transaction.
 */
import mongoose, { Types } from 'mongoose';
import type { CreateAccountInput, UpdateAccountInput } from '@finpilot/shared';
import type { AccountDoc } from '../models/Account';
import { accountRepo } from '../repositories/accountRepo';
import { AppError } from '../utils/AppError';
import { INDIAN_SME_COA } from './coa/indianSmeCoa';

export const accountService = {
  async list(): Promise<AccountDoc[]> {
    return accountRepo.list();
  },

  async create(input: CreateAccountInput): Promise<AccountDoc> {
    let path = `/${input.code}`;
    let depth = 0;
    let parentId: Types.ObjectId | null = null;

    if (input.parentId) {
      const parent = await accountRepo.findById(input.parentId);
      if (!parent) throw new AppError('COA_PARENT_NOT_FOUND', 404);
      parentId = parent._id;
      path = `${parent.path}/${input.code}`;
      depth = parent.depth + 1;
    }

    return accountRepo.create({
      code: input.code,
      name: input.name,
      type: input.type,
      subType: input.subType,
      parentId,
      path,
      depth,
      gstRate: input.gstRate ?? null,
      isSystem: false,
    });
  },

  async update(id: string, patch: UpdateAccountInput): Promise<AccountDoc> {
    const account = await accountRepo.findById(id);
    if (!account) throw new AppError('SYS_NOT_FOUND', 404);

    // reparenting restructures the tree — system accounts are anchored (§32:
    // "a system account cannot be deleted"; restructuring is the same hazard)
    if (patch.parentId !== undefined && account.isSystem) {
      throw new AppError('COA_SYSTEM_ACCOUNT_IMMUTABLE', 403);
    }

    const simple: Record<string, unknown> = {};
    if (patch.name !== undefined) simple.name = patch.name;
    if (patch.isActive !== undefined) simple.isActive = patch.isActive;
    if (patch.gstRate !== undefined) simple.gstRate = patch.gstRate;

    if (patch.parentId === undefined) {
      const updated = await accountRepo.updateById(id, simple);
      return updated!;
    }

    return this.reparent(account, patch.parentId, simple);
  },

  /**
   * Moves `account` (and its whole subtree) under `newParentId` (null → root).
   * Path/depth of every descendant are rewritten in one transaction, so a
   * crash cannot leave the tree half-moved.
   */
  async reparent(
    account: AccountDoc,
    newParentId: string | null,
    extraPatch: Record<string, unknown> = {},
  ): Promise<AccountDoc> {
    let newPath = `/${account.code}`;
    let newDepth = 0;
    let parentId: Types.ObjectId | null = null;

    if (newParentId) {
      const parent = await accountRepo.findById(newParentId);
      if (!parent) throw new AppError('COA_PARENT_NOT_FOUND', 404);
      // no cycles: the new parent must not live inside the moving subtree
      if (parent.path === account.path || parent.path.startsWith(`${account.path}/`)) {
        throw new AppError('COA_REPARENT_CYCLE', 422);
      }
      parentId = parent._id;
      newPath = `${parent.path}/${account.code}`;
      newDepth = parent.depth + 1;
    }

    const descendants = await accountRepo.subtree(account.path);
    const depthDelta = newDepth - account.depth;

    const session = await mongoose.startSession();
    try {
      let updated: AccountDoc | null = null;
      await session.withTransaction(async () => {
        updated = await accountRepo.updateById(
          account._id,
          { ...extraPatch, parentId, path: newPath, depth: newDepth },
          session,
        );
        for (const child of descendants) {
          await accountRepo.updateById(
            child._id,
            {
              path: child.path.replace(account.path, newPath),
              depth: child.depth + depthDelta,
            },
            session,
          );
        }
      });
      return updated!;
    } finally {
      await session.endSession();
    }
  },

  async remove(id: string): Promise<void> {
    const account = await accountRepo.findById(id);
    if (!account) throw new AppError('SYS_NOT_FOUND', 404);
    if (account.isSystem) throw new AppError('COA_SYSTEM_ACCOUNT_IMMUTABLE', 403);
    if ((await accountRepo.hasChildren(account._id)) > 0) {
      throw new AppError('COA_HAS_CHILDREN', 409);
    }
    // Soft delete (§8.2) — never on journalentries, fine on accounts.
    // Once the ledger exists (Phase 5), deletion will additionally require
    // a zero balance and no postings.
    await accountRepo.softDelete(id);
  },

  /** Seeds the 60-account Indian SME template. Idempotent: fills gaps only. */
  async seedTemplate(): Promise<{ created: number; existing: number }> {
    const existing = await accountRepo.existingCodes(INDIAN_SME_COA.map((r) => r.code));
    const have = new Set(existing.map((a) => a.code));

    const byCode = new Map<string, AccountDoc>();
    for (const acc of await accountRepo.list()) byCode.set(acc.code, acc);

    let created = 0;
    // template is ordered parents-first, so a single pass resolves every parent
    for (const row of INDIAN_SME_COA) {
      if (have.has(row.code)) continue;
      const parent = row.parentCode ? byCode.get(row.parentCode) : null;
      if (row.parentCode && !parent) {
        throw new AppError('COA_PARENT_NOT_FOUND', 500, { code: row.code });
      }
      const doc = await accountRepo.create({
        code: row.code,
        name: row.name,
        type: row.type,
        subType: row.subType,
        parentId: parent?._id ?? null,
        path: parent ? `${parent.path}/${row.code}` : `/${row.code}`,
        depth: parent ? parent.depth + 1 : 0,
        isSystem: true,
      });
      byCode.set(row.code, doc);
      created += 1;
    }
    return { created, existing: have.size };
  },
};
