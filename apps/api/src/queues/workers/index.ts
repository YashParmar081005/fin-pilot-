/**
 * Worker registration (plan.md §20.4): every worker starts by asking
 * "did a previous attempt already do this?" — retries are guaranteed.
 */
import nodemailer from 'nodemailer';
import type { Worker } from 'bullmq';
import { getEnv } from '../../config/env';
import { logger } from '../../config/logger';
import { processEInvoice, warnEInvoiceDeadlines } from '../../jobs/einvoice';
import { processReportExport } from '../../jobs/reportExport';
import { runLedgerIntegrityJob } from '../../jobs/ledgerIntegrity';
import {
  flipOverdueInvoices,
  handleOutboxEvent,
  reapOutbox,
  sweepIdempotencyKeys,
} from '../../jobs/maintenance';
import { guardOutbound, mailLimiter } from '../../integrations/limiters';
import { JobSchemas, QUEUES, QUEUE_POLICY, REPEATABLES } from '../definitions';
import { createWorker, getQueue } from '../infra';

export function registerWorkers(): Worker[] {
  const env = getEnv();
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
  });
  const send = guardOutbound(
    'smtp-worker',
    mailLimiter,
    (mail: { to: string; subject: string; text: string }) =>
      transporter.sendMail({ from: env.MAIL_FROM, ...mail }),
  );

  return [
    createWorker(
      QUEUES.EMAIL,
      async (job) => {
        const mail = JobSchemas[QUEUES.EMAIL].parse(job.data);
        await send(mail);
        return { sent: true };
      },
      { concurrency: QUEUE_POLICY[QUEUES.EMAIL].concurrency },
    ),
    createWorker(
      QUEUES.EINVOICE,
      async (job) => processEInvoice(JobSchemas[QUEUES.EINVOICE].parse(job.data)),
      { concurrency: QUEUE_POLICY[QUEUES.EINVOICE].concurrency },
    ),
    createWorker(QUEUES.EINVOICE_DEADLINE, async () => ({ warned: await warnEInvoiceDeadlines() })),
    createWorker(
      QUEUES.REPORT_EXPORT,
      async (job) => processReportExport(JobSchemas[QUEUES.REPORT_EXPORT].parse(job.data)),
      { concurrency: QUEUE_POLICY[QUEUES.REPORT_EXPORT].concurrency },
    ),
    createWorker(QUEUES.LEDGER_INTEGRITY, async () => {
      const violations = await runLedgerIntegrityJob();
      return { violations: violations.length };
    }),
    createWorker(QUEUES.INVOICE_OVERDUE, async () => ({ flipped: await flipOverdueInvoices() })),
    createWorker(QUEUES.OUTBOX_REAPER, async () => ({
      published: await reapOutbox(handleOutboxEvent),
    })),
    createWorker(QUEUES.IDEMPOTENCY_SWEEP, async () => ({
      swept: await sweepIdempotencyKeys(),
    })),
  ];
}

/** §20.7 — stable repeat keys or BullMQ accumulates duplicates across deploys. */
export async function registerRepeatables(): Promise<void> {
  for (const { queue, pattern } of REPEATABLES) {
    await getQueue(queue).upsertJobScheduler(
      queue, // stable scheduler id
      { pattern, tz: 'Asia/Kolkata' },
      { name: 'tick', data: {} },
    );
  }
  logger.info({ count: REPEATABLES.length }, 'repeatable jobs scheduled (IST)');
}
