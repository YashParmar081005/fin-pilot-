/**
 * Worker process entrypoint (plan.md §5.1, §20). BullMQ consumers + repeatable
 * jobs + the transactional-outbox change-stream publisher. No inbound port
 * except /healthz. Graceful shutdown per §20.8: finish in-flight jobs, take
 * no new ones.
 */
import http from 'node:http';
import mongoose from 'mongoose';
import type { HealthResponse } from '@finpilot/shared';
import { connectMongo, disconnectMongo, mongoStatus } from './config/db';
import type { Env } from './config/env';
import { logger } from './config/logger';
import { closeRedis, getRedis, redisStatus } from './config/redis';
import { handleOutboxEvent } from './jobs/maintenance';
import { OutboxEvent } from './models/OutboxEvent';
import { closeQueues } from './queues/infra';
import { registerRepeatables, registerWorkers } from './queues/workers';

export async function startWorker(env: Env): Promise<void> {
  await connectMongo(env);
  getRedis(env, 'cache');

  const workers = registerWorkers();
  await registerRepeatables();

  // §22.2: change stream for low latency; the every-minute reaper is the
  // guarantee when the resume token is lost.
  const changeStream = OutboxEvent.watch([{ $match: { operationType: 'insert' } }]);
  changeStream.on('change', (change) => {
    void (async () => {
      const doc = (change as { fullDocument?: { _id: unknown; type: string; payload: unknown } })
        .fullDocument;
      if (!doc) return;
      try {
        await handleOutboxEvent(doc.type, doc.payload);
        await OutboxEvent.updateOne(
          { _id: doc._id, status: 'pending' },
          { status: 'published', publishedAt: new Date() },
        ).setOptions({ skipTenantScope: true });
      } catch (err) {
        logger.error(
          { err, type: doc.type },
          'outbox change-stream publish failed — reaper will retry',
        );
      }
    })();
  });
  changeStream.on('error', (err) =>
    logger.error({ err: err.message }, 'outbox change stream error — reaper covers the gap'),
  );

  const health = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      const body: HealthResponse = {
        status: mongoStatus() === 'connected' && redisStatus() === 'connected' ? 'ok' : 'degraded',
        service: 'worker',
        uptimeSeconds: Math.round(process.uptime()),
        components: { mongo: mongoStatus(), redis: redisStatus() },
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404).end();
  });
  health.listen(env.WORKER_HEALTH_PORT, () => {
    logger.info(
      { port: env.WORKER_HEALTH_PORT, workers: workers.length },
      'worker up — consumers + repeatables + outbox publisher',
    );
  });

  // §20.8 — a worker killed mid-transaction is fine (Mongo aborts it); the
  // idempotency guards make a mid-call kill a no-op on replay.
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker shutting down — draining in-flight jobs');
    health.close();
    await changeStream.close().catch(() => undefined);
    await Promise.all(workers.map((w) => w.close())); // finish in-flight, take no new
    await closeQueues();
    await mongoose.connection.close(false);
    await closeRedis();
    await disconnectMongo();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
