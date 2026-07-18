/**
 * Parties (plan.md §32 Phase 6): CRUD, bulk import, snapshots. Control
 * accounts default to the seeded COA (1130 AR / 2110 AP) when present.
 */
import { createPartySchema, type CreatePartyInput, type UpdatePartyInput } from '@finpilot/shared';
import { partySnapshot, type PartyDoc, type PartySnapshot } from '../models/Party';
import { accountRepo } from '../repositories/accountRepo';
import { partyRepo } from '../repositories/partyRepo';
import { AppError } from '../utils/AppError';

export interface ImportResult {
  created: number;
  failed: Array<{ row: number; errors: unknown }>;
}

export const partyService = {
  async create(input: CreatePartyInput): Promise<PartyDoc> {
    const [ar, ap] = await Promise.all([
      accountRepo.findByCode('1130'),
      accountRepo.findByCode('2110'),
    ]);
    return partyRepo.create({
      ...input,
      receivableAccountId: ar?._id ?? null,
      payableAccountId: ap?._id ?? null,
    });
  },

  list(filter: { type?: 'customer' | 'vendor'; search?: string }): Promise<PartyDoc[]> {
    return partyRepo.list(filter);
  },

  async get(id: string): Promise<PartyDoc> {
    const party = await partyRepo.findById(id);
    if (!party) throw new AppError('SYS_NOT_FOUND', 404);
    return party;
  },

  async update(id: string, patch: UpdatePartyInput): Promise<PartyDoc> {
    const party = await partyRepo.update(id, patch);
    if (!party) throw new AppError('SYS_NOT_FOUND', 404);
    return party;
  },

  async remove(id: string): Promise<void> {
    const party = await partyRepo.findById(id);
    if (!party) throw new AppError('SYS_NOT_FOUND', 404);
    await partyRepo.softDelete(id);
  },

  async snapshot(id: string): Promise<PartySnapshot> {
    return partySnapshot(await this.get(id));
  },

  /** Bulk import — each row independently validated; partial success is fine. */
  async import(rows: unknown[]): Promise<ImportResult> {
    const result: ImportResult = { created: 0, failed: [] };
    for (let i = 0; i < rows.length; i++) {
      const parsed = createPartySchema.safeParse(rows[i]);
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
