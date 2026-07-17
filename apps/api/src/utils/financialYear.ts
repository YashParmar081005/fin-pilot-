/**
 * Indian financial-year label: '2026-27' for any date from 1 Apr 2026 to
 * 31 Mar 2027 (start month configurable per company, default April).
 * Computed against IST — an entry dated 31 Mar 23:30 IST must not roll into
 * the next FY because the server clock is UTC (plan.md §8.2).
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function financialYear(date: Date, fyStartMonth = 4): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth() + 1;
  const startYear = month >= fyStartMonth ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}
