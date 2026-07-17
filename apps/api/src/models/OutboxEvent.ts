/**
 * Transactional outbox (plan.md §22.2) — enqueue INTO Mongo, inside the same
 * transaction, so a crash between commit and queue.add cannot lose an event.
 * The publisher (change stream + cron reaper) arrives with the queues phase.
 */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface OutboxEventDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  type: string; // 'journal.posted', 'invoice.issued', …
  payload: Record<string, unknown>;
  status: 'pending' | 'published' | 'failed';
  attempts: number;
  createdAt: Date;
  publishedAt?: Date | null;
}

const OutboxEventSchema = new Schema<OutboxEventDoc>(
  {
    type: { type: String, required: true },
    payload: Object,
    status: { type: String, enum: ['pending', 'published', 'failed'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    publishedAt: { type: Date, default: null },
  },
  { versionKey: false },
);

OutboxEventSchema.plugin(tenantScope);
OutboxEventSchema.index({ status: 1, createdAt: 1 });

export const OutboxEvent = model<OutboxEventDoc>('OutboxEvent', OutboxEventSchema);
