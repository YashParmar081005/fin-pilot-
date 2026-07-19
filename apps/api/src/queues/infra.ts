/**
 * Queue infrastructure (plan.md §20): connection, queue/worker factories with
 * jittered exponential backoff (§20.5 — not optional), and DLQ wiring on
 * exhaustion. UnrecoverableError skips retries entirely.
 */
import { Queue, QueueEvents, UnrecoverableError, Worker, type Job, type Processor } from 'bullmq';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';
import { DeadLetter } from '../models/DeadLetter';

export { UnrecoverableError };

function connection() {
  const url = new URL(getEnv().REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.password ? { password: url.password } : {}),
    maxRetriesPerRequest: null, // BullMQ requirement
  };
}

const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: connection(),
      defaultJobOptions: {
        removeOnComplete: { age: 3_600, count: 1_000 },
        removeOnFail: { age: 86_400 * 7 },
      },
    });
    queues.set(name, queue);
  }
  return queue;
}

/**
 * Worker factory with the §20.5 contract: exponential backoff with jitter,
 * exhausted / unrecoverable jobs land in the Mongo DLQ (inspect, fix, REPLAY
 * — a DLQ nobody can replay from is a graveyard).
 */
export function createWorker<T>(
  name: string,
  processor: Processor<T>,
  opts: { concurrency?: number } = {},
): Worker<T> {
  const worker = new Worker<T>(name, processor, {
    connection: connection(),
    concurrency: opts.concurrency ?? 4,
    settings: {
      // §20.5: exponential with 0.5–1.5× jitter — herds must not retry in lockstep
      backoffStrategy: (attemptsMade, _type, _err, job) => {
        const base = (job?.opts?.backoff as { delay?: number } | undefined)?.delay ?? 1_000;
        const exp = base * 2 ** Math.max(0, attemptsMade - 1);
        return Math.round(exp * (0.5 + Math.random()));
      },
    },
  });

  worker.on('failed', (job: Job<T> | undefined, err: Error) => {
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    const unrecoverable = err instanceof UnrecoverableError || err.name === 'UnrecoverableError';
    if (!exhausted && !unrecoverable) return; // BullMQ will retry with backoff
    void DeadLetter.create({
      queue: name,
      jobId: String(job.id),
      name: job.name,
      data: job.data,
      error: err.message,
      stack: err.stack,
      failedAt: new Date(),
    }).catch((dlqErr) => logger.error({ dlqErr }, 'DLQ write failed'));
    logger.error({ queue: name, jobId: job.id, err: err.message }, 'job dead-lettered');
  });

  worker.on('error', (err) => logger.error({ queue: name, err: err.message }, 'worker error'));
  return worker;
}

/** Job options for jittered exponential backoff (strategy lives on the worker). */
export function backoffOpts(attempts: number, baseMs: number) {
  return {
    attempts,
    backoff: { type: 'custom' as const, delay: baseMs },
  };
}

export function getQueueEvents(name: string): QueueEvents {
  return new QueueEvents(name, { connection: connection() });
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();
}
