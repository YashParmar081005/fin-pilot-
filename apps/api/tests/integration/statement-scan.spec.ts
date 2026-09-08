/**
 * Reading a bank statement out of OCR'd text (plan.md §16).
 *
 * The rules being pinned here are the safety ones: a running balance must
 * corroborate a row, and a row whose direction cannot be established is
 * reported rather than guessed. Getting those wrong posts money the wrong way
 * round, which is why they are tested as hard as the happy path.
 */
import { describe, expect, it } from 'vitest';
import { parseStatementText, rowsToCsv } from '../../src/ocr/statement';

const withBalance = [
  'HDFC BANK LTD - Statement of Account',
  'Period: 01/08/2026 to 08/09/2026',
  'Opening Balance: 5,42,000.00',
  'Date        Narration                    Withdrawal   Deposit     Balance',
  '05/08/2026  NEFT CR AHMEDABAD RETAIL     2,18,300.00  7,60,300.00',
  '14/08/2026  RTGS DR GUJARAT PACKAGING    1,59,300.00  6,01,000.00',
  'Closing Balance: 6,01,000.00',
].join('\n');

describe('statement rows', () => {
  it('reads the header balances and every movement', () => {
    const parsed = parseStatementText(withBalance);
    expect(parsed.openingBalancePaise).toBe(5_42_000_00);
    expect(parsed.closingBalancePaise).toBe(6_01_000_00);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.unparsed).toEqual([]);
  });

  it('uses the running balance to settle direction, and says it did', () => {
    const [credit, debit] = parseStatementText(withBalance).rows;

    // 5,42,000 → 7,60,300 is +2,18,300: money in, and it matches the amount.
    expect(credit).toMatchObject({
      date: '2026-08-05',
      amountPaise: 2_18_300_00,
      direction: 'credit',
      balanceChecked: true,
    });
    // 7,60,300 → 6,01,000 is −1,59,300: money out.
    expect(debit).toMatchObject({
      date: '2026-08-14',
      amountPaise: 1_59_300_00,
      direction: 'debit',
      balanceChecked: true,
    });
  });

  it('never treats the header or the balance lines as movements', () => {
    const parsed = parseStatementText(withBalance);
    expect(parsed.rows.map((r) => r.narration).join(' ')).not.toMatch(/opening|closing/i);
  });

  it('keeps the balance column out of the narration', () => {
    const [credit] = parseStatementText(withBalance).rows;
    expect(credit!.narration).toBe('NEFT CR AHMEDABAD RETAIL');
  });
});

describe('what it refuses to do', () => {
  it('reports a row whose direction cannot be established instead of guessing', () => {
    // No balance to difference against, and "CHQ PAID" carries no DR/CR token.
    const text = ['05/09/2026  CHQ PAID OFFICE RENT  85,000.00'].join('\n');
    const parsed = parseStatementText(text);

    expect(parsed.rows).toHaveLength(0);
    expect(parsed.unparsed).toHaveLength(1);
  });

  it('falls back to an explicit DR/CR marker when there is no balance', () => {
    const text = ['05/09/2026  NEFT DR TORRENT POWER  33,040.00'].join('\n');
    const [row] = parseStatementText(text).rows;

    expect(row).toMatchObject({ amountPaise: 33_040_00, direction: 'debit' });
    // Nothing corroborated it, and the row admits that.
    expect(row!.balanceChecked).toBe(false);
  });

  it('does not accept a balance that disagrees with the amount', () => {
    // Opening 1,00,000 then a balance of 1,50,000 is +50,000, but the row
    // claims 40,000. One of the two was misread, so neither is trusted.
    const text = [
      'Opening Balance: 1,00,000.00',
      '05/09/2026  SOME TRANSFER  40,000.00  1,50,000.00',
    ].join('\n');
    const parsed = parseStatementText(text);

    expect(parsed.rows).toHaveLength(0);
    expect(parsed.unparsed).toHaveLength(1);
  });

  it('ignores prose that happens to contain numbers', () => {
    const text = ['This statement is issued under Section 12 of the Banking Act'].join('\n');
    expect(parseStatementText(text).rows).toEqual([]);
  });
});

describe('formats a real statement uses', () => {
  it('reads ISO dates and a signed amount', () => {
    const text = ['2026-08-14  RTGS DR GUJARAT PACKAGING  -1,59,300.00'].join('\n');
    const [row] = parseStatementText(text).rows;
    expect(row).toMatchObject({ date: '2026-08-14', amountPaise: 1_59_300_00, direction: 'debit' });
  });

  it("reads accountants' brackets as money out", () => {
    const text = ['14/08/2026  CHEQUE CLEARING  (1,59,300.00)'].join('\n');
    const [row] = parseStatementText(text).rows;
    expect(row).toMatchObject({ amountPaise: 1_59_300_00, direction: 'debit' });
  });

  it('picks up a UTR as the reference', () => {
    const text = ['14/08/2026  RTGS DR GUJARAT PACKAGING UTR20260814  1,59,300.00'].join('\n');
    const [row] = parseStatementText(text).rows;
    expect(row!.reference).toBe('UTR20260814');
  });
});

describe('handing the rows to the existing importer', () => {
  it('emits the CSV shape the Banking import already accepts', () => {
    const csv = rowsToCsv(parseStatementText(withBalance).rows);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('Date,Narration,Amount,Ref');
    // Money out is negative, which is the convention that import expects.
    expect(lines[1]).toBe('2026-08-05,NEFT CR AHMEDABAD RETAIL,218300.00,');
    expect(lines[2]).toBe('2026-08-14,RTGS DR GUJARAT PACKAGING,-159300.00,');
  });

  it('quotes a narration containing a comma', () => {
    const csv = rowsToCsv([
      {
        date: '2026-08-14',
        narration: 'NEFT DR ACME, MUMBAI',
        amountPaise: 100_00,
        direction: 'debit',
        reference: null,
        balanceChecked: false,
      },
    ]);
    expect(csv.split('\n')[1]).toBe('2026-08-14,"NEFT DR ACME, MUMBAI",-100.00,');
  });
});
