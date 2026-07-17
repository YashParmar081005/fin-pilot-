/**
 * GST constants (plan.md §14.1, §34.4).
 *
 * The 12% and 28% slabs were abolished on 22 Sept 2025 (GST 2.0). Rates are
 * validated against the slab set in force ON THE DOCUMENT DATE — the
 * effective-from table is the source of truth, never a single flat list.
 */

/** GST 2.0 came into force on this date. */
export const GST2_EFFECTIVE_FROM = '2025-09-22';

export const GST_SLABS_LEGACY = [0, 0.25, 3, 5, 12, 18, 28] as const;
export const GST_SLABS_CURRENT = [0, 0.25, 3, 5, 18, 40] as const;

export type GstRate = (typeof GST_SLABS_CURRENT)[number] | (typeof GST_SLABS_LEGACY)[number];

/** Returns the slab set legally in force on a given date (UTC date or 'YYYY-MM-DD'). */
export function gstSlabsOn(date: Date | string): readonly number[] {
  const iso = typeof date === 'string' ? date : date.toISOString().slice(0, 10);
  return iso >= GST2_EFFECTIVE_FROM ? GST_SLABS_CURRENT : GST_SLABS_LEGACY;
}

/** True if `rate` was a valid GST slab on `date`. */
export function isValidGstRateOn(rate: number, date: Date | string): boolean {
  return gstSlabsOn(date).includes(rate);
}

/**
 * GST state codes — the first two digits of a GSTIN. '24' = Gujarat.
 * Drives IGST vs CGST+SGST (place-of-supply, §14).
 */
export const GST_STATE_CODES: Readonly<Record<string, string>> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};
