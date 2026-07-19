/**
 * Dead-letter queue (plan.md §20.5) — platform-wide, not tenant-scoped.
 * Inspect the payload, fix the data, REPLAY.
 */
import { Schema, model, type Types } from 'mongoose';

export interface DeadLetterDoc {
  _id: Types.ObjectId;
  queue: string;
  jobId: string;
  name: string;
  data: unknown;
  error: string;
  stack?: string;
  failedAt: Date;
  replayedAt?: Date | null;
}

const DeadLetterSchema = new Schema<DeadLetterDoc>(
  {
    queue: { type: String, required: true },
    jobId: { type: String, required: true },
    name: String,
    data: Schema.Types.Mixed,
    error: String,
    stack: String,
    failedAt: { type: Date, required: true },
    replayedAt: { type: Date, default: null },
  },
  { versionKey: false },
);

DeadLetterSchema.index({ queue: 1, failedAt: -1 });

export const DeadLetter = model<DeadLetterDoc>('DeadLetter', DeadLetterSchema);
