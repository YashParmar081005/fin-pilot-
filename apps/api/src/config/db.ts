/**
 * Mongoose connection + replica-set check (plan.md §4.2).
 *
 * "Mongo without a replica set is not a database for this product." A
 * standalone mongod cannot start a session, so every ledger transaction would
 * fail at runtime. We verify setName at connect time and refuse to serve
 * without it.
 */
import mongoose from 'mongoose';
import type { Env } from './env';
import { logger } from './logger';

export async function connectMongo(env: Env): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);

  const conn = await mongoose.connect(env.MONGO_URI, {
    maxPoolSize: env.MONGO_MAX_POOL,
    serverSelectionTimeoutMS: 10_000,
  });

  const hello = await conn.connection.db!.admin().command({ hello: 1 });
  if (!hello.setName) {
    await mongoose.disconnect();
    throw new Error(
      [
        '✖ MongoDB is running as a STANDALONE instance — transactions are impossible.',
        '  FinPilot requires a replica set, even in dev (plan.md §4.2, CLAUDE.md).',
        '  Fix: `docker compose up -d` — rs.initiate() is part of the mongo healthcheck.',
      ].join('\n'),
    );
  }

  logger.info({ replicaSet: hello.setName, host: hello.me }, 'mongo connected (replica set OK)');
  return conn;
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

export type MongoComponentStatus = 'connected' | 'connecting' | 'disconnected';

export function mongoStatus(): MongoComponentStatus {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    default:
      return 'disconnected';
  }
}
