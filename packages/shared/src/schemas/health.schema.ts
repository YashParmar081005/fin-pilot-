import { z } from 'zod';

/** Response shape of GET /healthz — shared so web and api agree on the contract. */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.enum(['api', 'ws', 'worker']),
  uptimeSeconds: z.number(),
  components: z.object({
    mongo: z.enum(['connected', 'connecting', 'disconnected']),
    redis: z.enum(['connected', 'connecting', 'disconnected']),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
