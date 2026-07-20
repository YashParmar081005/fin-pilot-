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
import mongoose from 'mongoose';
import type { HealthResponse } from '@finpilot/shared';
import { mongoStatus } from './config/db';
import { getEnv } from './config/env';
import { getRedis, redisStatus } from './config/redis';
import { errorHandler } from './middleware/errorHandler';
import { httpLogger } from './middleware/httpLogger';
import { globalRateLimit } from './middleware/rateLimit';
import { requestId } from './middleware/requestId';
import { metricsMiddleware, renderMetrics } from './observability/metrics';
import { v1Routes } from './routes/v1';
import { errorBody } from './utils/respond';

export function buildApp(service: HealthResponse['service'] = 'api'): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Nginx in front (§5.1)

  app.use(requestId);
  app.use(httpLogger);
  app.use(metricsMiddleware); // §27.2 RED — before routing so 404s are counted
  // §28.5: explicit CSP with NO unsafe-inline, HSTS preload. The API serves
  // JSON, so 'self'-only is strict-by-default; nginx re-asserts these at the edge.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // helmet's default styleSrc allows 'unsafe-inline' — §28.5 forbids it
          styleSrc: ["'self'"],
          connectSrc: ["'self'", 'https://api.razorpay.com'],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    }),
  );
  app.use(
    cors({
      origin: getEnv().APP_URL,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Id', 'Idempotency-Key'],
    }),
  );
  app.use(
    express.json({
      limit: '256kb',
      // webhook signatures (Razorpay) are HMACs over the RAW body
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(cookieParser());
  // §5.3 #6 — L1 global per-IP limit, before authenticate; fails OPEN (§19.6)
  app.use('/api', globalRateLimit);

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

  // §27.5: /healthz above never checks dependencies (liveness); /readyz is
  // the readiness gate — Mongo must ping WITH a writable primary, Redis must
  // ping. Confusing the two causes the restart-storm cascade.
  app.get('/readyz', (_req, res) => {
    void (async () => {
      try {
        const hello = (await mongoose.connection.db!.admin().command({ hello: 1 })) as {
          isWritablePrimary?: boolean;
          setName?: string;
        };
        const redisPong = await getRedis(getEnv(), 'cache').ping();
        const ready =
          hello.isWritablePrimary === true && Boolean(hello.setName) && redisPong === 'PONG';
        res.status(ready ? 200 : 503).json({ ready });
      } catch {
        res.status(503).json({ ready: false });
      }
    })();
  });

  // §27.2 — Prometheus scrape target. Nginx never proxies /metrics (§28.5).
  app.get('/metrics', (_req, res) => {
    void renderMetrics()
      .then(({ contentType, body }) => res.status(200).contentType(contentType).send(body))
      .catch(() => res.status(500).end());
  });

  app.use('/api/v1', v1Routes);

  app.use((req, res) => {
    res.status(404).json(errorBody('SYS_NOT_FOUND', { path: req.path }, req.id));
  });

  app.use(errorHandler);

  return app;
}
