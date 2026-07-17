import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@finpilot/shared';
import { buildApp } from '../../src/server';

describe('GET /healthz', () => {
  it('returns 200 with the shared health contract', async () => {
    const res = await request(buildApp('api')).get('/healthz');
    expect(res.status).toBe(200);

    const parsed = healthResponseSchema.parse(res.body);
    expect(parsed.service).toBe('api');
    // no infra running in unit tests — the process is alive but degraded
    expect(parsed.components.mongo).toBe('disconnected');
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(buildApp('api')).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SYS_NOT_FOUND');
  });
});
