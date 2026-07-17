/**
 * Express app assembly, in the §5.3 middleware order:
 *   requestId → pinoHttp → helmet → cors → json(256kb) → cookies →
 *   routes (/api/v1) → notFound → errorHandler
 * Rate limits, tenancy, RBAC and idempotency slot in at their phases.
 */
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { HealthResponse } from '@finpilot/shared';
import { mongoStatus } from './config/db';
import { getEnv } from './config/env';
import { redisStatus } from './config/redis';
import { errorHandler } from './middleware/errorHandler';
import { httpLogger } from './middleware/httpLogger';
import { requestId } from './middleware/requestId';
import { v1Routes } from './routes/v1';
import { errorBody } from './utils/respond';

export function buildApp(service: HealthResponse['service'] = 'api'): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Nginx in front (§5.1)

  app.use(requestId);
  app.use(httpLogger);
  app.use(helmet());
  app.use(
    cors({
      origin: getEnv().APP_URL,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Id', 'Idempotency-Key'],
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

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

  app.use('/api/v1', v1Routes);

  app.use((req, res) => {
    res.status(404).json(errorBody('SYS_NOT_FOUND', { path: req.path }, req.id));
  });

  app.use(errorHandler);

  return app;
}
