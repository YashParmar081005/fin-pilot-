/**
 * argon2id password hashing (plan.md §17.3):
 * memoryCost 19456 KiB, timeCost 2, parallelism 1 — OWASP 2024 minimum.
 * Not bcrypt, not PBKDF2.
 */
import argon2 from 'argon2';
import { getEnv } from '../config/env';

function options() {
  return {
    type: argon2.argon2id,
    memoryCost: getEnv().ARGON2_MEMORY_KIB,
    timeCost: 2,
    parallelism: 1,
  } as const;
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, options());
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password).catch(() => false);
}

let dummyHash: string | null = null;

/**
 * Timing safety (§17.3): the "user not found" login path performs a real
 * argon2 verify against a throwaway hash so response time does not leak
 * account existence.
 */
export async function dummyVerify(password: string): Promise<void> {
  dummyHash ??= await argon2.hash('finpilot-dummy-timing-pad', options());
  await argon2.verify(dummyHash, password).catch(() => false);
}
