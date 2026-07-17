/**
 * Money helpers (plan.md §6, invariant I1).
 *
 * Money is ALWAYS an integer number of paise. `150000` paise === ₹1,500.00.
 * No floats, no Decimal128, no strings in storage. Display formatting happens
 * once, at the React boundary, via `formatINR(paise)`.
 */

/** Thrown for any money value that is not an exact integer number of paise. */
export class MoneyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'MoneyError';
    this.code = code;
  }
}

/** Asserts a value is a safe integer paise amount. Returns it for chaining. */
export function assertPaise(value: number, field = 'amount'): number {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(
      'MONEY_NON_INTEGER_PAISE',
      `${field} must be a safe integer number of paise, got: ${value}`,
    );
  }
  return value;
}

/**
 * Converts rupees (number or decimal string) to integer paise.
 * Rejects anything that does not land exactly on a paise — silent rounding of
 * money input is how books drift.
 */
export function toPaise(rupees: number | string): number {
  if (typeof rupees === 'string') {
    const trimmed = rupees.trim();
    if (!/^[-+]?\d+(\.\d{1,2})?$/.test(trimmed)) {
      throw new MoneyError('MONEY_INVALID', `not a valid rupee amount: "${rupees}"`);
    }
    const negative = trimmed.startsWith('-');
    const [wholeRaw = '0', fracRaw = ''] = trimmed.replace(/^[-+]/, '').split('.');
    const paise = Number(wholeRaw) * 100 + Number(fracRaw.padEnd(2, '0') || '0');
    return assertPaise(negative ? -paise : paise);
  }

  if (!Number.isFinite(rupees)) {
    throw new MoneyError('MONEY_INVALID', `not a finite rupee amount: ${rupees}`);
  }
  const paise = Math.round(rupees * 100);
  // Reject values with sub-paise precision instead of silently rounding them.
  if (Math.abs(rupees * 100 - paise) > 1e-6) {
    throw new MoneyError('MONEY_PRECISION', `${rupees} has sub-paise precision; pass a string`);
  }
  return assertPaise(paise);
}

/** Converts integer paise to a rupee number. For computation display only — never store the result. */
export function fromPaise(paise: number): number {
  assertPaise(paise);
  return paise / 100;
}

/**
 * Formats integer paise as an Indian-grouped rupee string: 150000 → "₹1,500.00".
 * Pure integer math — safe for the full ₹90-trillion range of I1.
 */
export function formatINR(paise: number): string {
  assertPaise(paise);
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  const grouped = new Intl.NumberFormat('en-IN').format(rupees);
  return `${sign}₹${grouped}.${fraction}`;
}

export interface TaxSplitPaise {
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

/**
 * The §12.3 canonical API. Never `totalTax / 2` twice — floor + subtract puts
 * the odd paise on SGST deterministically, so two runs on the same input
 * produce identical journals.
 */
export function splitGstPaise(
  taxablePaise: number,
  rate: number,
  isInterState: boolean,
): { igst: number; cgst: number; sgst: number } {
  const split = splitTaxPaise(taxablePaise, rate, !isInterState);
  return { igst: split.igstPaise, cgst: split.cgstPaise, sgst: split.sgstPaise };
}

/**
 * Splits GST on a taxable amount (plan.md §29.2 gst.spec):
 * - intra-state → CGST + SGST, exactly half each, the odd paise goes to SGST
 * - inter-state → IGST only
 * All GST rates (0, 0.25, 3, 5, 18, 40) are exactly representable in binary,
 * so `taxablePaise * rate` is deterministic.
 */
export function splitTaxPaise(
  taxablePaise: number,
  ratePercent: number,
  isIntraState: boolean,
): TaxSplitPaise {
  assertPaise(taxablePaise, 'taxablePaise');
  if (taxablePaise < 0) {
    throw new MoneyError('MONEY_NEGATIVE', 'taxablePaise must be >= 0');
  }
  const taxPaise = Math.round((taxablePaise * ratePercent) / 100);

  if (!isIntraState) {
    return { taxPaise, cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise };
  }
  const cgstPaise = Math.floor(taxPaise / 2);
  const sgstPaise = taxPaise - cgstPaise; // odd paise lands here
  return { taxPaise, cgstPaise, sgstPaise, igstPaise: 0 };
}
