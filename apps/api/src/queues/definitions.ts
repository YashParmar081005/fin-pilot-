/**
 * Queue inventory (plan.md §20.2/§20.3). Separate queues, not one queue with
 * a type field — a stuck job in one must not block another. Every payload has
 * a Zod schema; a malformed job is a poison pill and is never enqueued.
 */
import { z } from 'zod';

export const QUEUES = {
  EMAIL: 'email',
  EINVOICE: 'einvoice.generate',
  REPORT_EXPORT: 'report.export',
  EINVOICE_DEADLINE: 'cron.einvoice.deadline',
  LEDGER_INTEGRITY: 'cron.ledger.integrity',
  INVOICE_OVERDUE: 'cron.invoice.overdue',
  OUTBOX_REAPER: 'cron.outbox.reaper',
  IDEMPOTENCY_SWEEP: 'cron.idempotency.sweep',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const JobSchemas = {
  [QUEUES.EMAIL]: z.object({
    to: z.string().email(),
    subject: z.string().min(1),
    text: z.string().min(1),
  }),
  [QUEUES.EINVOICE]: z.object({
    invoiceId: z.string().length(24),
    companyId: z.string().length(24),
  }),
  [QUEUES.REPORT_EXPORT]: z.object({ reportJobId: z.string().length(24) }),
  // cron payloads are empty — the job IS the schedule tick
  [QUEUES.EINVOICE_DEADLINE]: z.object({}).default({}),
  [QUEUES.LEDGER_INTEGRITY]: z.object({}).default({}),
  [QUEUES.INVOICE_OVERDUE]: z.object({}).default({}),
  [QUEUES.OUTBOX_REAPER]: z.object({}).default({}),
  [QUEUES.IDEMPOTENCY_SWEEP]: z.object({}).default({}),
} as const;

/** §20.2 per-queue policy: concurrency, attempts, backoff. */
export const QUEUE_POLICY: Record<
  QueueName,
  { concurrency: number; attempts: number; backoffMs: number }
> = {
  [QUEUES.EMAIL]: { concurrency: 20, attempts: 5, backoffMs: 2_000 },
  [QUEUES.EINVOICE]: { concurrency: 5, attempts: 6, backoffMs: 10_000 },
  [QUEUES.REPORT_EXPORT]: { concurrency: 2, attempts: 2, backoffMs: 10_000 },
  [QUEUES.EINVOICE_DEADLINE]: { concurrency: 1, attempts: 1, backoffMs: 0 },
  [QUEUES.LEDGER_INTEGRITY]: { concurrency: 1, attempts: 1, backoffMs: 0 },
  [QUEUES.INVOICE_OVERDUE]: { concurrency: 1, attempts: 1, backoffMs: 0 },
  [QUEUES.OUTBOX_REAPER]: { concurrency: 1, attempts: 1, backoffMs: 0 },
  [QUEUES.IDEMPOTENCY_SWEEP]: { concurrency: 1, attempts: 1, backoffMs: 0 },
};

/** §20.7 repeatable schedules — stable keys or BullMQ accumulates duplicates. */
export const REPEATABLES: Array<{ queue: QueueName; pattern: string }> = [
  { queue: QUEUES.LEDGER_INTEGRITY, pattern: '15 2 * * *' },
  { queue: QUEUES.EINVOICE_DEADLINE, pattern: '0 8 * * *' },
  { queue: QUEUES.INVOICE_OVERDUE, pattern: '0 6 * * *' },
  { queue: QUEUES.OUTBOX_REAPER, pattern: '*/1 * * * *' },
  { queue: QUEUES.IDEMPOTENCY_SWEEP, pattern: '0 4 * * *' },
];
