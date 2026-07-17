/**
 * Worker process entrypoint (plan.md §5.1). BullMQ consumers arrive in Phase
 * 11 — Phase 0 establishes the process shape: no inbound port except /healthz,
 * connects to Mongo + Redis, shuts down gracefully.
 */
import http from 'node:http';
import type { HealthResponse } from '@finpilot/shared';
import { connectMongo, disconnectMongo, mongoStatus } from './config/db';
import type { Env } from './config/env';
import { logger } from './config/logger';
import { closeRedis, getRedis, redisStatus } from './config/redis';
import { runLedgerIntegrityJob } from './jobs/ledgerIntegrity';

/** ms until the next 02:15 IST (§12.5). */
function msUntilNextIntegrityRun(now = new Date()): number {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const next = new Date(ist);
  next.setUTCHours(2, 15, 0, 0);
  if (next <= ist) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - ist.getTime();
}

export async function startWorker(env: Env): Promise<void> {
  await connectMongo(env);
  getRedis(env, 'cache');

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
    logger.info({ port: env.WORKER_HEALTH_PORT }, 'worker up — queue consumers arrive in Phase 11');
  });

  const heartbeat = setInterval(() => logger.debug('worker heartbeat'), 60_000);

  // Nightly ledger integrity (§12.5) — BullMQ repeatable jobs take over in
  // the queues phase; until then a plain timer keeps the guarantee alive.
  let integrityTimer: NodeJS.Timeout = setTimeout(function run() {
    runLedgerIntegrityJob()
      .catch((err) => logger.error({ err }, 'ledger integrity job failed'))
      .finally(() => {
        integrityTimer = setTimeout(run, 24 * 60 * 60 * 1000);
      });
  }, msUntilNextIntegrityRun());

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker shutting down');
    clearInterval(heartbeat);
    clearTimeout(integrityTimer);
    health.close();
    await closeRedis();
    await disconnectMongo();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
