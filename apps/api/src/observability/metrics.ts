/**
 * Prometheus metrics (plan.md §27.2): RED for the HTTP surface, USE for the
 * queues, and the domain metrics that mean something to the business. One
 * registry, scraped at GET /metrics. Route labels use the matched route
 * pattern, never the raw URL — raw URLs are a cardinality bomb.
 */
import type { NextFunction, Request, Response } from 'express';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { DeadLetter } from '../models/DeadLetter';

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry, prefix: 'finpilot_' });

// ── RED — for every service (§27.2) ─────────────────────────────────────────
export const httpRequestsTotal = new Counter({
  name: 'finpilot_http_requests_total',
  help: 'HTTP requests by method, matched route and status',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [metricsRegistry],
});
export const httpRequestDuration = new Histogram({
  name: 'finpilot_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route'] as const,
  buckets: [0.01, 0.05, 0.1, 0.3, 1, 3, 10], // §27.2 verbatim
  registers: [metricsRegistry],
});
export const httpErrorsTotal = new Counter({
  name: 'finpilot_http_errors_total',
  help: 'Error responses by route and canonical error code',
  labelNames: ['route', 'code'] as const,
  registers: [metricsRegistry],
});

// ── USE — queues ────────────────────────────────────────────────────────────
export const queueJobDuration = new Histogram({
  name: 'finpilot_queue_job_duration_seconds',
  help: 'Queue job duration by queue and outcome',
  labelNames: ['queue', 'status'] as const,
  buckets: [0.05, 0.2, 1, 5, 30, 120],
  registers: [metricsRegistry],
});
export const dlqDepth = new Gauge({
  name: 'finpilot_dlq_depth',
  help: 'Unreplayed dead letters by queue',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
  async collect() {
    // DeadLetter is platform-level (no tenant scope) — safe on the scrape path
    const rows = await DeadLetter.aggregate<{ _id: string; n: number }>([
      { $match: { replayedAt: null } },
      { $group: { _id: '$queue', n: { $sum: 1 } } },
    ]);
    this.reset();
    for (const row of rows) this.set({ queue: row._id }, row.n);
  },
});

// ── Domain — the metrics that mean something to the business (§27.2) ───────
export const journalEntriesPosted = new Counter({
  name: 'finpilot_journal_entries_posted_total',
  help: 'Journal entries posted through the GeneralLedger engine',
  registers: [metricsRegistry],
});
export const ledgerIntegrityViolations = new Counter({
  name: 'finpilot_ledger_integrity_violations_total',
  help: 'Nightly ledger integrity violations — MUST stay 0 (P1 alert)',
  labelNames: ['check'] as const,
  registers: [metricsRegistry],
});
export const einvoiceIrnFailures = new Counter({
  name: 'finpilot_einvoice_irn_failures_total',
  help: 'IRN generation failures by reason class',
  labelNames: ['reason'] as const,
  registers: [metricsRegistry],
});
export const aiTokensConsumed = new Counter({
  name: 'finpilot_ai_tokens_consumed_total',
  help: 'AI tokens metered against organization budgets',
  registers: [metricsRegistry],
});
export const aiGroundingFailures = new Counter({
  name: 'finpilot_ai_grounding_failures_total',
  help: 'Copilot answers rejected by the I9 grounding validator',
  registers: [metricsRegistry],
});
export const rateLimitRejections = new Counter({
  name: 'finpilot_rate_limit_rejections_total',
  help: '429s by limiter scope',
  labelNames: ['scope'] as const,
  registers: [metricsRegistry],
});

/**
 * The matched route pattern (e.g. /api/v1/invoices/:id) — never the raw URL,
 * which is a cardinality bomb. Trailing router slash stripped.
 */
export function routeLabel(req: Request): string {
  if (!req.route) return 'unmatched';
  const raw = `${req.baseUrl}${String(req.route.path)}`;
  return raw.length > 1 ? raw.replace(/\/$/, '') : raw;
}

/** §27.2 RED middleware — mounted once, right after requestId/logging. */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    httpRequestsTotal.inc({
      method: req.method,
      route: routeLabel(req),
      status: String(res.statusCode),
    });
    end({ method: req.method, route: routeLabel(req) });
  });
  next();
}

export async function renderMetrics(): Promise<{ contentType: string; body: string }> {
  return { contentType: metricsRegistry.contentType, body: await metricsRegistry.metrics() };
}
