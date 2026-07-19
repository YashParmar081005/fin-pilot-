/**
 * Zod-validated process.env (plan.md §7, Appendix A).
 *
 * A server that starts with a missing JWT_ACCESS_SECRET is worse than one that
 * refuses to start — anything missing or malformed THROWS AT BOOT with a
 * readable message. Secrets never enter the repo; dev values live in the
 * gitignored .env.local at the repo root (seeded by `pnpm setup:env`).
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PROCESS_TYPE: z.enum(['api', 'ws', 'worker']).default('api'),
  PORT: z.coerce.number().int().positive().default(4000),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(4002),
  APP_URL: z.string().url().default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:4000'),

  // Mongo MUST be a replica set — verified live at connect time in db.ts.
  MONGO_URI: z
    .string()
    .min(1)
    .default('mongodb://localhost:27017/finpilot?replicaSet=rs0&directConnection=true'),
  MONGO_MAX_POOL: z.coerce.number().int().positive().default(50),
  // host port 6380 in dev — 6379 belongs to another project's redis on this machine
  REDIS_URL: z.string().min(1).default('redis://localhost:6380'),

  // REQUIRED — no default, on purpose. Boot must fail without it.
  JWT_ACCESS_SECRET: z
    .string({ required_error: 'required — run `pnpm setup:env` or set it in .env.local' })
    .min(32, 'must be at least 32 characters (generate: openssl rand -hex 32)'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // REQUIRED — AES-256-GCM key for TOTP secrets at rest (§17.3). 64 hex chars.
  // Production replaces this with a KMS-held DEK (ENCRYPTION_KEK_ARN).
  ENCRYPTION_KEY: z
    .string({ required_error: 'required — run `pnpm setup:env` or set it in .env.local' })
    .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex chars (generate: openssl rand -hex 32)'),

  // argon2id parameters — OWASP 2024 minimum (§17.3)
  ARGON2_MEMORY_KIB: z.coerce.number().int().positive().default(19456),
  COOKIE_DOMAIN: z.string().optional(),

  // S3 / MinIO — optional until the documents phase
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().optional(),

  // Rate limits (§19) — env-tunable so raising a limit needs no deploy
  RL_L1_LIMIT: z.coerce.number().int().positive().default(300), // per IP per minute
  RL_AUTH_LIMIT: z.coerce.number().int().positive().default(10), // credential attempts per IP per minute

  // IRP / GSP (§14.4)
  IRP_SCHEMA_VERSION: z.string().default('1.1'),

  // Razorpay (§4.2 — the only payment provider in v1)
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Mail — Mailhog in dev; Resend/SES in production
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().default('FinPilot <no-reply@finpilot.local>'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/** Pure parser — unit-testable without touching process.env or dotenv. */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  • ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(
      [
        '✖ Invalid environment configuration — refusing to boot (plan.md §7).',
        ...lines,
        '',
        '  Fix: copy .env.example to .env.local (or run `pnpm setup:env`) and fill in the values.',
      ].join('\n'),
    );
  }
  return result.data;
}

let cached: Env | undefined;

/** Loads .env.local / .env from the repo root once, then validates process.env. */
export function getEnv(): Env {
  if (cached) return cached;
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  dotenv.config({ path: [resolve(root, '.env.local'), resolve(root, '.env')] });
  cached = parseEnv(process.env);
  return cached;
}
