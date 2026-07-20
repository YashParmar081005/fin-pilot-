/**
 * Cron job bodies (plan.md §20.7) — live in jobs/ where skipTenantScope is
 * allowed (§9.1); the queue workers stay thin.
 */
import { IdempotencyKey } from '../models/IdempotencyKey';
import { Invoice } from '../models/Invoice';
import { OutboxEvent } from '../models/OutboxEvent';
import { logger } from '../config/logger';

/** invoice.overdue — flip issued → overdue past the due date. Idempotent. */
export async function flipOverdueInvoices(now = new Date()): Promise<number> {
  const result = await Invoice.updateMany(
    { status: 'issued', dueDate: { $lt: now } },
    { status: 'overdue' },
  ).setOptions({ skipTenantScope: true });
  if (result.modifiedCount > 0) logger.info({ count: result.modifiedCount }, 'invoices overdue');
  return result.modifiedCount;
}

/**
 * outbox.reaper — publish pending rows the change stream missed (§22.2).
 * At-least-once: marking published is idempotent, handlers dedupe by jobId.
 */
/** Marks one outbox event published — the change-stream publisher's ack. */
export async function markOutboxPublished(id: unknown): Promise<void> {
  await OutboxEvent.updateOne(
    { _id: id, status: 'pending' },
    { status: 'published', publishedAt: new Date() },
  ).setOptions({ skipTenantScope: true });
}

export async function reapOutbox(
  handle: (type: string, payload: unknown) => Promise<void>,
): Promise<number> {
  const pending = await OutboxEvent.find({ status: 'pending' }, null, { skipTenantScope: true })
    .sort({ createdAt: 1 })
    .limit(500)
    .lean();
  let published = 0;
  for (const event of pending) {
    try {
      await handle(event.type, event.payload);
      await OutboxEvent.updateOne(
        { _id: event._id },
        { status: 'published', publishedAt: new Date() },
      ).setOptions({ skipTenantScope: true });
      published += 1;
    } catch (err) {
      await OutboxEvent.updateOne({ _id: event._id }, { $inc: { attempts: 1 } }).setOptions({
        skipTenantScope: true,
      });
      logger.error({ err, eventId: String(event._id), type: event.type }, 'outbox publish failed');
    }
  }
  return published;
}

/**
 * Routes an outbox event to its consumers. Today the ledger's journal.posted
 * events have no downstream consumer — the routing point exists so later
 * phases (notifications, e-invoice, denormalise rebuilds) plug in here.
 */
export async function handleOutboxEvent(type: string, payload: unknown): Promise<void> {
  switch (type) {
    case 'journal.posted':
      return; // consumed by notification fanout / periodbalances in later phases
    case 'invoice.issued.einvoice': {
      const { enqueueEInvoice } = await import('../queues/producers');
      const p = payload as { invoiceId: string; companyId: string };
      await enqueueEInvoice({ invoiceId: p.invoiceId, companyId: p.companyId });
      return;
    }
    default:
      logger.warn({ type }, 'outbox event with no handler — marking published');
  }
}

/** idempotency.sweep — belt-and-braces beside the TTL index. */
export async function sweepIdempotencyKeys(): Promise<number> {
  const cutoff = new Date(Date.now() - 48 * 3_600_000);
  const result = await IdempotencyKey.deleteMany({ createdAt: { $lt: cutoff } });
  return result.deletedCount;
}
