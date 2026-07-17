import { z } from 'zod';

/**
 * Manual journal voucher contract (plan.md §12, §18.5).
 * Client-side sanity only — the GeneralLedger engine re-asserts every
 * invariant inside the transaction (I2, I5). Amounts are integer paise.
 */

const paise = z.number().int('amounts are integer paise').min(0);

export const journalLineSchema = z
  .object({
    accountId: z.string().length(24),
    debitPaise: paise.default(0),
    creditPaise: paise.default(0),
    description: z.string().max(500).optional(),
  })
  .refine((l) => l.debitPaise > 0 !== l.creditPaise > 0, {
    message: 'a line is either a debit or a credit, never both, never neither',
  });

export const createJournalEntrySchema = z
  .object({
    date: z.coerce.date(),
    narration: z.string().trim().min(1).max(1000),
    lines: z.array(journalLineSchema).min(2, 'at least two lines'),
  })
  .refine(
    (e) =>
      e.lines.reduce((s, l) => s + l.debitPaise, 0) ===
      e.lines.reduce((s, l) => s + l.creditPaise, 0),
    { message: 'debits and credits must be equal', path: ['lines'] },
  );

export const reverseJournalEntrySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;
export type ReverseJournalEntryInput = z.infer<typeof reverseJournalEntrySchema>;
