/**
 * Phase 11 acceptance (plan.md §32):
 * - killing a worker mid-job re-runs it and produces ONE side effect, not two
 * - a poison job lands in the DLQ and can be replayed after fixing the payload
 * Runs against a real Redis (docker locally, service container in CI);
 * skips with a loud warning when none is reachable.
 */
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import mongoose, { Schema } from 'mongoose';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnv } from '../../src/config/env';
import { DeadLetter } from '../../src/models/DeadLetter';
import { QUEUES, JobSchemas } from '../../src/queues/definitions';
import {
  UnrecoverableError,
  backoffOpts,
  createWorker,
  getQueue,
  getQueueEvents,
} from '../../src/queues/infra';
import { dlqService } from '../../src/services/dlqService';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

// side-effect ledger for the tests — platform-level, not tenant-scoped
const SideEffect = mongoose.model(
  'QueueSideEffect',
  new Schema({ key: { type: String, unique: true }, at: { type: Date, default: Date.now } }),
);

let redisUp = false;
const cleanups: Array<() => Promise<unknown>> = [];

beforeAll(async () => {
  await connectTestDb();
  const probe = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: 0, lazyConnect: true });
  try {
    await probe.connect();
    await probe.ping();
    redisUp = true;
  } catch {
    console.warn('⚠ queues.spec skipped: no redis reachable at', getEnv().REDIS_URL);
  } finally {
    probe.disconnect();
  }
}, 60_000);

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => undefined);
  await disconnectTestDb();
}, 60_000);

describe('queue infrastructure (§20)', () => {
  it('a worker crash AFTER the side effect re-runs the job and produces ONE effect', async (ctx) => {
    if (!redisUp) return ctx.skip();
    const queueName = `test.effect.${randomUUID().slice(0, 8)}`;
    const effectKey = `effect:${randomUUID()}`;
    let runs = 0;

    const worker = createWorker<{ key: string }>(queueName, async (job) => {
      runs += 1;
      // §20.4: every worker starts by asking "did a previous attempt already do this?"
      if (await SideEffect.exists({ key: job.data.key })) return { skipped: 'already_done' };
      await SideEffect.create({ key: job.data.key });
      if (job.attemptsMade === 0) throw new Error('simulated crash after the side effect');
      return { done: true };
    });
    const events = getQueueEvents(queueName);
    await events.waitUntilReady();
    const queue = getQueue(queueName);
    cleanups.push(async () => {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
    });

    const job = await queue.add('effect', { key: effectKey }, backoffOpts(3, 50));
    const result = await job.waitUntilFinished(events, 30_000);

    expect(result).toEqual({ skipped: 'already_done' }); // the retry hit the guard
    expect(runs).toBe(2); // ran twice…
    expect(await SideEffect.countDocuments({ key: effectKey })).toBe(1); // …ONE side effect
  }, 60_000);

  it('a poison job lands in the DLQ and replays after fixing the payload', async (ctx) => {
    if (!redisUp) return ctx.skip();
    const queueName = `test.poison.${randomUUID().slice(0, 8)}`;
    const effectKey = `poison:${randomUUID()}`;
    const schema = z.object({ ok: z.literal(true), key: z.string() });

    const worker = createWorker(queueName, async (job) => {
      const parsed = schema.safeParse(job.data);
      if (!parsed.success) throw new UnrecoverableError('SCHEMA_INVALID'); // do not retry
      await SideEffect.updateOne(
        { key: parsed.data.key },
        { $setOnInsert: { key: parsed.data.key } },
        { upsert: true },
      );
      return { done: true };
    });
    const events = getQueueEvents(queueName);
    await events.waitUntilReady();
    const queue = getQueue(queueName);
    cleanups.push(async () => {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
    });

    // the poison pill: schema-invalid payload
    const bad = await queue.add('poison', { ok: false }, backoffOpts(3, 50));
    await expect(bad.waitUntilFinished(events, 30_000)).rejects.toThrow(/SCHEMA_INVALID/);

    // it must land in the DLQ (the failed-handler writes async — poll briefly)
    let dead = null;
    for (let i = 0; i < 50 && !dead; i++) {
      dead = await DeadLetter.findOne({ queue: queueName }).lean();
      if (!dead) await new Promise((r) => setTimeout(r, 100));
    }
    expect(dead).toBeTruthy();
    expect(dead!.error).toContain('SCHEMA_INVALID');

    // fix the payload, replay through the DLQ service
    const { jobId } = await dlqService.replay(String(dead!._id), { ok: true, key: effectKey });
    const replayed = await getQueue(queueName).getJob(jobId);
    await replayed!.waitUntilFinished(events, 30_000);

    expect(await SideEffect.countDocuments({ key: effectKey })).toBe(1);
    const row = await DeadLetter.findById(dead!._id).lean();
    expect(row!.replayedAt).toBeTruthy();
  }, 60_000);

  it('producers validate before enqueue — a malformed job never enters the queue', async () => {
    expect(() =>
      JobSchemas[QUEUES.EMAIL].parse({ to: 'not-an-email', subject: '', text: '' }),
    ).toThrow();
  });
});
