/**
 * Token + secret crypto primitives (plan.md §17).
 * - refresh/verification tokens: 256-bit random, sha256-hashed at rest
 * - TOTP secrets: AES-256-GCM. Dev/local uses ENCRYPTION_KEY from env;
 *   production swaps in a KMS-held DEK (envelope encryption) without
 *   changing call sites.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getEnv } from '../config/env';

/** 256-bit opaque token, hex-encoded (64 chars). */
export function randomToken(): string {
  return randomBytes(32).toString('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function encryptionKey(): Buffer {
  return Buffer.from(getEnv().ENCRYPTION_KEY, 'hex');
}

/** AES-256-GCM: returns iv.ciphertext.authTag, hex-joined by dots. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}.${enc.toString('hex')}.${cipher.getAuthTag().toString('hex')}`;
}

export function decryptSecret(payload: string): string {
  const [ivHex, dataHex, tagHex] = payload.split('.');
  if (!ivHex || !dataHex || !tagHex) throw new Error('malformed encrypted payload');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString(
    'utf8',
  );
}

/** Parses '15m' / '30d' / '1h' / '45s' into milliseconds. */
export function parseDuration(value: string): number {
  const m = /^(\d+)([smhd])$/.exec(value.trim());
  if (!m) throw new Error(`invalid duration: "${value}" (expected e.g. 15m, 30d)`);
  const n = Number(m[1]);
  switch (m[2]) {
    case 's':
      return n * 1_000;
    case 'm':
      return n * 60_000;
    case 'h':
      return n * 3_600_000;
    default:
      return n * 86_400_000;
  }
}
