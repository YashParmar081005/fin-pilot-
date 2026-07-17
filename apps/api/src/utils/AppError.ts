/**
 * The one operational error type (plan.md §18.4).
 * `code` is a stable machine-readable string from @finpilot/shared; the
 * frontend switches on it, never on `message`.
 */
import { ERROR_MESSAGES, type ErrorCode } from '@finpilot/shared';

export class AppError extends Error {
  constructor(
    public code: ErrorCode | (string & {}),
    public status = 400,
    public details?: unknown,
    public isOperational = true,
  ) {
    super(ERROR_MESSAGES[code as ErrorCode] ?? code);
    this.name = 'AppError';
  }
}
