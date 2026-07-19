/**
 * Typed producers (plan.md §20.3) — always validate before enqueue; a
 * malformed job is a poison pill. jobId is the deduplication key: the
 * queue-layer twin of I7.
 */
import { randomUUID } from 'node:crypto';
import { JobSchemas, QUEUES, QUEUE_POLICY } from './definitions';
import { backoffOpts, getQueue } from './infra';

export async function enqueueEmail(
  data: { to: string; subject: string; text: string },
  jobId?: string,
): Promise<void> {
  JobSchemas[QUEUES.EMAIL].parse(data);
  const policy = QUEUE_POLICY[QUEUES.EMAIL];
  await getQueue(QUEUES.EMAIL).add('send', data, {
    jobId: jobId ?? randomUUID(),
    ...backoffOpts(policy.attempts, policy.backoffMs),
  });
}
