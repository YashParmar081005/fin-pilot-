/**
 * Phase 1 acceptance (plan.md §32):
 * - a route throwing AppError('X', 418) returns the exact envelope
 * - an unhandled throw returns 500 with no stack in the body
 * - a Zod failure returns 422 with flatten() in details
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../../src/middleware/errorHandler';
import { requestId } from '../../src/middleware/requestId';
import { validate } from '../../src/middleware/validate';
import { AppError } from '../../src/utils/AppError';
import { asyncHandler } from '../../src/utils/asyncHandler';
import { ok } from '../../src/utils/respond';
import { buildApp } from '../../src/server';

function testApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());

  app.get('/teapot', () => {
    throw new AppError('X', 418);
  });
  app.get(
    '/boom',
    asyncHandler(async () => {
      throw new Error('secret internal detail');
    }),
  );
  app.post(
    '/validated',
    validate(z.object({ email: z.string().email(), amountPaise: z.number().int() })),
    (req, res) => ok(res, req.body),
  );

  app.use(errorHandler);
  return app;
}

describe('Phase 1 — error, response, request rails', () => {
  it('AppError(X, 418) returns the exact error envelope', async () => {
    const res = await request(testApp()).get('/teapot');
    expect(res.status).toBe(418);
    expect(res.body).toEqual({
      error: {
        code: 'X',
        message: 'X',
        requestId: expect.any(String),
      },
    });
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });

  it('an unhandled throw returns 500 with no stack or internals in the body', async () => {
    const res = await request(testApp()).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SYS_INTERNAL_ERROR');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('secret internal detail');
    expect(raw).not.toContain('at '); // no stack frames
  });

  it('a Zod failure returns 422 with flatten() in details', async () => {
    const res = await request(testApp())
      .post('/validated')
      .send({ email: 'not-an-email', amountPaise: 1.5 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SYS_VALIDATION_FAILED');
    expect(res.body.error.details.fieldErrors.email).toBeDefined();
    expect(res.body.error.details.fieldErrors.amountPaise).toBeDefined();
  });

  it('success envelope is { data, meta.requestId }', async () => {
    const res = await request(testApp())
      .post('/validated')
      .send({ email: 'a@b.co', amountPaise: 150000 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ email: 'a@b.co', amountPaise: 150000 });
    expect(res.body.meta.requestId).toEqual(expect.any(String));
  });

  it('unknown routes return the SYS_NOT_FOUND envelope', async () => {
    const res = await request(buildApp('api')).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SYS_NOT_FOUND');
    expect(res.body.error.requestId).toEqual(expect.any(String));
  });
});
