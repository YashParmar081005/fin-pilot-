/**
 * Items (plan.md §32 Phase 6): CRUD, bulk import, HSN digit sufficiency by
 * AATO (§14.3): > ₹5 Cr aggregate turnover requires 6-digit HSN.
 */
import { createItemSchema, type CreateItemInput, type UpdateItemInput } from '@finpilot/shared';
import type { ItemDoc } from '../models/Item';
import { accountRepo } from '../repositories/accountRepo';
import { companyRepo } from '../repositories/companyRepo';
import { itemRepo } from '../repositories/itemRepo';
import { requireCompanyContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';
import type { ImportResult } from './partyService';

const FIVE_CRORE_PAISE = 5_00_00_000 * 100; // ₹5 Cr in paise

async function assertHsnDigits(hsn: string | undefined): Promise<void> {
  if (!hsn) return;
  const ctx = requireCompanyContext();
  const company = await companyRepo.findById(ctx.companyId);
  if (company && company.aggregateTurnoverPaise > FIVE_CRORE_PAISE && hsn.length < 6) {
    throw new AppError('GST_HSN_DIGITS_INSUFFICIENT', 422, {
      required: 6,
      got: hsn.length,
      reason: 'aggregate turnover exceeds ₹5 crore (§14.3)',
    });
  }
}

export const itemService = {
  async create(input: CreateItemInput): Promise<ItemDoc> {
    await assertHsnDigits(input.hsn);
    const [income, expense, inventory] = await Promise.all([
      accountRepo.findByCode('4100'),
      accountRepo.findByCode('5110'),
      accountRepo.findByCode('1140'),
    ]);
    return itemRepo.create({
      ...input,
      incomeAccountId: income?._id ?? null,
      expenseAccountId: expense?._id ?? null,
      inventoryAccountId: input.trackInventory ? (inventory?._id ?? null) : null,
    });
  },

  list(filter: { kind?: 'goods' | 'service'; search?: string }): Promise<ItemDoc[]> {
    return itemRepo.list(filter);
  },

  async get(id: string): Promise<ItemDoc> {
    const item = await itemRepo.findById(id);
    if (!item) throw new AppError('SYS_NOT_FOUND', 404);
    return item;
  },

  async update(id: string, patch: UpdateItemInput): Promise<ItemDoc> {
    if (patch.hsn) await assertHsnDigits(patch.hsn);
    const item = await itemRepo.update(id, patch);
    if (!item) throw new AppError('SYS_NOT_FOUND', 404);
    return item;
  },

  async remove(id: string): Promise<void> {
    const item = await itemRepo.findById(id);
    if (!item) throw new AppError('SYS_NOT_FOUND', 404);
    await itemRepo.softDelete(id);
  },

  async import(rows: unknown[]): Promise<ImportResult> {
    const result: ImportResult = { created: 0, failed: [] };
    for (let i = 0; i < rows.length; i++) {
      const parsed = createItemSchema.safeParse(rows[i]);
      if (!parsed.success) {
        result.failed.push({ row: i + 1, errors: parsed.error.flatten() });
        continue;
      }
      try {
        await this.create(parsed.data);
        result.created += 1;
      } catch (err) {
        result.failed.push({ row: i + 1, errors: String(err) });
      }
    }
    return result;
  },
};
