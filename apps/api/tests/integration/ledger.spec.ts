/**
 * Phase 5 acceptance — the §29.2 ledger.spec.ts list, complete:
 *  ✓ rejects an unbalanced entry
 *  ✓ rejects a line with both debit and credit
 *  ✓ rejects a line with neither
 *  ✓ rejects a non-integer paise amount
 *  ✓ rejects a negative amount
 *  ✓ rejects a post into a locked period
 *  ✓ throws on any update attempt (save, updateOne, findOneAndUpdate, bulkWrite)
 *  ✓ reverse() creates a new mirrored entry, never mutates the original
 *  ✓ 100 concurrent posts → 100 gapless entryNumbers, no dupes — run 50×
 *  ✓ an aborted transaction does not consume an entryNumber
 *  ✓ after 10,000 randomised valid postings, sum(debit) === sum(credit)
 * Plus: collMod validator, balance bumps, trial balance, integrity job.
 */
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Account } from '../../src/models/Account';
import { Company } from '../../src/models/Company';
import { Counter } from '../../src/models/Counter';
import { JournalEntry } from '../../src/models/JournalEntry';
import { GeneralLedger, type JournalEntryDraft } from '../../src/engines/ledger/GeneralLedger';
import { checkCompanyIntegrity } from '../../src/jobs/ledgerIntegrity';
import { requestContext } from '../../src/plugins/tenantScope';
import { financialYear } from '../../src/utils/financialYear';
import { withTransaction } from '../../src/utils/withTransaction';
import { up as applyValidatorMigration } from '../../migrations/003-journalentries-validator';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

const actor = new Types.ObjectId();
let companyId: Types.ObjectId;
const acc: Record<string, Types.ObjectId> = {};

function inCtx<T>(fn: () => Promise<T>): Promise<T> {
  return requestContext.run({ companyId, userId: actor }, async () => await fn());
}

function post(draft: Partial<JournalEntryDraft>) {
  return inCtx(() =>
    withTransaction((s) =>
      GeneralLedger.post(
        companyId,
        {
          date: new Date('2026-07-01'),
          narration: 'test entry',
          source: { type: 'manual' },
          lines: [],
          ...draft,
        },
        actor,
        s,
      ),
    ),
  );
}

const dr = (account: Types.ObjectId, paise: number) => ({ accountId: account, debitPaise: paise });
const cr = (account: Types.ObjectId, paise: number) => ({ accountId: account, creditPaise: paise });

async function counterSeq(): Promise<number> {
  const fy = financialYear(new Date('2026-07-01'));
  const doc = await Counter.findById(`${companyId}:${fy}:JV`).lean();
  return doc?.seq ?? 0;
}

beforeAll(async () => {
  await connectTestDb();
  await applyValidatorMigration(mongoose.connection.db!);

  const company = await Company.create({
    organizationId: new Types.ObjectId(),
    legalName: 'Ledger Spec Pvt Ltd',
    stateCode: '24',
    booksBeginDate: new Date('2026-04-01'),
  });
  companyId = company._id;

  const mk = (code: string, name: string, type: string, subType: string) =>
    inCtx(() =>
      Account.create({
        companyId,
        code,
        name,
        type,
        subType,
        path: `/${code}`,
        depth: 0,
        isSystem: true,
      }),
    );
  acc.cash = (await mk('1110', 'Cash', 'asset', 'cash'))._id;
  acc.bank = (await mk('1120', 'Bank', 'asset', 'bank'))._id;
  acc.ar = (await mk('1130', 'Receivables', 'asset', 'accounts_receivable'))._id;
  acc.sales = (await mk('4100', 'Sales', 'income', 'sales'))._id;
  acc.rent = (await mk('5300', 'Rent', 'expense', 'operating_expense'))._id;
  acc.capital = (await mk('3100', 'Capital', 'equity', 'equity'))._id;
}, 180_000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('post() validation (§12.1)', () => {
  it('rejects an unbalanced entry', async () => {
    await expect(post({ lines: [dr(acc.cash!, 1000), cr(acc.sales!, 900)] })).rejects.toMatchObject(
      { code: 'LEDGER_UNBALANCED' },
    );
  });

  it('rejects a line with both debit and credit', async () => {
    await expect(
      post({
        lines: [{ accountId: acc.cash!, debitPaise: 500, creditPaise: 500 }, cr(acc.sales!, 500)],
      }),
    ).rejects.toMatchObject({ code: 'LEDGER_LINE_MUST_BE_DR_XOR_CR' });
  });

  it('rejects a line with neither', async () => {
    await expect(
      post({ lines: [{ accountId: acc.cash! }, cr(acc.sales!, 0)] }),
    ).rejects.toMatchObject({ code: 'LEDGER_LINE_MUST_BE_DR_XOR_CR' });
  });

  it('rejects a non-integer paise amount', async () => {
    await expect(
      post({ lines: [dr(acc.cash!, 100.5), cr(acc.sales!, 100.5)] }),
    ).rejects.toMatchObject({ code: 'LEDGER_NON_INTEGER_PAISE' });
  });

  it('rejects a negative amount', async () => {
    await expect(
      post({ lines: [dr(acc.cash!, -100), cr(acc.sales!, -100)] }),
    ).rejects.toMatchObject({ code: 'LEDGER_NEGATIVE_AMOUNT' });
  });

  it('rejects fewer than two lines', async () => {
    await expect(post({ lines: [dr(acc.cash!, 100)] })).rejects.toMatchObject({
      code: 'LEDGER_MIN_TWO_LINES',
    });
  });

  it('rejects a date before the books begin', async () => {
    await expect(
      post({ date: new Date('2026-03-01'), lines: [dr(acc.cash!, 100), cr(acc.sales!, 100)] }),
    ).rejects.toMatchObject({ code: 'LEDGER_BEFORE_BOOKS_BEGIN' });
  });

  it('rejects a post into a locked period', async () => {
    await Company.updateOne({ _id: companyId }, { booksLockedUpto: new Date('2026-06-30') });
    await expect(
      post({ date: new Date('2026-06-15'), lines: [dr(acc.cash!, 100), cr(acc.sales!, 100)] }),
    ).rejects.toMatchObject({ code: 'LEDGER_PERIOD_LOCKED' });
    await Company.updateOne({ _id: companyId }, { booksLockedUpto: null });
  });

  it('rejects an unknown or foreign account', async () => {
    await expect(
      post({ lines: [dr(new Types.ObjectId(), 100), cr(acc.sales!, 100)] }),
    ).rejects.toMatchObject({ code: 'LEDGER_ACCOUNT_INACTIVE' });
  });

  it('refuses to post outside a transaction', async () => {
    const session = await mongoose.startSession();
    try {
      await expect(
        inCtx(() =>
          GeneralLedger.post(
            companyId,
            {
              date: new Date('2026-07-01'),
              narration: 'no txn',
              source: { type: 'manual' },
              lines: [dr(acc.cash!, 100), cr(acc.sales!, 100)],
            },
            actor,
            session,
          ),
        ),
      ).rejects.toMatchObject({ code: 'LEDGER_NO_TRANSACTION' });
    } finally {
      await session.endSession();
    }
  });
});

describe('immutability (I4)', () => {
  it('throws on any attempt to update a posted entry', async () => {
    const entry = await post({ lines: [dr(acc.cash!, 5000), cr(acc.sales!, 5000)] });

    // save path
    await inCtx(async () => {
      const doc = await JournalEntry.findOne({ _id: entry._id });
      doc!.narration = 'tampered';
      await expect(doc!.save()).rejects.toMatchObject({ code: 'LEDGER_IMMUTABLE' });
    });

    // query paths
    await inCtx(async () => {
      await expect(
        JournalEntry.updateOne({ _id: entry._id }, { narration: 'x' }).exec(),
      ).rejects.toMatchObject({ code: 'LEDGER_IMMUTABLE' });
      await expect(
        JournalEntry.findOneAndUpdate({ _id: entry._id }, { narration: 'x' }).exec(),
      ).rejects.toMatchObject({ code: 'LEDGER_IMMUTABLE' });
      await expect(JournalEntry.deleteOne({ _id: entry._id }).exec()).rejects.toMatchObject({
        code: 'LEDGER_IMMUTABLE',
      });
      await expect(JournalEntry.deleteMany({}).exec()).rejects.toMatchObject({
        code: 'LEDGER_IMMUTABLE',
      });
    });

    // bulk paths bypass query middleware — closed via static overrides
    expect(() => JournalEntry.bulkWrite([])).toThrowError(/LEDGER_IMMUTABLE|immutable/i);
    expect(() => JournalEntry.insertMany([])).toThrowError(/LEDGER_IMMUTABLE|immutable/i);
  });

  it('the collMod validator blocks a raw unbalanced insert (rogue mongosh)', async () => {
    const raw = mongoose.connection.db!.collection('journalentries');
    await expect(
      raw.insertOne({
        companyId,
        entryNumber: 'HACK/1',
        date: new Date(),
        fy: '2026-27',
        narration: 'rogue',
        source: { type: 'manual' },
        lines: [{ lineNo: 1, accountId: acc.cash, debitPaise: 100, creditPaise: 0 }],
        totalDebitPaise: 100,
        totalCreditPaise: 0,
        status: 'posted',
        postedBy: actor,
        postedAt: new Date(),
      }),
    ).rejects.toThrowError(/Document failed validation/);
  });

  it('the collMod validator blocks a raw update that would unbalance an entry', async () => {
    const entry = await post({ lines: [dr(acc.cash!, 700), cr(acc.sales!, 700)] });
    const raw = mongoose.connection.db!.collection('journalentries');
    await expect(
      raw.updateOne({ _id: entry._id }, { $set: { 'lines.0.debitPaise': 999_999 } }),
    ).rejects.toThrowError(/Document failed validation/);
  });
});

describe('reverse() (I4)', () => {
  it('creates a new mirrored entry and does not mutate the original', async () => {
    const original = await post({
      narration: 'rent paid',
      lines: [dr(acc.rent!, 250_000), cr(acc.bank!, 250_000)],
    });
    const cashBefore = (await inCtx(() => Account.findById(acc.rent!).lean()))!.currentBalancePaise;

    const reversal = await inCtx(() =>
      withTransaction((s) =>
        GeneralLedger.reverse(companyId, original._id, 'posted in error', actor, s),
      ),
    );

    // mirrored lines
    expect(reversal.lines[0]!.creditPaise).toBe(250_000);
    expect(reversal.lines[0]!.debitPaise).toBe(0);
    expect(reversal.lines[1]!.debitPaise).toBe(250_000);
    expect(reversal.source.type).toBe('reversal');
    expect(String(reversal.reversesEntryId)).toBe(String(original._id));

    // original: lines untouched, only status + back-reference stamped
    const after = await inCtx(() => JournalEntry.findOne({ _id: original._id }).lean());
    expect(after!.status).toBe('reversed');
    expect(String(after!.reversedByEntryId)).toBe(String(reversal._id));
    expect(after!.lines[0]!.debitPaise).toBe(250_000);
    expect(after!.narration).toBe('rent paid');

    // balance bump net zero
    const cashAfter = (await inCtx(() => Account.findById(acc.rent!).lean()))!.currentBalancePaise;
    expect(cashAfter).toBe(cashBefore - 250_000);

    // double reverse rejected
    await expect(
      inCtx(() =>
        withTransaction((s) => GeneralLedger.reverse(companyId, original._id, 'again', actor, s)),
      ),
    ).rejects.toMatchObject({ code: 'LEDGER_ALREADY_REVERSED' });
  });
});

describe('gapless numbering (I6)', () => {
  it('100 concurrent posts produce 100 distinct gapless entryNumbers — run 50×', async () => {
    const startSeq = await counterSeq();
    const all: string[] = [];
    for (let round = 0; round < 50; round++) {
      const entries = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          post({
            narration: `concurrency r${round} #${i}`,
            lines: [dr(acc.cash!, 100), cr(acc.sales!, 100)],
          }),
        ),
      );
      all.push(...entries.map((e) => e.entryNumber));
    }
    const seqs = all.map((n) => Number(n.split('/').at(-1)));
    const unique = new Set(seqs);
    expect(unique.size).toBe(5000); // no duplicates
    expect(Math.min(...seqs)).toBe(startSeq + 1); // no gap at the start
    expect(Math.max(...seqs)).toBe(startSeq + 5000); // no gap anywhere
  }, 600_000);

  it('an aborted transaction does not consume an entryNumber', async () => {
    const before = await counterSeq();
    await expect(
      inCtx(() =>
        withTransaction(async (s) => {
          await GeneralLedger.post(
            companyId,
            {
              date: new Date('2026-07-01'),
              narration: 'will abort',
              source: { type: 'manual' },
              lines: [dr(acc.cash!, 100), cr(acc.sales!, 100)],
            },
            actor,
            s,
          );
          throw new Error('boom — abort the txn');
        }),
      ),
    ).rejects.toThrowError('boom — abort the txn');

    expect(await counterSeq()).toBe(before); // rolled back with the txn
    const next = await post({ lines: [dr(acc.cash!, 100), cr(acc.sales!, 100)] });
    expect(Number(next.entryNumber.split('/').at(-1))).toBe(before + 1); // gapless
  });
});

describe('the property test + reports + integrity', () => {
  it('after 10,000 randomised valid postings, sum(debit) === sum(credit)', async () => {
    const accounts = [acc.cash!, acc.bank!, acc.ar!, acc.sales!, acc.rent!, acc.capital!];
    // deterministic PRNG — reproducible failures
    let seed = 0xf1a9;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pick = () => accounts[Math.floor(rand() * accounts.length)]!;

    const BATCH = 20;
    for (let done = 0; done < 10_000; done += BATCH) {
      await Promise.all(
        Array.from({ length: BATCH }, () => {
          const lineCount = 2 + Math.floor(rand() * 3); // 2–4 debit legs
          const amounts = Array.from(
            { length: lineCount - 1 },
            () => 1 + Math.floor(rand() * 100_000),
          );
          const total = amounts.reduce((s, a) => s + a, 0);
          return post({
            narration: 'property',
            lines: [...amounts.map((a) => dr(pick(), a)), cr(pick(), total)],
          });
        }),
      );
    }

    const [totals] = await JournalEntry.aggregate<{ d: number; c: number }>([
      { $match: { companyId } },
      { $group: { _id: null, d: { $sum: '$totalDebitPaise' }, c: { $sum: '$totalCreditPaise' } } },
    ]).option({ skipTenantScope: true });
    expect(totals!.d).toBe(totals!.c);
    expect(totals!.d).toBeGreaterThan(0);
  }, 900_000);

  it('the trial balance balances and matches stored account balances', async () => {
    const rows = await inCtx(() => GeneralLedger.trialBalance(companyId, new Date('2027-03-31')));
    const debitTotal = rows.reduce((s, r) => s + r.debitPaise, 0);
    const creditTotal = rows.reduce((s, r) => s + r.creditPaise, 0);
    expect(debitTotal).toBe(creditTotal);

    // TB per-account balance === denormalised currentBalancePaise
    for (const row of rows) {
      const stored = await inCtx(() => Account.findById(row.accountId).lean());
      expect(row.balancePaise, `account ${row.code}`).toBe(stored!.currentBalancePaise);
    }
  }, 120_000);

  it('accountLedger pages with a keyset cursor', async () => {
    const page1 = await inCtx(() =>
      GeneralLedger.accountLedger(
        companyId,
        acc.cash!,
        new Date('2026-04-01'),
        new Date('2027-03-31'),
        undefined,
        10,
      ),
    );
    expect(page1.rows).toHaveLength(10);
    expect(page1.hasMore).toBe(true);
    const page2 = await inCtx(() =>
      GeneralLedger.accountLedger(
        companyId,
        acc.cash!,
        new Date('2026-04-01'),
        new Date('2027-03-31'),
        page1.nextCursor!,
        10,
      ),
    );
    expect(page2.rows[0]!.entryId).not.toBe(page1.rows[0]!.entryId);
  });

  it('the nightly integrity job finds zero violations', async () => {
    const violations = await checkCompanyIntegrity(companyId);
    expect(violations).toEqual([]);
  }, 120_000);
});
