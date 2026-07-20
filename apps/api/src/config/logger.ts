/**
 * Pino logger (plan.md §4.1). Structured JSON in production → Loki later;
 * pretty-printed in dev. Reads process.env directly (not getEnv) so logging
 * works even while env validation is failing.
 */
import pino from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';
const isDev = (process.env.NODE_ENV ?? 'development') === 'development';

/**
 * §27.1 — never log: Authorization, Cookie, passwordHash, totpSecretEnc, the
 * raw AA payload, the full Razorpay webhook body, or recovery codes.
 * Exported so the redaction test can assert the list never shrinks.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-razorpay-signature"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.totpSecretEnc',
  '*.recoveryCodeHashes',
  '*.rawBody',
  '*.aaPayload',
];

export const logger = pino({
  level,
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  base: {
    service: process.env.PROCESS_TYPE ?? 'api',
  },
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
});
