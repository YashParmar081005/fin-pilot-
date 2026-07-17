/**
 * Pino logger (plan.md §4.1). Structured JSON in production → Loki later;
 * pretty-printed in dev. Reads process.env directly (not getEnv) so logging
 * works even while env validation is failing.
 */
import pino from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';
const isDev = (process.env.NODE_ENV ?? 'development') === 'development';

export const logger = pino({
  level,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: process.env.PROCESS_TYPE ?? 'api',
  },
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
});
