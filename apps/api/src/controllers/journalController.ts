import type { Request, Response } from 'express';
import type { CreateJournalEntryInput, ReverseJournalEntryInput } from '@finpilot/shared';
import type { JournalEntryDoc } from '../services/journalService';
import { journalService } from '../services/journalService';
import { ok } from '../utils/respond';

function dto(entry: JournalEntryDoc) {
  return {
    id: String(entry._id),
    entryNumber: entry.entryNumber,
    date: entry.date,
    fy: entry.fy,
    narration: entry.narration,
    source: entry.source,
    lines: entry.lines.map((l) => ({
      lineNo: l.lineNo,
      accountId: String(l.accountId),
      debitPaise: l.debitPaise,
      creditPaise: l.creditPaise,
      description: l.description ?? null,
    })),
    totalDebitPaise: entry.totalDebitPaise,
    totalCreditPaise: entry.totalCreditPaise,
    status: entry.status,
    reversesEntryId: entry.reversesEntryId ? String(entry.reversesEntryId) : null,
    reversedByEntryId: entry.reversedByEntryId ? String(entry.reversedByEntryId) : null,
    postedAt: entry.postedAt,
  };
}

export const journalController = {
  async create(req: Request, res: Response) {
    const entry = await journalService.postManual(req.body as CreateJournalEntryInput);
    ok(res, { entry: dto(entry) }, 201);
  },

  async list(req: Request, res: Response) {
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const result = await journalService.list(cursor);
    ok(res, { entries: result.entries.map(dto) }, 200, {
      nextCursor: result.nextCursor ?? undefined,
      hasMore: result.hasMore,
    });
  },

  async get(req: Request, res: Response) {
    ok(res, { entry: dto(await journalService.get(String(req.params.id))) });
  },

  async reverse(req: Request, res: Response) {
    const entry = await journalService.reverse(
      String(req.params.id),
      (req.body as ReverseJournalEntryInput).reason,
    );
    ok(res, { entry: dto(entry) }, 201);
  },
};
