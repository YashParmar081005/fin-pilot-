/**
 * Express app assembly (plan.md §6). Phase 0 rails only: /healthz and a JSON
 * 404. The full middleware chain of §5.3 (requestId, pinoHttp, helmet, cors,
 * rate limits, auth, tenancy, idempotency, validation, errorHandler) arrives
 * in Phases 1–3 and 10.
 */
import express, { type Express } from 'express';
import type { HealthResponse } from '@finpilot/shared';
import { mongoStatus } from './config/db';
import { redisStatus } from './config/redis';

export function buildApp(service: HealthResponse['service'] = 'api'): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.get('/healthz', (_req, res) => {
    const mongo = mongoStatus();
    const redis = redisStatus();
    const body: HealthResponse = {
      status: mongo === 'connected' && redis === 'connected' ? 'ok' : 'degraded',
      service,
      uptimeSeconds: Math.round(process.uptime()),
      components: { mongo, redis },
    };
    res.status(200).json(body);
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'SYS_NOT_FOUND', message: 'route not found' } });
  });

  return app;
}
