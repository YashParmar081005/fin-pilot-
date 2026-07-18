/**
 * GSTIN validation (plan.md §32 Phase 6): CHECKSUM, not just regex.
 * Format: state(2) + PAN(10) + entity code + 'Z' + check character.
 * The check character is a mod-36 Luhn variant over the first 14 chars.
 */

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

/** Computes the 15th character for the first 14 characters of a GSTIN. */
export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(first14[i]!);
    if (value < 0) throw new Error(`invalid GSTIN character: ${first14[i]}`);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36]!;
}

/** Full validation: format AND checksum. */
export function validateGstin(gstin: string): boolean {
  const value = gstin.trim().toUpperCase();
  if (!GSTIN_REGEX.test(value)) return false;
  return gstinCheckDigit(value.slice(0, 14)) === value[14];
}
