/**
 * Process entrypoint — PROCESS_TYPE selects api | ws | worker (plan.md §5.1).
 * One monorepo, three deployables. Never let the API process consume a queue.
 */
import { connectMongo, disconnectMongo } from './config/db';
import { getEnv, type Env } from './config/env';
import { logger } from './config/logger';
import { closeRedis, getRedis } from './config/redis';
import { buildApp } from './server';
import { startWorker } from './worker';

async function startApi(env: Env): Promise<void> {
  await connectMongo(env);
  getRedis(env, 'cache');

  const app = buildApp('api');
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, url: `http://localhost:${env.PORT}/healthz` }, 'api listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'api shutting down');
    server.close();
    await closeRedis();
    await disconnectMongo();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

async function main(): Promise<void> {
  let env: Env;
  try {
    env = getEnv();
  } catch (err) {
    // env validation failed — print the readable message and refuse to boot (§7)
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  switch (env.PROCESS_TYPE) {
    case 'api':
      await startApi(env);
      break;
    case 'worker':
      await startWorker(env);
      break;
    case 'ws':
      logger.error('PROCESS_TYPE=ws (Socket.IO) is not built yet — it arrives with realtime.');
      process.exit(1);
  }
}

void main().catch((err) => {
  logger.fatal({ err }, 'fatal boot error');
  process.exit(1);
});
