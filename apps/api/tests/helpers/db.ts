/**
 * Test database helper. Preference order:
 * 1. TEST_MONGO_URI env (explicit)
 * 2. the local docker-compose mongo (fast, no download)
 * 3. mongodb-memory-server (CI — downloads a mongod binary on first run)
 */
import mongoose from 'mongoose';

let memoryServer: { stop(): Promise<unknown> } | null = null;

async function tryConnect(uri: string): Promise<boolean> {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 1_500 });
    return true;
  } catch {
    return false;
  }
}

export async function connectTestDb(): Promise<void> {
  const explicit = process.env.TEST_MONGO_URI;
  if (explicit) {
    if (!(await tryConnect(explicit))) throw new Error(`cannot reach TEST_MONGO_URI: ${explicit}`);
  } else if (
    !(await tryConnect(
      'mongodb://localhost:27017/finpilot-test?replicaSet=rs0&directConnection=true',
    ))
  ) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    memoryServer = server;
    await mongoose.connect(server.getUri('finpilot-test'));
  }
  await mongoose.connection.dropDatabase();
}

export async function disconnectTestDb(): Promise<void> {
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
