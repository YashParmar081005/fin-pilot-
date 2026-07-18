/**
 * Phase 6 acceptance (plan.md §32):
 * - an invalid GSTIN checksum is rejected
 * - a 12% rate is rejected for a date ≥ 2025-09-22 and accepted before it
 */
import { describe, expect, it } from 'vitest';
import { gstinCheckDigit, validateGstin } from '../src/gstin';
import { rateIsValidOn, gstSlabsOn } from '../src/constants/gst';
import { createItemSchema } from '../src/schemas/item.schema';
import { createPartySchema } from '../src/schemas/party.schema';

describe('GSTIN checksum', () => {
  it('validates the canonical GSTN example', () => {
    // widely-published valid GSTIN: check digit V
    expect(gstinCheckDigit('27AAPFU0939F1Z')).toBe('V');
    expect(validateGstin('27AAPFU0939F1ZV')).toBe(true);
  });

  it('computes the check digit for the test fixture', () => {
    expect(gstinCheckDigit('24AAAAA0000A1Z')).toBe('8');
    expect(validateGstin('24AAAAA0000A1Z8')).toBe(true);
  });

  it('rejects a GSTIN with a wrong checksum', () => {
    expect(validateGstin('24AAAAA0000A1Z5')).toBe(false); // right format, wrong check digit
    expect(validateGstin('27AAPFU0939F1ZW')).toBe(false);
  });

  it('rejects malformed strings outright', () => {
    expect(validateGstin('')).toBe(false);
    expect(validateGstin('24AAAAA0000A1X8')).toBe(false); // no Z at pos 14
    expect(validateGstin('24AAAAA0000A1Z')).toBe(false); // 14 chars
  });

  it('a corrupted character anywhere breaks validation', () => {
    const valid = '27AAPFU0939F1ZV';
    for (let i = 0; i < 14; i++) {
      const corrupted = valid.slice(0, i) + (valid[i] === 'A' ? 'B' : 'A') + valid.slice(i + 1);
      expect(validateGstin(corrupted), `corrupted index ${i}`).toBe(false);
    }
  });

  it('party schema rejects a checksum-invalid GSTIN', () => {
    const result = createPartySchema.safeParse({
      type: ['customer'],
      name: 'Bad GSTIN Trader',
      gstin: '24AAAAA0000A1Z5',
    });
    expect(result.success).toBe(false);
  });
});

describe('GST 2.0 rate history (§14.1)', () => {
  it('12% is accepted before 2025-09-22', () => {
    expect(rateIsValidOn(12, '2025-09-21')).toBe(true);
    expect(rateIsValidOn(28, '2020-01-15')).toBe(true);
  });

  it('12% is rejected on and after 2025-09-22', () => {
    expect(rateIsValidOn(12, '2025-09-22')).toBe(false);
    expect(rateIsValidOn(12, '2026-07-17')).toBe(false);
    expect(rateIsValidOn(28, '2025-09-22')).toBe(false);
  });

  it('40% exists only from 2025-09-22', () => {
    expect(rateIsValidOn(40, '2025-09-21')).toBe(false);
    expect(rateIsValidOn(40, '2025-09-22')).toBe(true);
  });

  it('18% is valid in both regimes', () => {
    expect(rateIsValidOn(18, '2024-01-01')).toBe(true);
    expect(rateIsValidOn(18, '2026-01-01')).toBe(true);
  });

  it('slab sets match the regimes', () => {
    expect(gstSlabsOn('2025-09-21')).toContain(12);
    expect(gstSlabsOn('2025-09-22')).not.toContain(12);
    expect(gstSlabsOn('2025-09-22')).toContain(40);
  });

  it('item schema rejects 12% today', () => {
    const result = createItemSchema.safeParse({
      kind: 'goods',
      name: 'Old Slab Widget',
      hsn: '8471',
      gstRate: 12,
    });
    expect(result.success).toBe(false);
  });
});
