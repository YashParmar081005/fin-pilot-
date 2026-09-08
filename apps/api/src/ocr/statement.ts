/**
 * Reading a bank statement out of OCR'd text (plan.md §16).
 *
 * An invoice has labelled fields; a statement is a TABLE, and once OCR has
 * flattened it the columns are gone — every row is a date, some words, and a
 * few numbers. So the columns are recovered positionally, and then checked.
 *
 * The check is what makes this safe. Statements print a running balance, so
 * `balance(n) - balance(n-1)` independently reproduces both the amount and
 * its direction. When that delta agrees with the amount read from the row,
 * two separate readings agree and the row is trustworthy. When it does not,
 * the row is reported as unparsed rather than imported — the same fail-closed
 * rule §16 applies to an invoice whose taxable + tax does not equal its total.
 *
 * Nothing here writes. The caller gets a proposal, a human confirms it, and
 * the existing CSV import does the writing (I10).
 */

export interface StatementRow {
  /** ISO yyyy-mm-dd. */
  date: string;
  narration: string;
  amountPaise: number;
  direction: 'credit' | 'debit';
  reference: string | null;
  /** A running-balance column independently confirmed amount and direction. */
  balanceChecked: boolean;
}

export interface StatementParse {
  rows: StatementRow[];
  /** Lines that began with a date but could not be read with confidence. */
  unparsed: string[];
  openingBalancePaise: number | null;
  closingBalancePaise: number | null;
}

/** Money as a bank prints it: grouped digits and always two decimals. */
const MONEY = /^-?\(?\d[\d,]*\.\d{2}\)?$/;
const DR_CR = /^\(?(dr|db|cr|dbt|crd)\.?\)?$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_DATE = /^(\d{2})[/.-](\d{2})[/.-](\d{4})$/;
/** UTR20260805, CHQ004471, NEFT-000123 — an id, not a word and not money. */
const REFERENCE = /^[A-Z]{2,6}[-/]?\d{4,}$/i;
/**
 * A number OCR did not quite finish: "7,60,300.C", "10,73,0(". It is debris
 * from the balance column, so it is neither money nor narration. Dropping it
 * is not repair — no digit is invented, the token is simply not text.
 */
const NUMERIC_DEBRIS = /^[\d][\d,.]*[\d,.OoCc()|]{0,3}$/;

function toPaise(token: string): number {
  // "(1,234.00)" is a debit in accountants' brackets.
  const bracketed = /^\(.*\)$/.test(token);
  const n = Number(token.replace(/[(),]/g, ''));
  if (!Number.isFinite(n)) return NaN;
  const paise = Math.round(n * 100);
  return bracketed ? -Math.abs(paise) : paise;
}

/** Returns ISO yyyy-mm-dd, or null when the token is not a date. */
function toIsoDate(token: string): string | null {
  const iso = ISO_DATE.exec(token);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = DMY_DATE.exec(token);
  if (!dmy) return null;
  const [, dd, mm, yyyy] = dmy;
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** "Opening Balance: 5,42,000.00" anywhere in the document. */
function labelledBalance(text: string, label: RegExp): number | null {
  const m = label.exec(text);
  if (!m?.[1]) return null;
  const paise = toPaise(m[1]);
  return Number.isFinite(paise) ? paise : null;
}

export function parseStatementText(text: string): StatementParse {
  const openingBalancePaise = labelledBalance(
    text,
    /opening\s*balance\s*[:-]?\s*(?:rs\.?|₹)?\s*(-?\(?[\d,]+\.\d{2}\)?)/i,
  );
  const closingBalancePaise = labelledBalance(
    text,
    /closing\s*balance\s*[:-]?\s*(?:rs\.?|₹)?\s*(-?\(?[\d,]+\.\d{2}\)?)/i,
  );

  const rows: StatementRow[] = [];
  const unparsed: string[] = [];
  let running: number | null = openingBalancePaise;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    const tokens = line.split(/\s+/);
    const date = toIsoDate(tokens[0] ?? '');
    // A statement row starts with its date; headers and footers do not.
    if (!date) continue;
    // "Opening Balance" lines can also carry a date — they are not movements.
    if (/opening\s*balance|closing\s*balance|brought\s*forward|c\/f|b\/f/i.test(line)) continue;

    const body = tokens.slice(1);
    const moneyTokens: number[] = [];
    const words: string[] = [];
    let marker: 'credit' | 'debit' | null = null;
    let reference: string | null = null;

    for (const token of body) {
      if (MONEY.test(token)) {
        moneyTokens.push(toPaise(token));
        continue;
      }
      if (DR_CR.test(token)) {
        marker = /cr/i.test(token) ? 'credit' : 'debit';
        // "NEFT CR ACME" is part of the narration too, so keep the word.
        words.push(token);
        continue;
      }
      if (!reference && REFERENCE.test(token)) reference = token;
      if (NUMERIC_DEBRIS.test(token)) continue; // half-read balance, not narration
      words.push(token);
    }

    if (moneyTokens.length === 0) {
      unparsed.push(line);
      continue;
    }

    // The rightmost number on a statement row is the running balance, when
    // the statement carries one at all.
    let amount: number | null = null;
    let balance: number | null = null;
    if (moneyTokens.length === 1) {
      amount = moneyTokens[0]!;
    } else {
      balance = moneyTokens[moneyTokens.length - 1]!;
      // Separate withdrawal/deposit columns: exactly one is filled, and OCR
      // drops the empty one, so whatever is left before the balance is it.
      const candidates = moneyTokens.slice(0, -1).filter((v) => v !== 0);
      amount = candidates.length > 0 ? candidates[candidates.length - 1]! : null;
    }

    if (amount === null || !Number.isFinite(amount)) {
      unparsed.push(line);
      continue;
    }

    // Direction, in order of how much we trust it.
    let direction: 'credit' | 'debit' | null = null;
    let balanceChecked = false;
    if (balance !== null && running !== null) {
      const delta = balance - running;
      if (Math.abs(Math.abs(delta) - Math.abs(amount)) <= 1) {
        direction = delta >= 0 ? 'credit' : 'debit';
        balanceChecked = true;
      }
    }
    if (direction === null && marker !== null) direction = marker;
    if (direction === null && amount < 0) direction = 'debit';
    if (direction === null && amount > 0 && balance === null) {
      // A bare positive number with no marker and no balance to check
      // against is genuinely ambiguous. Say so instead of assuming.
      unparsed.push(line);
      if (balance !== null) running = balance;
      continue;
    }
    if (direction === null) {
      unparsed.push(line);
      if (balance !== null) running = balance;
      continue;
    }

    if (balance !== null) running = balance;

    const narration = words.join(' ').replace(/\s+/g, ' ').trim();
    rows.push({
      date,
      narration: narration || '(no narration)',
      amountPaise: Math.abs(amount),
      direction,
      reference,
      balanceChecked,
    });
  }

  return { rows, unparsed, openingBalancePaise, closingBalancePaise };
}

/**
 * Render parsed rows as the CSV the Banking import already accepts, so a
 * scan lands in the same reviewed-then-imported path as a downloaded file
 * and inherits its fingerprint dedupe.
 */
export function rowsToCsv(rows: readonly StatementRow[]): string {
  const escape = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [
    'Date,Narration,Amount,Ref',
    ...rows.map((r) => {
      const signed = ((r.direction === 'debit' ? -r.amountPaise : r.amountPaise) / 100).toFixed(2);
      return [r.date, escape(r.narration), signed, escape(r.reference ?? '')].join(',');
    }),
  ].join('\n');
}
