/**
 * ioredis clients (plan.md §6): three roles — cache, bull (queues, Phase 11)
 * and sub (pub/sub, Socket.IO adapter later). Created lazily so tests and the
 * env-validation path never open sockets.
 */
import { Redis } from 'ioredis';
import type { Env } from './env';
import { logger } from './logger';

const clients = new Map<string, Redis>();

type RedisRole = 'cache' | 'bull' | 'sub' | 'ratelimit';

function createClient(env: Env, name: RedisRole): Redis {
  const client = new Redis(env.REDIS_URL, {
    // BullMQ requires maxRetriesPerRequest: null on its connections.
    // The ratelimit client must FAIL FAST (§19.6): no offline queue, no
    // retries — a hung limiter check is worse than a failed one.
    maxRetriesPerRequest: name === 'bull' ? null : name === 'ratelimit' ? 0 : 2,
    enableOfflineQueue: name !== 'ratelimit',
    retryStrategy: (times) => Math.min(times * 200, 5_000),
    lazyConnect: false,
  });
  client.on('ready', () => logger.info({ redis: name }, 'redis ready'));
  client.on('error', (err) => logger.error({ redis: name, err: err.message }, 'redis error'));
  clients.set(name, client);
  return client;
}

export function getRedis(env: Env, name: RedisRole = 'cache'): Redis {
  return clients.get(name) ?? createClient(env, name);
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([...clients.values()].map((c) => c.quit()));
  clients.clear();
}

export type RedisComponentStatus = 'connected' | 'connecting' | 'disconnected';

export function redisStatus(name = 'cache'): RedisComponentStatus {
  const client = clients.get(name);
  if (!client) return 'disconnected';
  if (client.status === 'ready') return 'connected';
  if (['connecting', 'connect', 'reconnecting'].includes(client.status)) return 'connecting';
  return 'disconnected';
}
