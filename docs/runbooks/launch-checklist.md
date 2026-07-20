# Launch checklist — Phase 24 items that need staging or a vendor

Plan.md §32 Phase 24 lists items that are code (shipped in this repo) and items
that are operations on real infrastructure. This file is the honest ledger of
the second kind. **Nothing here is claimable from a dev laptop.**

## Shipped in this repo (verified by tests)

- [x] Prometheus metrics: RED + queue + domain (§27.2), `/metrics` on api and worker
- [x] Alert rules encoding the §27.4 table (`ops/prometheus/alerts.yml`)
- [x] Grafana dashboard (`ops/grafana/finpilot-dashboard.json`)
- [x] `/readyz` readiness vs `/healthz` liveness split (§27.5)
- [x] Helmet CSP without `unsafe-inline`, HSTS preload (§28.5); nginx edge config in `ops/nginx/`
- [x] Sentry capture on unhandled errors, tagged with `requestId` (DSN via env)
- [x] Pino redaction covering §27.1's never-log list, asserted by a test
- [x] gitleaks + `pnpm audit` in CI (`.github/workflows/ci.yml` security job)
- [x] Restore-drill script + dev drill PASSED (docs/runbooks/restore-drill-2026-Q3.md)
- [x] k6 load scripts encoding the §29.4 targets as pass/fail thresholds

## Requires staging (before first paying customer)

- [ ] Load test: run `scripts/load/k6-api.js` against staging with the §29.3
      seeded dataset. §29.4 targets are the k6 thresholds — the run fails if missed.
- [ ] Restore drill at production scale, including a TOTP login against the
      restored data (KMS decrypt proof).
- [ ] OpenTelemetry tracing (§27.3): wire `@opentelemetry/auto-instrumentations-node`
      via `NODE_OPTIONS=--require @opentelemetry/auto-instrumentations-node/register`
      pointing at the staging Tempo/Jaeger collector. Deliberately not vendored
      into the app code until the collector exists — a tracer with no backend
      is dead weight on every request.
- [ ] Alertmanager → PagerDuty/Slack routing for the P1/P2/P3 severities.

## Requires a vendor

- [ ] Third-party penetration test. Done-when: **zero critical, zero high**.
      Scope: §28.1 threat model rows, tenant isolation, ledger immutability,
      webhook forgery, impersonation controls.
- [ ] DPDP legal review of the erasure/anonymisation design (§28.4 — the
      8-year Companies Act retention vs erasure resolution).

## Deploy-day order (§30)

1. Migrations run as init container (forward-only, idempotent).
2. Blue-green API swap; workers drained with 60 s SIGTERM grace.
3. `docker compose -f docker-compose.observability.yml up -d`; import the dashboard.
4. Verify `/readyz` 200, `/metrics` scraped, a P3 test alert fires end to end.
