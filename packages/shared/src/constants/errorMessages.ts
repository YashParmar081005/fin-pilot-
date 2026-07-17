import type { ErrorCode } from './errorCodes';

/**
 * Human-safe messages for the error envelope (plan.md §18.2).
 * The frontend switches on `code`, never on `message`. Messages are safe to
 * show a user and will be i18n-keyed later.
 */
export const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  AUTH_INVALID_CREDENTIALS: 'Incorrect email or password.',
  AUTH_TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
  AUTH_TOKEN_REUSE: 'This session was revoked for your security. Please sign in again.',
  AUTH_ACCOUNT_LOCKED: 'Too many failed attempts. Try again in a few minutes.',
  AUTH_TOTP_REQUIRED: 'Enter the 6-digit code from your authenticator app.',
  AUTH_UNAUTHORIZED: 'You need to sign in to do that.',
  AUTH_FORBIDDEN: 'You do not have permission to do that.',
  TENANT_COMPANY_CONTEXT_REQUIRED: 'Select a company first.',
  TENANT_CONTEXT_MISSING: 'Company context could not be resolved.',
  TENANT_NOT_A_MEMBER: 'You are not a member of this company.',
  TENANT_INVITE_INVALID: 'This invite is invalid or has expired. Ask for a new one.',
  TENANT_ALREADY_A_MEMBER: 'This person is already a member of the company.',
  SYS_PLAN_LIMIT_EXCEEDED: 'Your plan limit has been reached. Upgrade to continue.',
  COA_SYSTEM_ACCOUNT_IMMUTABLE: 'System accounts cannot be deleted or restructured.',
  COA_HAS_CHILDREN: 'This account has sub-accounts. Move or delete them first.',
  COA_PARENT_NOT_FOUND: 'The parent account does not exist.',
  COA_REPARENT_CYCLE: 'An account cannot be moved under its own sub-account.',
  LEDGER_UNBALANCED: 'Journal entry debits and credits must be equal.',
  LEDGER_IMMUTABLE: 'Posted journal entries cannot be changed. Post a reversal instead.',
  LEDGER_PERIOD_LOCKED: 'This accounting period is locked.',
  LEDGER_BEFORE_BOOKS_BEGIN: 'The date is before the books begin date.',
  LEDGER_ALREADY_REVERSED: 'This entry has already been reversed.',
  LEDGER_NO_TRANSACTION: 'Ledger writes must run inside a transaction.',
  LEDGER_ACCOUNT_INACTIVE: 'One or more accounts do not exist or are inactive.',
  SYS_VALIDATION_FAILED: 'The request contains invalid fields.',
  SYS_DUPLICATE_KEY: 'A record with this value already exists.',
  SYS_CONCURRENT_MODIFICATION: 'This record was changed by someone else. Reload and retry.',
  SYS_RETRY_TRANSACTION: 'A temporary conflict occurred. Please retry.',
  SYS_RATE_LIMIT_EXCEEDED: 'Too many requests. Slow down and retry shortly.',
  SYS_NOT_FOUND: 'The requested resource was not found.',
  SYS_INTERNAL_ERROR: 'Something went wrong on our side. It has been logged.',
};
