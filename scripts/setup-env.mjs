#!/usr/bin/env node
/**
 * Seeds .env.local from .env.example with generated secrets (plan.md §7).
 * Never overwrites an existing .env.local.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, '.env.local');

if (existsSync(target)) {
  console.log('.env.local already exists — leaving it untouched.');
  process.exit(0);
}

let env = readFileSync(resolve(root, '.env.example'), 'utf8');
env = env.replace(/^JWT_ACCESS_SECRET=$/m, `JWT_ACCESS_SECRET=${randomBytes(32).toString('hex')}`);
env = env.replace(/^ENCRYPTION_KEY=$/m, `ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`);

writeFileSync(target, env);
console.log('Created .env.local with generated JWT_ACCESS_SECRET and ENCRYPTION_KEY.');
