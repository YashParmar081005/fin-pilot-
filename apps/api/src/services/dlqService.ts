/**
 * DLQ service (plan.md §20.5): inspect payload, fix data, REPLAY.
 * The admin console UI (bull-board) lands with Phase 23; the mechanism is here.
 */
import { DeadLetter, type DeadLetterDoc } from '../models/DeadLetter';
import { getQueue } from '../queues/infra';
import { AppError } from '../utils/AppError';

export const dlqService = {
  list(queue?: string): Promise<DeadLetterDoc[]> {
    const filter: Record<string, unknown> = {};
    if (queue) filter.queue = queue;
    return DeadLetter.find(filter).sort({ failedAt: -1 }).limit(200).lean();
  },

  /** Re-enqueue with an optionally FIXED payload; marks the row replayed. */
  async replay(id: string, fixedData?: unknown): Promise<{ jobId: string }> {
    const dead = await DeadLetter.findById(id).lean();
    if (!dead) throw new AppError('SYS_NOT_FOUND', 404);
    const jobId = `replay:${dead._id}:${Date.now()}`;
    await getQueue(dead.queue).add(dead.name || 'replay', fixedData ?? dead.data, {
      jobId,
      attempts: 3,
      backoff: { type: 'custom', delay: 2_000 },
    });
    await DeadLetter.updateOne({ _id: dead._id }, { replayedAt: new Date() });
    return { jobId };
  },
};
