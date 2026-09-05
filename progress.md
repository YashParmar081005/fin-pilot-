# FinPilot — development progress

_Status of every planned and discovered feature, judged against the code in this
repository (not against the plan's promises). Verified by reading the source on
2026-08-07 at commit `9ac95d5`._

**Legend**

- ✅ **Completed** — implemented, wired end to end (API + UI where a UI is
  expected), and covered by tests.
- 🟡 **Partially Completed** — the core exists, but something real is missing:
  a wiring gap, a mock where production needs a real integration, or a UI that
  does not match its API.
- ⛔ **Not Started** — named in `plan.md` / `README.md` but no implementation.
- ❓ **Unknown** — cannot be judged from the repo alone (needs staging, a
  vendor account, or a human decision).

**Scale of what exists:** ~130 API source files, 34 Mongoose models, 24 route
groups, ~190 API integration/unit tests + 21 shared-package tests, 20 React
pages/components. All 24 phases in `plan.md` §32 have been committed.

---

## 1. Snapshot

| Category               | Count | Notes                                                                      |
| ---------------------- | ----: | -------------------------------------------------------------------------- |
| ✅ Completed           |    23 | the accounting core, auth, tenancy, GST/IMS, reports, subscriptions, admin |
| 🟡 Partially Completed |    12 | mostly external integrations left as mocks + 4 concrete wiring bugs        |
| ⛔ Not Started         |    12 | v2 scope: inventory, credit notes, e-way bill, PDFs, period close, e2e     |
| ❓ Unknown             |     4 | pen test, load run, production restore drill, real-world OCR accuracy      |

**If you are picking up work today**, the four items in §3.1 are small,
well-defined bugs where the UI and API disagree — good first tasks.

---

## 2. ✅ Completed

### 2.1 Foundation and rails

| Feature                   | Files                                                                         | State                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Monorepo + tooling        | `pnpm-workspace.yaml`, `turbo.json`, `eslint.config.mjs`, `.husky/pre-commit` | pnpm workspaces, Turborepo, ESLint, Prettier, lint-staged pre-commit hook  |
| Env validation            | `apps/api/src/config/env.ts`, `scripts/setup-env.mjs`                         | Zod-validated; the process refuses to boot on a missing/malformed variable |
| Dev infrastructure        | `docker-compose.yml`                                                          | Mongo **replica set** (auto `rs.initiate`), Redis, MinIO, Mailhog          |
| Error/response envelope   | `middleware/errorHandler.ts`, `utils/AppError.ts`, `utils/respond.ts`         | one shape for every response; canonical error codes in `packages/shared`   |
| Request context + logging | `middleware/requestId.ts`, `httpLogger.ts`, `config/logger.ts`                | request ids, pino with a redaction list (`REDACT_PATHS`)                   |

Tests: `tests/unit/rails.spec.ts`, `env.spec.ts`, `health.spec.ts`.

### 2.2 Authentication

**Files:** `services/authService.ts`, `tokenService.ts`, `passwordService.ts`,
`routes/v1/auth.routes.ts`, `models/{User,Session,VerificationToken}.ts`

Implemented: registration, email verification, login, argon2id hashing
(19456 KiB / t=2 / p=1), refresh rotation with **family reuse detection**,
logout, forgot/reset password, TOTP 2FA with AES-256-GCM-encrypted secrets and
single-use recovery codes, account lockout after 6 failures, session listing and
revocation, and a constant-time floor on failed logins so an unknown email and a
wrong password take the same time.

Tests: `auth.spec.ts` (14) — includes the timing-parity test.

> UI note: only register/login/logout are exposed in the web app — see §3.2.

### 2.3 Tenancy, RBAC and isolation

**Files:** `plugins/tenantScope.ts`, `middleware/{tenantResolve,authorize}.ts`,
`services/{companyService,memberService,permissionCache}.ts`,
`packages/shared/src/{permissions.ts,constants/roles.ts}`

The Mongoose plugin injects `companyId` into every guarded query and as stage 0
of every aggregation, from AsyncLocalStorage request context; a query without a
resolved company throws. Five system roles are seeded per organization; invites
are signed tokens that grant nothing until the invitee authenticates; permission
changes invalidate the cache immediately. CI greps for `skipTenantScope` outside
sanctioned paths.

Tests: `tenancy.spec.ts` (11), `rbac.spec.ts` (11).

### 2.4 Chart of accounts

**Files:** `services/coa/indianSmeCoa.ts`, `accountService.ts`,
`models/Account.ts`, web `features/accounts/AccountsTree.tsx`

60-account Indian SME template, tree with `path`/`depth`, system accounts
protected from edit/delete, re-parenting with cycle detection, soft delete only
when unused. Tests: `coa.spec.ts` (13).

### 2.5 General Ledger engine — the core

**Files:** `engines/ledger/GeneralLedger.ts`, `models/{JournalEntry,Counter}.ts`,
`utils/withTransaction.ts`, `jobs/ledgerIntegrity.ts`,
`migrations/003-journalentries-validator.ts`

`post()` runs the 13-step sequence inside the caller's transaction: books-begin
and period-lock checks, ≥2 lines, debit-XOR-credit per line, integer non-negative
paise, balance assertion, account existence/ownership, **gapless number from
`counters`**, insert, cached balance updates, audit row, outbox event.
`reverse()` writes a mirrored entry and never mutates the original. Immutability
is enforced at three layers (schema hooks, query middleware, a MongoDB
`$expr` validator). Also provides `trialBalance()` and a keyset-paginated
account ledger.

Tests: `ledger.spec.ts` (20) — the strongest suite in the repo: unbalanced
entries rejected, both-sides/neither-side lines rejected, non-integer and
negative amounts rejected, locked periods rejected, every mutation path blocked,
**100 concurrent posts producing 100 gapless numbers**, aborted transactions
consuming no number, and a 10,000-posting property test that still balances.

### 2.6 Parties and items

**Files:** `services/{partyService,itemService}.ts`, `models/{Party,Item}.ts`,
`packages/shared/src/gstin.ts`, `constants/gst.ts`, web `features/parties/`

GSTIN mod-36 checksum validation, GST 2.0 rate history (12% and 28% invalid from
2025-09-22), place-of-supply → IGST vs CGST+SGST including the SEZ rule, bulk row
import that reports per-row errors instead of failing the batch.
Tests: `parties-items.spec.ts` (10), `packages/shared/tests/gst.spec.ts` (12).

### 2.7 Invoicing

**Files:** `services/invoiceService.ts`, `controllers/invoiceController.ts`,
`models/Invoice.ts`, web `features/sales/InvoicesPage.tsx`

Draft → issue → cancel, server-authoritative totals, per-line discounts, tax
split with the odd paise deterministically on SGST, exact §12.2 ledger posting,
reversal-on-cancel, overdue flip job. Tests: `invoice.spec.ts` (12).

### 2.8 Bills, expenses and approvals

**Files:** `services/{billService,expenseService}.ts`, `models/{Bill,Expense}.ts`,
web `features/purchases/BillsPage.tsx`. ITC posting on approval, self-approval
refused, cancel-by-reversal. Tests: `bills-expenses.spec.ts` (7).

### 2.9 Payments and allocation

**Files:** `services/paymentService.ts`, `razorpayService.ts`,
`models/Payment.ts`, web `features/money/PaymentsPage.tsx`

Inflow/outflow, append-only allocations that can never exceed the payment,
advances with GST on advance, refunds, and a Razorpay webhook that verifies the
HMAC with `timingSafeEqual` **before** parsing and treats a replay as a no-op.
Tests: `payments.spec.ts` (8).

### 2.10 Rate limiting

**Files:** `middleware/rateLimit.ts`, `ratelimit/store.ts`,
`integrations/limiters.ts`. Sliding-window and token-bucket Lua on a fail-fast
Redis client, per-route cost weighting, plan-tier buckets, `RateLimit-*` headers
on every response, reads fail **open**, auth fails **closed**, outbound limiters
with circuit breakers. Tests: `ratelimit.spec.ts` (7).

### 2.11 Queues, outbox and DLQ

**Files:** `queues/{definitions,infra,producers}.ts`, `queues/workers/index.ts`,
`jobs/maintenance.ts`, `services/dlqService.ts`, `models/{OutboxEvent,DeadLetter}.ts`

Nine queues with per-queue concurrency/attempts/jittered backoff, idempotent
workers, a Mongo dead-letter queue with replay, transactional outbox published by
a change stream with a once-a-minute reaper, five repeatable crons in IST, and
graceful shutdown. Tests: `queues.spec.ts` (3).

### 2.12 GST returns

**Files:** `engines/gst/GstEngine.ts`, `models/GstReturn.ts`,
`routes/v1/gst.routes.ts`, web `features/compliance/GstPage.tsx`
GSTR-1 (B2B + B2CS) and GSTR-3B generated from posted entries only, validated
against GSTN-shaped Zod schemas, with `trace` mapping every row back to journal
entry ids and a `/returns/:id/trace` endpoint. Tests: `gst-returns.spec.ts` (4).

### 2.13 IMS reconciliation

**Files:** `services/imsService.ts`, `models/ImsRecord.ts`
Sync, bill auto-matching (`matched` / `not_in_books`), accept/reject/pending with
GSP push-back, pending capped at one carried period, ITC-at-risk alarm.
Tests: `ims.spec.ts` (4). _(The GSP client is a mock — see §3.)_

### 2.14 Banking import

**Files:** `services/bankingService.ts`, `models/{BankAccount,BankTransaction}.ts`
CSV parsing with configurable column mapping (amount, or credit/debit pair),
Indian lakh separators handled, fingerprint de-duplication on re-import, manual
lines. Tests: `banking.spec.ts` (4).

### 2.15 Reports

**Files:** `services/reportService.ts`, `jobs/reportExport.ts`,
`models/ReportJob.ts`, web `features/reports/ReportsPage.tsx`
Trial balance, P&L, balance sheet, cash flow, AR/AP aging, all as-of a date, plus
queued CSV export with a job-status endpoint and authenticated download.
Tests: `reports.spec.ts` (5).

### 2.16 AI Copilot — safety layer

**Files:** `ai/{gateway,registry,guardrails,budget}.ts`, `models/AiConversation.ts`
Permission-filtered tool list, server-injected tenant on every tool call, ≤6 tool
iterations, numeric grounding validation with one corrective retry then a raw
table, fail-closed budget check before the first model call, SSE streaming with
tool-call chips. Tests: `ai.spec.ts` (6) — including "a model-supplied companyId
is overwritten", "an injected instruction in a tool result does not change
scoping", and "over-quota → 402 with zero tokens spent".

### 2.17 AI write proposals (I10)

**Files:** `ai/registry.ts` (WRITE_TOOLS), `models/AiProposal.ts`,
`routes/v1/ai.routes.ts`, web `features/copilot/CopilotPage.tsx`
Write tools create a proposal and perform zero writes; confirm re-validates the
payload through the shared schemas and replays it through the same services a
human uses; expiry and double-confirm are refused. Tests: `ai-proposals.spec.ts` (5).

### 2.18 Forecast and health score

**Files:** `engines/forecast/index.ts`, `routes/v1/forecast.routes.ts`
Deterministic 13-week P10/P50/P90 cash projection from open invoices/bills, and a
six-component health score that exposes its drivers. Tests: `forecast.spec.ts` (4).

### 2.19 Notifications (service layer)

**Files:** `services/notificationService.ts`, `models/Notification.ts`,
`routes/v1/notification.routes.ts`, web `features/platform/NotificationsPage.tsx`
In-app + email + WhatsApp channels, per-channel and per-event preferences,
idempotency enforced by a unique `(companyId, userId, dedupeKey)` index.
Tests: `notifications.spec.ts` (4). _(The reminder jobs are not scheduled — §3.1.)_

### 2.20 Subscriptions and metering

**Files:** `services/admin/subscriptionService.ts`,
`packages/shared/src/constants/plans.ts`, `routes/v1/billing.routes.ts`,
`integrations/razorpay/subscriptions.ts`, web `features/platform/BillingPage.tsx`
Four plans as data, org-wide metering of invoices/AI tokens/OCR pages, quota
enforcement on invoice creation and seat invites returning **402 with an upgrade
path**, Razorpay subscription creation, idempotent activation webhook, nightly
usage rollup. Tests: `subscriptions.spec.ts` (8).

### 2.21 Super-admin console and impersonation

**Files:** `services/admin/adminService.ts`, `middleware/requireSuperAdmin.ts`,
`models/{ImpersonationSession,AdminAudit}.ts`, web `features/platform/AdminPage.tsx`
Impersonation requires a written reason (≥10 chars, enforced by schema), issues a
15-minute token tied to a session, logs **every request** made under it, tags
ledger audit rows with `impersonatedBy`, shows a loud banner via response
headers, and dies the moment the session ends. Plan changes and DLQ replay are
audited. Tests: `subscriptions.spec.ts` covers the admin half.

### 2.22 Observability

**Files:** `observability/metrics.ts`, `server.ts` (`/metrics`, `/readyz`),
`ops/prometheus/*`, `ops/grafana/finpilot-dashboard.json`, `ops/nginx/finpilot.conf`
Eleven Prometheus metrics (RED + queue + domain), liveness vs readiness split,
CSP without `unsafe-inline` + HSTS preload, Sentry capture on unhandled errors,
alert rules, Grafana dashboard, nginx edge config. Tests: `observability.spec.ts` (7).

### 2.23 Web application

**Files:** `apps/web/src/**` — 17 feature pages over a shared UI kit
(`lib/ui.tsx`), a hand-rolled API client with in-memory tokens, automatic
`Idempotency-Key`, SSE reader and impersonation header capture (`lib/api.ts`),
light/dark themes on CSS variables, collapsible sidebar, dashboard charts as
inline SVG. Login/register includes a password-strength meter, show/hide toggle
and suggestion generator (`components/`, `utils/passwordUtils.ts`).

---

## 3. 🟡 Partially Completed

### 3.1 Four concrete wiring gaps (best first tasks)

| #   | Gap                                                                                                                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                    | What remains                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Reconciliation UI does not match its API.** The Banking page's suggestion table always renders empty and its Confirm button would 422 if it fired.          | API returns a flat `{bankTransactionId, journalEntryId, entryNumber, score}` (`services/reconciliationService.ts:41-91`); the UI expects `{..., candidates:[{documentModel, documentId, …}]}` and posts `documentModel`/`documentId` (`apps/web/src/features/money/BankingPage.tsx:44-135`), while the route schema requires `journalEntryId` (`routes/v1/reconciliation.routes.ts:28-40`). | Pick one shape. Either enrich the service to return `candidates[]`, or simplify the UI to the flat shape. Add a UI-level test.            |
| 2   | **Dashboard anomaly rows render as `undefined`.**                                                                                                             | Engine returns `{signal, severity, refs, detail: string}` (`engines/forecast/index.ts:167-221`); the dashboard reads `s.rule` and `s.message` (`apps/web/src/features/dashboard/DashboardPage.tsx:26-31, 200-206`).                                                                                                                                                                         | Rename in one place (engine `signal` → `rule` is the smaller change) and keep `forecast.spec.ts` green.                                   |
| 3   | **"Email invoice" button always fails with 422.**                                                                                                             | UI posts an empty body for `send` (`InvoicesPage.tsx:189-196`); the controller requires `req.body.email` (`controllers/invoiceController.ts:53-58`).                                                                                                                                                                                                                                        | Add a recipient prompt in the UI, or default to the party's stored email on the server.                                                   |
| 4   | **Notification reminder jobs are never scheduled.** `overdueInvoiceReminders` and `gstDueDateReminders` exist and are tested but no queue or cron calls them. | `jobs/notifications.ts` is imported only by its spec; `queues/definitions.ts` has no notification queue.                                                                                                                                                                                                                                                                                    | Add queue entries + repeatable schedules (daily for overdue, and the 8th/17th for GST) and register workers in `queues/workers/index.ts`. |

### 3.2 Auth: API complete, UI partial

The API implements email verification, forgot/reset password, TOTP 2FA setup and
disable, and session listing/revocation. **None of these have screens** — the web
app only calls register, login, logout and refresh (`apps/web/src/App.tsx`).
Remaining: verification and reset pages (token comes by email), a 2FA setup flow
with a QR code, and a "devices/sessions" screen.

Also note the **client is stricter than the server**: the register form requires
upper/lower/number/symbol (`apps/web/src/utils/passwordUtils.ts`), while the
server accepts any 8–128 character password
(`packages/shared/src/schemas/auth.schema.ts:9-12`). Decide which is canonical
and align them.

### 3.3 OCR: contract complete, extraction engines not wired

`services/documentService.ts` implements the pipeline, the confidence contract
and the arithmetic cross-check, and the UI renders it well. But the "text layer"
tier only triggers for `text/*` or the synthetic `application/pdf+text` mime, and
the vision tier's default implementation is
`content.toString('utf8')` — so a **real PDF or phone photo produces garbage text
and mostly `null` fields**. Remaining: plug in a PDF text extractor (e.g.
`pdf-parse`) and a real vision provider (Gemini Vision / Tesseract / Document AI)
behind the existing `setVisionExtractor()` seam, and meter OCR pages.

### 3.4 External integrations are deterministic mocks

All four are behind clean interfaces with a `setX()` seam, which is exactly how
they were designed to be swapped — but nothing real is connected:

| Integration        | Mock                                                                                | File                                    |
| ------------------ | ----------------------------------------------------------------------------------- | --------------------------------------- |
| IRP / e-invoicing  | `MockIrpClient` (a payload containing `FAIL4XX`/`FAIL5XX` triggers each error path) | `integrations/irp/client.ts:118-139`    |
| GSP / IMS          | `MockImsGspClient`                                                                  | `services/imsService.ts:37-52`          |
| Account Aggregator | `MockAaClient` (sandbox URLs)                                                       | `services/bankingService.ts:82-95`      |
| WhatsApp BSP       | `MockWhatsAppClient`                                                                | `services/notificationService.ts:16-22` |

Remaining for each: a real client, credentials in env, retry/error-mapping
review, and contract tests (the plan calls for nock/Pact fixtures).

### 3.5 LLM provider layer

`ai/provider.ts` (added by a teammate) registers Gemini, Groq or OpenAI from env
keys and falls back to a local keyword-driven engine that calls the real ledger
tools. It works, and the Copilot answers from live data. Rough edges to finish:

- **Token counts are hard-coded** (`tokens: 50 / 10 / 5`), so budget metering and
  `finpilot_ai_tokens_consumed_total` are approximations, not real usage.
- Gemini is driven by a **home-grown JSON protocol** in the prompt rather than
  its native function-calling API, and is pinned to `gemini-1.5-flash`.
- The fallback formats money with `paise / 100` instead of `formatINR`, so the
  Copilot can emit "₹5000" where the rest of the app shows "₹5,000.00".
- `guardrails.ts` now returns `true` early when there are no tool results or no
  numbers in them — a pragmatic relaxation of I9 that is worth a second look.
- `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENAI_API_KEY` are **not documented in
  `.env.example`**.

### 3.6 Anomaly detection

Three rules are implemented (duplicate vendor amount within 7 days, large round
outflows, reversals within 24h) in `engines/forecast/index.ts`. `README.md` and
`plan.md` also advertise **Benford's law** and **vendor bank-detail change**
detection — neither exists. Either implement them or correct the claims.

### 3.7 Document storage

`Document.content` is a `Buffer` stored **inside MongoDB**
(`models/Document.ts:15`). MinIO/S3 is configured in `docker-compose.yml` and
`.env.example` but **no code references it**. Remaining: move blobs to S3 through
a storage interface before any real volume of uploads.

### 3.8 Company settings and member management (API only)

`PATCH /companies/:id` and `PATCH /companies/:id/members/:userId` (role and
status changes) exist and are tested, but there is no settings screen and the
Team page can only invite, not edit or suspend. `POST /invites/accept` likewise
has no page — an invited user cannot currently accept from the UI.

### 3.9 Admin console (API richer than UI)

`GET /admin/organizations/:id` (detail with usage) and
`PATCH /admin/organizations/:id/plan` exist; the console lists organizations,
impersonates and replays the DLQ, but has no detail view, no plan-change form,
and **no button to end an impersonation session** (`POST
/admin/impersonate/:sessionId/end` is unused by the UI).

### 3.10 CI pipeline

`.github/workflows/ci.yml` runs lint, typecheck, the two invariant grep gates,
the test suite against a Redis service, gitleaks and `pnpm audit`. The plan also
specifies **coverage thresholds** (90% on services/engines/ai-tools), **docker
build**, **e2e** and **deploy** jobs — none are present.

### 3.11 Migrations

Only `migrations/003-journalentries-validator.ts` exists; 001 and 002 are absent
and **no migration runner is wired** (no `migrate-mongo` dependency or script).
Remaining: a runner, the missing migrations, and an init-container step for
deployments.

### 3.12 Payments UI depth

`POST /payments/:id/allocate` and `/refund` are implemented and tested but not
exposed in the UI — a payment can only be allocated at creation time.

---

## 4. ⛔ Not Started

| Feature                                                                                                            | Evidence                                                                                                                              | Notes                                                |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Inventory** — stock movements, warehouses, transfers, weighted-average valuation, batch/expiry, low-stock alerts | `models/Item.ts` has `trackInventory`, `openingQty`, `reorderLevel` fields but nothing reads them; no stock model                     | Sizeable v2 module                                   |
| **Credit notes / debit notes**                                                                                     | zero references in `apps/api/src`                                                                                                     | Needed for full GST compliance (returns/adjustments) |
| **E-way bill**                                                                                                     | zero references                                                                                                                       | Adjacent to the existing IRP client                  |
| **Recurring invoice profiles**                                                                                     | `Bill` has a `recurring` sub-document, but no scheduler acts on it; invoices have none                                                | Half a data model, no behaviour                      |
| **Period close / year-end**                                                                                        | `Company.booksLockedUpto` is enforced by the ledger but **no endpoint or UI sets it**; `period:close` permission exists and is unused | Small API + UI task, guard already written           |
| **Invoice PDF generation**                                                                                         | no PDF library, no template; `/invoices/:id/send` emails plain text                                                                   | Blocks "send a real invoice"                         |
| **Tally opening-balance import**                                                                                   | zero references                                                                                                                       | Named in the product brief                           |
| **TDS / TCS thresholds**                                                                                           | zero references                                                                                                                       |                                                      |
| **Realtime (`PROCESS_TYPE=ws`)**                                                                                   | `index.ts:59` logs "not built yet" and exits                                                                                          | Socket.IO push for notifications                     |
| **E2E tests (Playwright)**                                                                                         | no dependency, no specs, no CI job                                                                                                    | Plan asks for 6 critical journeys                    |
| **Container build / deployment**                                                                                   | no `Dockerfile`, no deploy workflow, no blue-green scripts                                                                            | `ops/nginx/finpilot.conf` exists as config only      |
| **OpenTelemetry tracing**                                                                                          | no `@opentelemetry/*` dependency; only Prometheus + Sentry are wired                                                                  | Phase 24 item left undone                            |

Also absent from GSTR-1: the **HSN summary** section (`GstEngine.ts` builds B2B
and B2CS only).

---

## 5. ❓ Unknown / needs the outside world

| Item                                                                   | Why it cannot be judged here                                                                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Third-party **penetration test** (zero critical/high)                  | requires an external vendor; `docs/runbooks/launch-checklist.md` tracks it                                                                                         |
| **Load targets** (§29.4: `GET /invoices` p95 < 200 ms @ 200 rps, etc.) | `scripts/load/k6-api.js` is written with pass/fail thresholds but has only ever been run against staging-sized data                                                |
| **Production-scale restore drill**                                     | `scripts/ops/restore-drill.sh` passed on dev data (8 s, 75 documents, recorded in `docs/runbooks/restore-drill-2026-Q3.md`); production-scale timing is unverified |
| **Real OCR accuracy**                                                  | depends on which vision provider is chosen in §3.3                                                                                                                 |

---

## 6. Test coverage map

| Suite                                                                                       |   Tests | What it proves                                                                                            |
| ------------------------------------------------------------------------------------------- | ------: | --------------------------------------------------------------------------------------------------------- |
| `ledger.spec.ts`                                                                            |      20 | every posting rule, immutability, gapless numbers under 100-way concurrency, 10,000-posting property test |
| `auth.spec.ts`                                                                              |      14 | rotation, reuse detection, lockout, 2FA, recovery codes, timing parity                                    |
| `coa.spec.ts`                                                                               |      13 | seed, tree integrity, system-account protection                                                           |
| `invoice.spec.ts`                                                                           |      12 | totals, tax split, posting lines, idempotency                                                             |
| `tenancy.spec.ts` / `rbac.spec.ts`                                                          | 11 / 11 | isolation at the query layer; role permissions and invites                                                |
| `parties-items.spec.ts`                                                                     |      10 | GSTIN checksum, rate history, imports                                                                     |
| `subscriptions.spec.ts`                                                                     |       8 | 402 + upgrade path, webhook activation, impersonation tagging                                             |
| `payments.spec.ts`                                                                          |       8 | allocation limits, advances, webhook replay                                                               |
| `ratelimit.spec.ts` / `observability.spec.ts` / `bills-expenses.spec.ts`                    |  7 each | limiter contracts; metrics/readiness/CSP/redaction/DLQ; approvals                                         |
| `ai.spec.ts`                                                                                |       6 | tenant overwrite, permission filtering, grounding, injection, budget                                      |
| `reports.spec.ts` / `ai-proposals.spec.ts`                                                  |  5 each | golden report figures; proposal safety                                                                    |
| `banking`, `documents`, `forecast`, `gst-returns`, `ims`, `notifications`, `reconciliation` |  4 each | each phase's acceptance criteria                                                                          |
| `queues.spec.ts` / `einvoice.spec.ts`                                                       |  3 each | DLQ + replay; async IRN and error semantics                                                               |
| `packages/shared`                                                                           |      21 | money maths and GST rules                                                                                 |

**Not covered by any test:** the React app (no component or e2e tests), the LLM
provider layer (`ai/provider.ts`), and the four wiring gaps in §3.1 — which is
precisely why they went unnoticed.

---

## 7. Suggested order of work

1. **Fix the four contract mismatches** (§3.1) — small, isolated, high visibility.
2. **Schedule the notification jobs** (§3.1 #4) — the feature is written and
   tested but silent in production.
3. **Finish the auth UI** (§3.2) — verification, reset and 2FA screens; an
   invited user currently cannot accept an invite from the app.
4. **Wire real OCR** (§3.3) — the single biggest gap between the demo and the
   product promise.
5. **Add e2e tests + coverage gates** (§3.10) — then the UI regressions above
   cannot recur.
6. **Then pick a v2 module** from §4 (period close is the smallest; inventory
   the largest).

---

_Method: this document was produced by reading the repository — every source
file listing, all 24 route groups, all 34 models, both engines, the services,
the worker, the test suites, CI, ops and docs. Where the plan and the code
disagree, the code is what is recorded here. No application code was modified
while writing it._
