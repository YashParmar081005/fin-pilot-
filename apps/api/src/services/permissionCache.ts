/**
 * Permission cache (plan.md §17.4): `perms:{userId}:{companyId}` with a 60 s
 * TTL so revoking a role takes effect within a minute — and DELETING the key
 * on any role/membership change makes it take effect within ONE second
 * (Phase 3 "Done when").
 *
 * Backed by Redis in dev/prod (one shared cache for all API pods — a DEL is
 * globally immediate, no pub/sub needed until an in-memory L1 exists).
 * Test env uses a per-process Map for determinism (plan §7).
 */
import { getEnv } from '../config/env';
import { getRedis } from '../config/redis';
import { membershipRepo } from '../repositories/membershipRepo';

const TTL_SECONDS = 60;

const localCache = new Map<string, { permissions: string[]; expiresAt: number }>();

function key(userId: string, companyId: string): string {
  return `perms:${userId}:${companyId}`;
}

function useLocal(): boolean {
  return getEnv().NODE_ENV === 'test';
}

export const permissionCache = {
  async get(userId: string, companyId: string): Promise<string[]> {
    const k = key(userId, companyId);

    if (useLocal()) {
      const hit = localCache.get(k);
      if (hit && hit.expiresAt > Date.now()) return hit.permissions;
      const permissions = await membershipRepo.resolvePermissions(userId, companyId);
      localCache.set(k, { permissions, expiresAt: Date.now() + TTL_SECONDS * 1000 });
      return permissions;
    }

    const redis = getRedis(getEnv(), 'cache');
    const cached = await redis.get(k).catch(() => null);
    if (cached) return JSON.parse(cached) as string[];

    const permissions = await membershipRepo.resolvePermissions(userId, companyId);
    await redis.setex(k, TTL_SECONDS, JSON.stringify(permissions)).catch(() => undefined);
    return permissions;
  },

  /** Exact-key invalidation — immediate for every API pod sharing Redis. */
  async invalidate(userId: string, companyId: string): Promise<void> {
    const k = key(userId, companyId);
    if (useLocal()) {
      localCache.delete(k);
      return;
    }
    await getRedis(getEnv(), 'cache')
      .del(k)
      .catch(() => undefined);
  },

  /** Role definition changed → drop every member holding that role. */
  async invalidateRole(roleId: string): Promise<void> {
    const memberships = await membershipRepo.listUserIdsByRole(roleId);
    await Promise.all(
      memberships.map((m) => this.invalidate(String(m.userId), String(m.companyId))),
    );
  },
};
