import { describe, expect, it } from 'vitest';
import { MoneyError, formatINR, fromPaise, splitTaxPaise, toPaise } from '../src/money';

describe('toPaise', () => {
  it('converts rupees to integer paise', () => {
    expect(toPaise(1500)).toBe(150_000);
    expect(toPaise('1500.75')).toBe(150_075);
    expect(toPaise('0.05')).toBe(5);
    expect(toPaise(0)).toBe(0);
    expect(toPaise('-99.99')).toBe(-9_999);
  });

  it('rejects sub-paise precision instead of silently rounding', () => {
    expect(() => toPaise(1.005)).toThrow(MoneyError);
    expect(() => toPaise('1.005')).toThrow(MoneyError);
    expect(() => toPaise(NaN)).toThrow(MoneyError);
    expect(() => toPaise('abc')).toThrow(MoneyError);
  });
});

describe('fromPaise', () => {
  it('converts integer paise back to rupees', () => {
    expect(fromPaise(150_000)).toBe(1500);
    expect(fromPaise(1)).toBe(0.01);
  });

  it('rejects non-integer paise (I1)', () => {
    expect(() => fromPaise(10.5)).toThrow(MoneyError);
  });
});

describe('formatINR', () => {
  it('formats with Indian digit grouping', () => {
    expect(formatINR(150_000)).toBe('₹1,500.00');
    expect(formatINR(1_50_00_000)).toBe('₹1,50,000.00');
    expect(formatINR(5)).toBe('₹0.05');
    expect(formatINR(-9_999)).toBe('-₹99.99');
  });
});

describe('splitTaxPaise (§29.2 gst.spec rules)', () => {
  it('intra-state: CGST + SGST exactly half each', () => {
    const split = splitTaxPaise(100_000, 18, true);
    expect(split).toEqual({ taxPaise: 18_000, cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 });
  });

  it('intra-state: the odd paise goes to SGST', () => {
    const split = splitTaxPaise(50, 5, true); // 2.5 paise tax → rounds to 3 (Math.round is deterministic here)
    expect(split.cgstPaise + split.sgstPaise).toBe(split.taxPaise);
    expect(split.sgstPaise - split.cgstPaise).toBe(split.taxPaise % 2);
  });

  it('inter-state: IGST only', () => {
    const split = splitTaxPaise(100_000, 18, false);
    expect(split).toEqual({ taxPaise: 18_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 18_000 });
  });

  it('cgst + sgst always reconciles to total tax', () => {
    for (const taxable of [1, 33, 999, 12_345, 99_999_999]) {
      for (const rate of [0, 0.25, 3, 5, 18, 40]) {
        const s = splitTaxPaise(taxable, rate, true);
        expect(s.cgstPaise + s.sgstPaise).toBe(s.taxPaise);
      }
    }
  });
});
