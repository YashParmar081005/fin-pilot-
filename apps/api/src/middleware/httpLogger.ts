/**
 * Middleware #2 (plan.md §5.3): pino-http structured request logging.
 * Redacts Authorization and cookies; reuses the uuid v7 from requestId.
 */
import pinoHttp from 'pino-http';
import { logger } from '../config/logger';

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as unknown as { id: string }).id,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[REDACTED]',
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: {
    ignore: (req) => req.url === '/healthz' || req.url === '/metrics',
  },
});
