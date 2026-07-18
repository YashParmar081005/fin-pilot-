/**
 * Test database helper. Each spec file gets its OWN database name — vitest
 * runs files in parallel workers, and a shared db + dropDatabase would race.
 *
 * Connection preference:
 * 1. TEST_MONGO_URI env (explicit)
 * 2. the local docker-compose mongo (fast, no download)
 * 3. mongodb-memory-server (CI — downloads a mongod binary on first run)
 */
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';

let memoryServer: { stop(): Promise<unknown> } | null = null;

async function tryConnect(uri: string, dbName: string): Promise<boolean> {
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 1_500,
      dbName,
      // Bounded pool: 100 concurrent post() calls queue HERE, not on the
      // server — a laptop's single-node RS suffocates (heartbeat timeouts)
      // under 100 simultaneous w:majority j:true transactions. Production
      // bounds this the same way (MONGO_MAX_POOL + rate limiting, §19).
      maxPoolSize: 10,
    });
    return true;
  } catch {
    return false;
  }
}

export async function connectTestDb(): Promise<void> {
  const dbName = `finpilot-test-${randomBytes(4).toString('hex')}`;
  const explicit = process.env.TEST_MONGO_URI;

  if (explicit) {
    if (!(await tryConnect(explicit, dbName))) {
      throw new Error(`cannot reach TEST_MONGO_URI: ${explicit}`);
    }
  } else if (
    !(await tryConnect('mongodb://localhost:27017/?replicaSet=rs0&directConnection=true', dbName))
  ) {
    // replSet mode (plan §29.1) — the ledger's transactions need a replica set
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    const server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    memoryServer = server;
    await mongoose.connect(server.getUri(), { dbName });
  }
}

export async function disconnectTestDb(): Promise<void> {
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
