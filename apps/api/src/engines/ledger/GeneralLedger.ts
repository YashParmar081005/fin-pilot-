/**
 * Engine 1 — The General Ledger (plan.md §12).
 *
 * SOLE WRITER to `journalentries` (I3): no controller, no other service, no
 * script writes that collection. Four public methods; that is the whole
 * engine. post() follows the §12.1 sequence exactly — everything in one
 * transaction, or nothing.
 */
import { Types, type ClientSession } from 'mongoose';
import { normalBalance } from '@finpilot/shared';
import { Account, type AccountDoc } from '../../models/Account';
import { AuditLog } from '../../models/AuditLog';
import { Company } from '../../models/Company';
import { nextNumber } from '../../models/Counter';
import {
  JournalEntry,
  type JournalEntryDoc,
  type JournalSourceType,
} from '../../models/JournalEntry';
import { OutboxEvent } from '../../models/OutboxEvent';
import { AppError } from '../../utils/AppError';
import { financialYear } from '../../utils/financialYear';

export interface JournalLineDraft {
  accountId: Types.ObjectId | string;
  debitPaise?: number;
  creditPaise?: number;
  description?: string;
  partyId?: Types.ObjectId | string;
  itemId?: Types.ObjectId | string;
  costCenter?: string;
  project?: string;
  gst?: {
    rate?: number | null;
    taxablePaise?: number | null;
    hsn?: string;
    component?: 'cgst' | 'sgst' | 'igst' | 'cess' | null;
  };
}

export interface JournalEntryDraft {
  date: Date;
  narration: string;
  source: {
    type: JournalSourceType;
    documentId?: Types.ObjectId | string;
    documentModel?: string;
  };
  lines: JournalLineDraft[];
  /** Set only by reverse() — stamped at insert time; immutable afterwards. */
  reversesEntryId?: Types.ObjectId;
}

export interface TrialBalanceRow {
  accountId: Types.ObjectId;
  code: string;
  name: string;
  type: AccountDoc['type'];
  debitPaise: number;
  creditPaise: number;
  balancePaise: number;
}

export interface LedgerPageRow {
  entryId: string;
  entryNumber: string;
  date: Date;
  narration: string;
  status: string;
  debitPaise: number;
  creditPaise: number;
}

export interface LedgerPage {
  rows: LedgerPageRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Signed delta a line applies to an account's natural balance. */
function balanceDelta(type: AccountDoc['type'], debitPaise: number, creditPaise: number): number {
  return normalBalance(type) === 'debit' ? debitPaise - creditPaise : creditPaise - debitPaise;
}

export const GeneralLedger = {
  /** The ONLY way a row enters `journalentries` (§12.1, steps 1–13). */
  async post(
    companyId: Types.ObjectId | string,
    draft: JournalEntryDraft,
    actor: Types.ObjectId | string,
    session: ClientSession,
  ): Promise<JournalEntryDoc> {
    // 1 — never post outside a transaction
    if (!session.inTransaction()) throw new AppError('LEDGER_NO_TRANSACTION', 500);

    const company = await Company.findById(companyId).session(session).lean();
    if (!company) throw new AppError('SYS_NOT_FOUND', 404, { companyId: String(companyId) });

    // 2 — date must be on/after the books begin date
    if (draft.date < company.booksBeginDate) {
      throw new AppError('LEDGER_BEFORE_BOOKS_BEGIN', 422, {
        date: draft.date.toISOString(),
        booksBeginDate: company.booksBeginDate.toISOString(),
      });
    }
    // 3 — locked period
    if (company.booksLockedUpto && draft.date <= company.booksLockedUpto) {
      throw new AppError('LEDGER_PERIOD_LOCKED', 409, {
        booksLockedUpto: company.booksLockedUpto.toISOString(),
      });
    }
    // 4 — at least two lines
    if (!draft.lines || draft.lines.length < 2) throw new AppError('LEDGER_MIN_TWO_LINES', 422);

    // 5 — each line: XOR(debit, credit), integer, >= 0
    for (const line of draft.lines) {
      const d = line.debitPaise ?? 0;
      const c = line.creditPaise ?? 0;
      if (!Number.isInteger(d) || !Number.isInteger(c)) {
        throw new AppError('LEDGER_NON_INTEGER_PAISE', 422, { line });
      }
      if (d < 0 || c < 0) throw new AppError('LEDGER_NEGATIVE_AMOUNT', 422, { line });
      if (d > 0 === c > 0) throw new AppError('LEDGER_LINE_MUST_BE_DR_XOR_CR', 422, { line });
    }

    // 6 — I2: the entry balances
    const totalDebit = draft.lines.reduce((s, l) => s + (l.debitPaise ?? 0), 0);
    const totalCredit = draft.lines.reduce((s, l) => s + (l.creditPaise ?? 0), 0);
    if (totalDebit !== totalCredit) {
      throw new AppError('LEDGER_UNBALANCED', 422, { debit: totalDebit, credit: totalCredit });
    }
    if (totalDebit === 0) throw new AppError('LEDGER_ZERO_ENTRY', 422);

    // 7 — every account exists, is active, belongs to this company (one $in)
    const accountIds = [...new Set(draft.lines.map((l) => String(l.accountId)))];
    const accounts = await Account.find({
      _id: { $in: accountIds.map((id) => new Types.ObjectId(id)) },
      companyId: new Types.ObjectId(String(companyId)),
      isActive: true,
      deletedAt: null,
    })
      .session(session)
      .setOptions({ skipTenantScope: true }) // explicit companyId above — engine runs with an explicit tenant
      .lean();
    if (accounts.length !== accountIds.length) {
      const found = new Set(accounts.map((a) => String(a._id)));
      throw new AppError('LEDGER_ACCOUNT_INACTIVE', 422, {
        missing: accountIds.filter((id) => !found.has(id)),
      });
    }
    const accountById = new Map(accounts.map((a) => [String(a._id), a]));

    // 8 — I6: gapless number from counters, INSIDE the caller's transaction
    const fy = financialYear(draft.date, company.financialYearStartMonth);
    const entryNumber = await nextNumber(String(companyId), fy, 'JV', session);

    // 9 — insert the entry
    const [entry] = await JournalEntry.create(
      [
        {
          companyId,
          entryNumber,
          date: draft.date,
          fy,
          narration: draft.narration,
          source: {
            type: draft.source.type,
            documentId: draft.source.documentId ?? null,
            documentModel: draft.source.documentModel ?? null,
          },
          lines: draft.lines.map((line, i) => ({
            lineNo: i + 1,
            accountId: line.accountId,
            debitPaise: line.debitPaise ?? 0,
            creditPaise: line.creditPaise ?? 0,
            description: line.description,
            partyId: line.partyId ?? null,
            itemId: line.itemId ?? null,
            costCenter: line.costCenter ?? null,
            project: line.project ?? null,
            gst: line.gst,
          })),
          totalDebitPaise: totalDebit,
          totalCreditPaise: totalCredit,
          status: 'posted',
          reversesEntryId: draft.reversesEntryId ?? null,
          postedBy: actor,
          postedAt: new Date(),
        },
      ],
      { session },
    );

    // 10 — bump denormalised Account.currentBalancePaise (display-only cache)
    const deltas = new Map<string, number>();
    for (const line of draft.lines) {
      const account = accountById.get(String(line.accountId))!;
      const delta = balanceDelta(account.type, line.debitPaise ?? 0, line.creditPaise ?? 0);
      deltas.set(String(account._id), (deltas.get(String(account._id)) ?? 0) + delta);
    }
    await Account.bulkWrite(
      [...deltas.entries()].map(([id, delta]) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(id) },
          update: { $inc: { currentBalancePaise: delta } },
        },
      })),
      { session },
    );

    // 11 — audit trail, same transaction
    await AuditLog.create(
      [
        {
          companyId,
          action: 'journal.posted',
          entityType: 'JournalEntry',
          entityId: entry!._id,
          actorId: actor,
          meta: { entryNumber, totalDebitPaise: totalDebit, source: draft.source.type },
        },
      ],
      { session },
    );

    // 12 — transactional outbox (§22.2)
    await OutboxEvent.create(
      [
        {
          companyId,
          type: 'journal.posted',
          payload: { journalEntryId: String(entry!._id), entryNumber },
        },
      ],
      { session },
    );

    // 13
    return entry!.toObject();
  },

  /**
   * Creates a NEW entry with debits and credits swapped (I4). Never mutates
   * the original's lines — only stamps status + reversedByEntryId.
   */
  async reverse(
    companyId: Types.ObjectId | string,
    entryId: Types.ObjectId | string,
    reason: string,
    actor: Types.ObjectId | string,
    session: ClientSession,
  ): Promise<JournalEntryDoc> {
    if (!session.inTransaction()) throw new AppError('LEDGER_NO_TRANSACTION', 500);

    const original = await JournalEntry.findOne({ _id: entryId }).session(session);
    if (!original) throw new AppError('SYS_NOT_FOUND', 404);
    if (original.reversedByEntryId) throw new AppError('LEDGER_ALREADY_REVERSED', 409);

    const reversal = await this.post(
      companyId,
      {
        date: new Date(),
        narration: `Reversal of ${original.entryNumber}: ${reason}`,
        source: { type: 'reversal', documentId: original._id, documentModel: 'JournalEntry' },
        reversesEntryId: original._id, // stamped at insert time (I4)
        lines: original.lines.map((line) => ({
          accountId: line.accountId,
          debitPaise: line.creditPaise, // swapped
          creditPaise: line.debitPaise, // swapped
          description: line.description,
          partyId: line.partyId ?? undefined,
          itemId: line.itemId ?? undefined,
          costCenter: line.costCenter ?? undefined,
          project: line.project ?? undefined,
        })),
      },
      actor,
      session,
    );

    // stamp the original — the ONLY permitted mutation (pre-save allowlist)
    original.status = 'reversed';
    original.reversedByEntryId = reversal._id;
    await original.save({ session });

    return reversal;
  },

  /** Trial balance — one aggregation (§12.4). */
  async trialBalance(companyId: Types.ObjectId | string, asOf: Date): Promise<TrialBalanceRow[]> {
    const rows = await JournalEntry.aggregate<TrialBalanceRow>([
      {
        $match: {
          companyId: new Types.ObjectId(String(companyId)),
          date: { $lte: asOf },
        },
      },
      { $unwind: '$lines' },
      {
        $group: {
          _id: '$lines.accountId',
          debitPaise: { $sum: '$lines.debitPaise' },
          creditPaise: { $sum: '$lines.creditPaise' },
        },
      },
      { $lookup: { from: 'accounts', localField: '_id', foreignField: '_id', as: 'account' } },
      { $unwind: '$account' },
      {
        $project: {
          _id: 0,
          accountId: '$_id',
          code: '$account.code',
          name: '$account.name',
          type: '$account.type',
          debitPaise: 1,
          creditPaise: 1,
          balancePaise: {
            $cond: [
              { $in: ['$account.type', ['asset', 'expense']] },
              { $subtract: ['$debitPaise', '$creditPaise'] },
              { $subtract: ['$creditPaise', '$debitPaise'] },
            ],
          },
        },
      },
      { $sort: { code: 1 } },
    ])
      .option({ skipTenantScope: true, allowDiskUse: true })
      .exec();
    return rows;
  },

  /** Keyset-paginated ledger of one account (§18.3 — never skip). */
  async accountLedger(
    companyId: Types.ObjectId | string,
    accountId: Types.ObjectId | string,
    from: Date,
    to: Date,
    cursor?: string,
    limit = 50,
  ): Promise<LedgerPage> {
    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(String(companyId)),
      'lines.accountId': new Types.ObjectId(String(accountId)),
      date: { $gte: from, $lte: to },
    };
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

    const entries = await JournalEntry.find(filter, null, { skipTenantScope: true })
      .sort({ date: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = entries.length > limit;
    const page = entries.slice(0, limit);
    const last = page.at(-1);

    return {
      rows: page.map((entry) => {
        const line = entry.lines.find((l) => String(l.accountId) === String(accountId))!;
        return {
          entryId: String(entry._id),
          entryNumber: entry.entryNumber,
          date: entry.date,
          narration: entry.narration,
          status: entry.status,
          debitPaise: line.debitPaise,
          creditPaise: line.creditPaise,
        };
      }),
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({ d: last.date.toISOString(), id: String(last._id) }),
            ).toString('base64url')
          : null,
      hasMore,
    };
  },
};
