/**
 * Turning anything throwable into something a person can actually read.
 *
 * The rule here is that the server's message is reproduced VERBATIM. The
 * title is a friendly category and the code is a chip you can quote in a bug
 * report, but neither ever replaces or softens what the API actually said —
 * "Invoice number already used for 2026-27" is the sentence that solves the
 * user's problem, and paraphrasing it would throw that away.
 */
import { RequestError } from './api';

export type ToastKind = 'error' | 'success' | 'warning' | 'info';

export interface DescribedError {
  kind: ToastKind;
  /** Friendly headline — what class of thing went wrong. */
  title: string;
  /** The exact message from the server, or from the thrown Error. */
  message: string;
  /** Machine code, so the user can quote it precisely. */
  code?: string;
  /** Structured extras, pre-formatted for reading. */
  details?: string;
}

/** A validation problem is the user's to fix; a 500 is ours. Colour differs. */
const USER_FIXABLE = new Set([400, 401, 403, 404, 409, 413, 422, 429]);

const TITLES: Record<number, string> = {
  0: 'Cannot reach the server',
  400: 'Bad request',
  401: 'Your session has expired',
  403: 'You do not have permission',
  404: 'Not found',
  409: 'That conflicts with existing data',
  413: 'That file is too large',
  422: 'Check the highlighted fields',
  429: 'Too many requests — slow down',
};

function titleFor(status: number): string {
  return (
    TITLES[status] ?? (status >= 500 ? 'The server hit an error' : `Request failed (${status})`)
  );
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Zod reaches the client either flattened (`fieldErrors`) or as raw `issues`.
 * Both become one "field — what's wrong with it" line per problem, because a
 * wall of JSON is not something a user can act on.
 */
export function formatDetails(details: unknown): string | undefined {
  if (details === null || details === undefined) return undefined;
  if (typeof details === 'string') return details.trim() || undefined;

  const bag = details as {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
    issues?: { path?: (string | number)[]; message?: string }[];
    reason?: string;
  };

  if (typeof bag.reason === 'string') return bag.reason;

  const lines: string[] = [];
  for (const form of bag.formErrors ?? []) lines.push(form);
  for (const [field, messages] of Object.entries(bag.fieldErrors ?? {})) {
    for (const message of messages ?? []) lines.push(`${field} — ${message}`);
  }
  for (const issue of bag.issues ?? []) {
    const path = (issue.path ?? []).join('.');
    lines.push(path ? `${path} — ${issue.message ?? ''}` : (issue.message ?? ''));
  }

  if (lines.length > 0) return lines.join('\n');
  const dumped = stringify(details);
  return dumped === '{}' ? undefined : dumped;
}

export function describeError(
  err: unknown,
  fallbackTitle = 'Something went wrong',
): DescribedError {
  if (err instanceof RequestError) {
    return {
      kind: USER_FIXABLE.has(err.status) ? 'warning' : 'error',
      title: titleFor(err.status),
      message: err.error.message,
      code: err.error.code,
      details: formatDetails(err.error.details),
    };
  }
  if (err instanceof Error) {
    return { kind: 'error', title: fallbackTitle, message: err.message || err.name };
  }
  if (typeof err === 'string') {
    return { kind: 'error', title: fallbackTitle, message: err };
  }
  return { kind: 'error', title: fallbackTitle, message: stringify(err) };
}

/** One block of text carrying everything needed to report the failure. */
export function errorToClipboardText(described: DescribedError): string {
  const parts = [
    described.title,
    described.code ? `${described.code}: ${described.message}` : described.message,
  ];
  if (described.details) parts.push(described.details);
  return parts.join('\n');
}
