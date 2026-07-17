/**
 * The seeded Indian SME chart of accounts (plan.md §32 Phase 4):
 * exactly 60 accounts, all system-flagged. GST input/output ledgers per
 * component, TDS both ways, the accounts every ₹2–50 Cr business needs.
 * Codes: 1xxx assets · 2xxx liabilities · 3xxx equity · 4xxx income · 5xxx expenses.
 */
import type { AccountSubType, AccountType } from '@finpilot/shared';

export interface CoaTemplateRow {
  code: string;
  name: string;
  type: AccountType;
  subType: AccountSubType;
  parentCode: string | null;
}

export const INDIAN_SME_COA: readonly CoaTemplateRow[] = [
  // ── Assets ──────────────────────────────────────────────────────────
  { code: '1000', name: 'Assets', type: 'asset', subType: 'other_current_asset', parentCode: null },
  {
    code: '1100',
    name: 'Current Assets',
    type: 'asset',
    subType: 'other_current_asset',
    parentCode: '1000',
  },
  { code: '1110', name: 'Cash in Hand', type: 'asset', subType: 'cash', parentCode: '1100' },
  { code: '1120', name: 'Bank Accounts', type: 'asset', subType: 'bank', parentCode: '1100' },
  {
    code: '1130',
    name: 'Accounts Receivable',
    type: 'asset',
    subType: 'accounts_receivable',
    parentCode: '1100',
  },
  { code: '1140', name: 'Inventory', type: 'asset', subType: 'inventory', parentCode: '1100' },
  {
    code: '1150',
    name: 'GST Input — CGST',
    type: 'asset',
    subType: 'other_current_asset',
    parentCode: '1100',
  },
  {
    code: '1151',
    name: 'GST Input — SGST',
    type: 'asset',
    subType: 'other_current_asset',
    parentCode: '1100',
  },
  {
    code: '1152',
    name: 'GST Input — IGST',
    type: 'asset',
    subType: 'other_current_asset',
    parentCode: '1100',
  },
  {
    code: '1153',
    name: 'GST Input — Cess',
    type: 'asset',
    subType: 'other_current_asset',
    parentCode: '1100',
  },
  {
    code: '1160',
    name: 'TDS Receivable',
    type: 'asset',
    subType: 'other_current_asset',
    parentCode: '1100',
  },
  {
    code: '1170',
    name: 'Advances to Suppliers',
    type: 'asset',
    subType: 'other_current_asset',
    parentCode: '1100',
  },
  {
    code: '1180',
    name: 'Prepaid Expenses',
    type: 'asset',
    subType: 'other_current_asset',
    parentCode: '1100',
  },
  { code: '1500', name: 'Fixed Assets', type: 'asset', subType: 'fixed_asset', parentCode: '1000' },
  {
    code: '1510',
    name: 'Plant and Machinery',
    type: 'asset',
    subType: 'fixed_asset',
    parentCode: '1500',
  },
  {
    code: '1520',
    name: 'Furniture and Fixtures',
    type: 'asset',
    subType: 'fixed_asset',
    parentCode: '1500',
  },
  { code: '1530', name: 'Vehicles', type: 'asset', subType: 'fixed_asset', parentCode: '1500' },
  {
    code: '1540',
    name: 'Computers and Equipment',
    type: 'asset',
    subType: 'fixed_asset',
    parentCode: '1500',
  },
  {
    code: '1550',
    name: 'Accumulated Depreciation',
    type: 'asset',
    subType: 'fixed_asset',
    parentCode: '1500',
  },

  // ── Liabilities ─────────────────────────────────────────────────────
  {
    code: '2000',
    name: 'Liabilities',
    type: 'liability',
    subType: 'other_current_liability',
    parentCode: null,
  },
  {
    code: '2100',
    name: 'Current Liabilities',
    type: 'liability',
    subType: 'other_current_liability',
    parentCode: '2000',
  },
  {
    code: '2110',
    name: 'Accounts Payable',
    type: 'liability',
    subType: 'accounts_payable',
    parentCode: '2100',
  },
  {
    code: '2120',
    name: 'GST Output — CGST',
    type: 'liability',
    subType: 'tax_payable',
    parentCode: '2100',
  },
  {
    code: '2121',
    name: 'GST Output — SGST',
    type: 'liability',
    subType: 'tax_payable',
    parentCode: '2100',
  },
  {
    code: '2122',
    name: 'GST Output — IGST',
    type: 'liability',
    subType: 'tax_payable',
    parentCode: '2100',
  },
  {
    code: '2123',
    name: 'GST Output — Cess',
    type: 'liability',
    subType: 'tax_payable',
    parentCode: '2100',
  },
  {
    code: '2130',
    name: 'TDS Payable',
    type: 'liability',
    subType: 'tax_payable',
    parentCode: '2100',
  },
  {
    code: '2140',
    name: 'Advances from Customers',
    type: 'liability',
    subType: 'other_current_liability',
    parentCode: '2100',
  },
  {
    code: '2150',
    name: 'Credit Cards',
    type: 'liability',
    subType: 'credit_card',
    parentCode: '2100',
  },
  {
    code: '2160',
    name: 'Salaries Payable',
    type: 'liability',
    subType: 'other_current_liability',
    parentCode: '2100',
  },
  { code: '2500', name: 'Loans', type: 'liability', subType: 'loan', parentCode: '2000' },
  { code: '2510', name: 'Secured Loans', type: 'liability', subType: 'loan', parentCode: '2500' },
  { code: '2520', name: 'Unsecured Loans', type: 'liability', subType: 'loan', parentCode: '2500' },

  // ── Equity ──────────────────────────────────────────────────────────
  { code: '3000', name: 'Equity', type: 'equity', subType: 'equity', parentCode: null },
  { code: '3100', name: "Owner's Capital", type: 'equity', subType: 'equity', parentCode: '3000' },
  {
    code: '3200',
    name: 'Retained Earnings',
    type: 'equity',
    subType: 'retained_earnings',
    parentCode: '3000',
  },
  { code: '3300', name: 'Drawings', type: 'equity', subType: 'equity', parentCode: '3000' },

  // ── Income ──────────────────────────────────────────────────────────
  { code: '4000', name: 'Income', type: 'income', subType: 'sales', parentCode: null },
  { code: '4100', name: 'Sales', type: 'income', subType: 'sales', parentCode: '4000' },
  { code: '4200', name: 'Service Revenue', type: 'income', subType: 'sales', parentCode: '4000' },
  {
    code: '4300',
    name: 'Interest Income',
    type: 'income',
    subType: 'other_income',
    parentCode: '4000',
  },
  {
    code: '4400',
    name: 'Discount Received',
    type: 'income',
    subType: 'other_income',
    parentCode: '4000',
  },
  {
    code: '4500',
    name: 'Other Income',
    type: 'income',
    subType: 'other_income',
    parentCode: '4000',
  },

  // ── Expenses ────────────────────────────────────────────────────────
  { code: '5000', name: 'Expenses', type: 'expense', subType: 'other_expense', parentCode: null },
  {
    code: '5100',
    name: 'Cost of Goods Sold',
    type: 'expense',
    subType: 'cogs',
    parentCode: '5000',
  },
  { code: '5110', name: 'Purchases', type: 'expense', subType: 'cogs', parentCode: '5100' },
  { code: '5120', name: 'Freight Inward', type: 'expense', subType: 'cogs', parentCode: '5100' },
  {
    code: '5200',
    name: 'Salaries and Wages',
    type: 'expense',
    subType: 'payroll',
    parentCode: '5000',
  },
  { code: '5210', name: 'Staff Welfare', type: 'expense', subType: 'payroll', parentCode: '5000' },
  { code: '5300', name: 'Rent', type: 'expense', subType: 'operating_expense', parentCode: '5000' },
  {
    code: '5310',
    name: 'Electricity',
    type: 'expense',
    subType: 'operating_expense',
    parentCode: '5000',
  },
  {
    code: '5320',
    name: 'Telephone and Internet',
    type: 'expense',
    subType: 'operating_expense',
    parentCode: '5000',
  },
  {
    code: '5330',
    name: 'Professional Fees',
    type: 'expense',
    subType: 'operating_expense',
    parentCode: '5000',
  },
  {
    code: '5340',
    name: 'Repairs and Maintenance',
    type: 'expense',
    subType: 'operating_expense',
    parentCode: '5000',
  },
  {
    code: '5350',
    name: 'Travel and Conveyance',
    type: 'expense',
    subType: 'operating_expense',
    parentCode: '5000',
  },
  {
    code: '5360',
    name: 'Marketing and Advertising',
    type: 'expense',
    subType: 'operating_expense',
    parentCode: '5000',
  },
  {
    code: '5370',
    name: 'Bank Charges',
    type: 'expense',
    subType: 'operating_expense',
    parentCode: '5000',
  },
  {
    code: '5380',
    name: 'Insurance',
    type: 'expense',
    subType: 'operating_expense',
    parentCode: '5000',
  },
  {
    code: '5400',
    name: 'Depreciation',
    type: 'expense',
    subType: 'depreciation',
    parentCode: '5000',
  },
  {
    code: '5410',
    name: 'Round Off',
    type: 'expense',
    subType: 'other_expense',
    parentCode: '5000',
  },
] as const;

// exactly 60 — Phase 4 "Done when: the tree renders 60 accounts"
if (INDIAN_SME_COA.length !== 60) {
  throw new Error(`INDIAN_SME_COA must contain exactly 60 accounts, has ${INDIAN_SME_COA.length}`);
}
