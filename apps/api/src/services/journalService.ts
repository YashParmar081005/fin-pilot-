/**
 * Manual journal vouchers (plan.md §18.5). Owns the transaction boundary
 * (§5.2) — the engine does the posting; nothing else touches journalentries.
 */
import { Types } from 'mongoose';
import type { CreateJournalEntryInput } from '@finpilot/shared';
import { GeneralLedger, type LedgerPage } from '../engines/ledger/GeneralLedger';
import { JournalEntry, type JournalEntryDoc } from '../models/JournalEntry';

// the sole type gateway for callers — importing models/JournalEntry outside
// the engine/read-service trips the I3 sole-writer CI gate, types included
export type { JournalEntryDoc };
import { requireCompanyContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';
import { withTransaction } from '../utils/withTransaction';

export const journalService = {
  postManual(input: CreateJournalEntryInput): Promise<JournalEntryDoc> {
    const ctx = requireCompanyContext();
    return withTransaction((session) =>
      GeneralLedger.post(
        ctx.companyId,
        {
          date: input.date,
          narration: input.narration,
          source: { type: 'manual' },
          lines: input.lines.map((line) => ({
            accountId: line.accountId,
            debitPaise: line.debitPaise,
            creditPaise: line.creditPaise,
            description: line.description,
          })),
        },
        ctx.userId!,
        session,
      ),
    );
  },

  reverse(entryId: string, reason: string): Promise<JournalEntryDoc> {
    const ctx = requireCompanyContext();
    return withTransaction((session) =>
      GeneralLedger.reverse(ctx.companyId, entryId, reason, ctx.userId!, session),
    );
  },

  /** Day book — keyset pagination, never skip (§18.3). */
  async list(cursor?: string, limit = 50): Promise<LedgerPage & { entries: JournalEntryDoc[] }> {
    const filter: Record<string, unknown> = {};
    if (cursor) {
      const { d, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
        d: string;
        id: string;
      };
      filter.$or = [
        { date: { $lt: new Date(d) } },
        { date: new Date(d), _id: { $lt: new Types.ObjectId(id) } },
      ];
    }
    const entries = await JournalEntry.find(filter)
      .sort({ date: -1, _id: -1 })
      .limit(limit + 1)
      .lean();
    const hasMore = entries.length > limit;
    const page = entries.slice(0, limit);
    const last = page.at(-1);
    return {
      entries: page,
      rows: [],
      hasMore,
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({ d: last.date.toISOString(), id: String(last._id) }),
            ).toString('base64url')
          : null,
    };
  },

  async get(entryId: string): Promise<JournalEntryDoc> {
    const entry = await JournalEntry.findOne({ _id: entryId }).lean();
    if (!entry) throw new AppError('SYS_NOT_FOUND', 404);
    return entry;
  },
};
