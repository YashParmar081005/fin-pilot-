/**
 * Core accounting domain constants (plan.md §10).
 * Normal balance is a PURE FUNCTION of account type — never stored.
 */

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_SUBTYPES = [
  // asset
  'cash',
  'bank',
  'accounts_receivable',
  'inventory',
  'fixed_asset',
  'other_current_asset',
  // liability
  'accounts_payable',
  'credit_card',
  'tax_payable',
  'loan',
  'other_current_liability',
  // equity
  'equity',
  'retained_earnings',
  // income
  'sales',
  'other_income',
  // expense
  'cogs',
  'operating_expense',
  'payroll',
  'depreciation',
  'other_expense',
] as const;
export type AccountSubType = (typeof ACCOUNT_SUBTYPES)[number];

/** Which subtypes belong to which type — create/update validation. */
export const SUBTYPES_BY_TYPE: Readonly<Record<AccountType, readonly AccountSubType[]>> = {
  asset: ['cash', 'bank', 'accounts_receivable', 'inventory', 'fixed_asset', 'other_current_asset'],
  liability: ['accounts_payable', 'credit_card', 'tax_payable', 'loan', 'other_current_liability'],
  equity: ['equity', 'retained_earnings'],
  income: ['sales', 'other_income'],
  expense: ['cogs', 'operating_expense', 'payroll', 'depreciation', 'other_expense'],
};

export function isValidSubType(type: AccountType, subType: AccountSubType): boolean {
  return SUBTYPES_BY_TYPE[type].includes(subType);
}

/**
 * Assets and expenses increase on debit; liabilities, equity and income
 * increase on credit (§10).
 */
export function normalBalance(type: AccountType): 'debit' | 'credit' {
  return type === 'asset' || type === 'expense' ? 'debit' : 'credit';
}
