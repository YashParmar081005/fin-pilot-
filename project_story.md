# FinPilot AI — the project story

_A from-zero explanation of what this software is, who it is for, how a user
moves through it, and how the code fits together. Everything here was read out
of the actual source, not assumed. Written for a developer joining today._

---

## 1. The problem, in plain words

A small business owner in India has three recurring pains:

1. **Nobody reads their own books.** The owner wants to know "who owes me
   money?" and "will I have cash on the 15th?". Opening a report and
   interpreting it takes time they don't have, so they run the business on gut
   feeling.
2. **GST reconciliation eats days every month.** Under the IMS (Invoice
   Management System) rules, every supplier invoice must be accepted or
   rejected on the GST portal before the 14th. No action = _deemed accepted_,
   which means claiming input tax credit on invoices you may never have
   received. Doing that by hand for a few hundred invoices is misery.
3. **Bookkeeping is manual typing.** Vendor bills arrive as PDFs and phone
   photos, and somebody retypes them into Tally or Excel.

FinPilot is cloud accounting for Indian SMEs that automates 2 and 3, and
answers 1 in plain language — with a correctness guarantee: **the AI narrates
numbers that a deterministic engine computed; it never computes them itself.**

## 2. Who uses it

Five roles exist as real permission sets in
`packages/shared/src/constants/roles.ts`:

| Role              | What they can do                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Org Owner**     | everything in their organization: create companies, invite users, post/reverse entries, close periods, subscribe to a plan |
| **Company Admin** | same as owner minus creating/deleting companies                                                                            |
| **Accountant**    | post entries, invoice, approve expenses, reconcile, take IMS actions, read reports, use the Copilot                        |
| **Employee**      | submit expenses, ask the Copilot (read-only)                                                                               |
| **Auditor**       | read reports and export the audit log — **write-locked by permission, not by promise**                                     |

A sixth actor sits above all tenants: the **Super Admin** (platform operator), a
flag on the user record that no API can grant (`User.superAdmin`, stored with
`select: false`). It unlocks the admin console and audited impersonation.

The tenancy model is `Organization → Company → Users`. One CA firm can hold many
client companies under one login; a single business is just an organization with
one company.

## 3. What the software actually does today

Every row below maps to code that exists in this repository.

| Area                  | Implemented behaviour                                                                                                                                               | Where                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Auth**              | argon2id passwords, email verification, refresh-token rotation with family reuse detection, TOTP 2FA + recovery codes, lockout, timing-equalised failures           | `services/authService.ts`, `services/tokenService.ts`                   |
| **Tenancy & RBAC**    | organizations, companies, memberships, email invites, 5 seeded system roles, permission cache with instant invalidation                                             | `services/companyService.ts`, `memberService.ts`, `permissionCache.ts`  |
| **Chart of accounts** | 60-account Indian SME template (Schedule III groupings), tree with parent/path/depth, protected system accounts, re-parenting with cycle checks                     | `services/coa/indianSmeCoa.ts`, `accountService.ts`                     |
| **General Ledger**    | the single writer to `journalentries`: 13-step posting sequence in one transaction, gapless numbering, balance validation, reversal-only corrections, trial balance | `engines/ledger/GeneralLedger.ts`                                       |
| **Parties & items**   | customers/vendors with GSTIN checksum validation and outstanding balances; items with HSN/SAC and date-aware GST slabs; row import                                  | `services/partyService.ts`, `itemService.ts`                            |
| **Invoicing**         | draft → issue → send/cancel; server computes every total and the CGST/SGST vs IGST split; issue consumes a gapless number and posts to the ledger                   | `services/invoiceService.ts`                                            |
| **Bills & expenses**  | vendor bills and expenses with an approval step, ITC posting on approval, no self-approval                                                                          | `services/billService.ts`, `expenseService.ts`                          |
| **Payments**          | inflow/outflow, multi-document allocation, advances with GST on advance, refunds, Razorpay webhook capture with replay-safety                                       | `services/paymentService.ts`, `razorpayService.ts`                      |
| **Banking**           | bank accounts, CSV import with column mapping and fingerprint de-duplication, manual lines, Account-Aggregator consent flow (mock client)                           | `services/bankingService.ts`                                            |
| **Reconciliation**    | scored match suggestions (amount 0.6 + date 0.25 + narration 0.15), human confirm, "create entry from this line"                                                    | `services/reconciliationService.ts`                                     |
| **GST returns**       | GSTR-1 (B2B/B2CS) and GSTR-3B built from posted entries, each row traceable to journal entry ids                                                                    | `engines/gst/GstEngine.ts`                                              |
| **E-invoicing**       | asynchronous IRN generation through a queue, INV-01 payload build, 4xx = reject / 5xx = retry semantics, deadline warnings                                          | `jobs/einvoice.ts`, `integrations/irp/client.ts`                        |
| **IMS**               | sync inward records, auto-match against bills, accept/reject/pending with push-back, pending capped at one period, ITC-at-risk alarm                                | `services/imsService.ts`                                                |
| **Reports**           | trial balance, P&L, balance sheet, cash flow, AR/AP aging — any as-of date; CSV export through a background job                                                     | `services/reportService.ts`, `jobs/reportExport.ts`                     |
| **Documents / OCR**   | upload, field extraction with per-field confidence (low confidence → `null`, never guessed), arithmetic cross-check, "create bill draft from document"              | `services/documentService.ts`                                           |
| **AI Copilot**        | SSE streaming chat, permission-filtered tools, server-injected tenant, numeric grounding validation with one retry then a raw-data fallback, proposal-only writes   | `ai/gateway.ts`, `ai/registry.ts`, `ai/guardrails.ts`, `ai/provider.ts` |
| **Forecast & health** | deterministic 13-week P10/P50/P90 cash forecast, six-component health score with visible drivers, anomaly rules                                                     | `engines/forecast/index.ts`                                             |
| **Notifications**     | in-app + email + WhatsApp (mock BSP), per-channel and per-event preferences, idempotent per (event, user)                                                           | `services/notificationService.ts`, `jobs/notifications.ts`              |
| **Subscriptions**     | four plans, org-wide usage metering, 402 with an upgrade path when a limit is hit, Razorpay subscription create + activation webhook                                | `services/admin/subscriptionService.ts`                                 |
| **Admin console**     | organization list, plan change with a written reason, DLQ inspect/replay, impersonation with reason + action log + loud banner                                      | `services/admin/adminService.ts`, `routes/v1/admin.routes.ts`           |
| **Observability**     | Prometheus metrics (RED + domain), `/readyz` vs `/healthz`, Sentry hook, log redaction, alert rules, Grafana dashboard                                              | `observability/metrics.ts`, `ops/`                                      |

## 4. The ten rules the code is built around

These live in `CLAUDE.md` and are enforced in code, tests and CI. Read them
before changing anything.

1. **Money is an integer number of paise.** No floats, no `Decimal128`. Every
   money field name ends in `Paise`; formatting to `₹` happens once, in React
   (`formatINR`).
2. **Every journal entry balances** — checked in the schema, again inside the
   transaction, and again by a nightly job.
3. **`GeneralLedger` is the only writer** to the `journalentries` collection. CI
   greps for violations.
4. **Postings are append-only.** A mistake is fixed by a _reversing entry_;
   there is no edit and no delete.
5. **The server computes every total.** A client-supplied total is discarded.
6. **Document numbers are gapless** per company / financial year / series, taken
   from `counters` inside the same transaction (GST law requires it).
7. **Every mutating call is idempotent** via an `Idempotency-Key` header.
8. **Tenant isolation lives in the query layer** — a Mongoose plugin injects
   `companyId` into every query from AsyncLocalStorage context; a query with no
   resolved company throws.
9. **The AI never states a number it did not retrieve.**
10. **Nothing irreversible happens without a human clicking Confirm.**

## 5. Walking through the app as a user

### 5.1 Sign up and pick a company

`apps/web/src/App.tsx` renders a split-screen auth page. Register posts to
`POST /api/v1/auth/register` and immediately logs in via
`POST /api/v1/auth/login`. The access token is kept **in memory only**
(`apps/web/src/lib/api.ts`) — never `localStorage`; the refresh token is an
httpOnly cookie scoped to `/api/v1/auth`.

With no company yet, the user creates one (legal name, state code, optional
GSTIN). `companyService.create` implicitly creates the Organization, seeds the
five system roles, enforces the plan's company limit, and gives the creator an
active `owner` membership.

### 5.2 The shell

After picking a company the user lands in the sidebar shell: Dashboard, Core
ledger, Sales, Purchases, Money, Compliance, Reports, AI, Platform (and
Operator, only for super admins). Every request carries `X-Company-Id`, which is
how the backend resolves the tenant.

### 5.3 Seed the books

**Core ledger → Chart of accounts → Seed** calls
`POST /api/v1/accounts/import-template` and writes the 60-account Indian SME
chart. Everything else posts into these accounts.

### 5.4 Sell something (the flow that matters most)

1. The user adds a customer under **Parties & items**.
2. In **Invoicing** they enter lines: description, quantity, rate, GST rate.
   That is _all_ the client sends.
3. `POST /api/v1/invoices` → `invoiceService.createDraft` checks the monthly
   invoice quota, then computes taxable value, CGST/SGST or IGST (company state
   vs place of supply), discounts and grand total.
4. **Issue** (`POST /api/v1/invoices/:id/issue`) opens one MongoDB transaction
   that takes the next gapless number from `counters`, stamps the invoice, and
   calls `GeneralLedger.post` with the §12.2 lines — debit Accounts Receivable,
   credit Sales, credit GST Output. The ledger writes the entry, updates cached
   account balances, writes an audit row and an outbox event. If any step fails
   the whole thing aborts and **the number is not consumed**.
5. The outbox event is picked up by the worker (change stream, with a
   once-a-minute reaper as backup), which can queue IRN generation.
6. **Cancel** never deletes: it posts a reversing entry.

### 5.5 Record what you owe

Under **Purchases**, a vendor bill is recorded, waits in `pending_approval`, and
posts on **Approve** (debit Expense + debit GST Input Credit, credit Accounts
Payable). The approver may not be the submitter.

Alternatively **Scan a bill (OCR)** uploads a file as base64; the server
extracts vendor, GSTIN, bill number, date, taxable and total, each with a
confidence score. Anything below 0.7 confidence is stored as `null` and the UI
shows "not read — fill by hand". The user confirms vendor and GST rate, and
`POST /api/v1/bills/from-document/:id` creates a normal draft bill.

### 5.6 Money in and out

**Payments** records an inflow or outflow and optionally allocates it across
invoices/bills; anything unallocated on an inflow is treated as an advance (with
GST on advance). Razorpay payments arrive on their own through the HMAC-verified
webhook; a replayed webhook is a no-op.

**Banking & reco** imports a statement CSV (duplicates detected by fingerprint),
lists transactions, and offers scored match suggestions that a human confirms —
nothing posts by itself.

### 5.7 GST month-end

**Compliance → GST & IMS**: _Sync from IMS_ pulls inward records and matches
them against recorded bills (`matched` / `not_in_books`); the user accepts,
rejects, or parks each one and the action is pushed back. The GSTR-1 and GSTR-3B
tabs build returns from posted entries and export JSON. FinPilot prepares
returns; a human files them.

### 5.8 Ask the Copilot

Chat streams over Server-Sent Events. Per turn (`ai/gateway.ts`):

1. `assertBudget()` runs **before** any model call — over quota returns 402 and
   spends zero tokens.
2. The model sees only the tools the user's role permits.
3. Any tool call is re-scoped: `executeTool` overwrites the tenant with the
   server's own, so a prompt-injected foreign `companyId` cannot leak data.
4. The answer is validated: every numeral in it must appear in a tool result
   from this turn. Failure → one corrective retry → a raw verified data table.
5. Write requests ("draft an invoice…") create an `AiProposal` and write nothing
   else. The user sees the payload and clicks Confirm, which re-validates it
   through the same schemas and services a human uses.

### 5.9 The dashboard

The homepage aggregates ten API calls into KPI tiles (cash, receivables,
payables, profit), a health gauge, the 13-week cash band chart, weekly in/out
bars, quick actions, an attention list, plan usage meters and recent invoices.
The charts are hand-written inline SVG — no chart library.

## 6. System architecture

```text
Browser (React SPA, apps/web)
   │  fetch /api/v1/* — Vite proxy in dev, Nginx in production
   ▼
API process (apps/api, PROCESS_TYPE=api)
   requestId → metrics → helmet/CSP → CORS → JSON body (raw kept for webhooks)
   → cookies → global rate limit → route
   → authenticate → tenantResolve (AsyncLocalStorage) → authorize → idempotency
   → controller → service → GeneralLedger / GstEngine / forecast engine
   │                                        │
   ▼                                        └─ writes OutboxEvent in the same txn
MongoDB (replica set: transactions, change streams)
   ▲                     ▲
   │                     └── Worker process (PROCESS_TYPE=worker)
Redis (rate-limit Lua,        queues: email · e-invoice · report export
BullMQ queues)                crons: ledger integrity · overdue flip · outbox
                              reaper · idempotency sweep · subscription rollup
                              outbox publisher (change stream + reaper)
                                 │
                                 ▼
              External: IRP · GSP/IMS · Razorpay · Account Aggregator · LLM
```

**Two processes, one codebase.** `PROCESS_TYPE` selects the entrypoint in
`apps/api/src/index.ts`: `api` serves HTTP, `worker` consumes queues and runs
crons. (`ws` is reserved and deliberately exits with a message — realtime is not
built.)

**Why a replica set even in development:** transactions and change streams do
not exist on a standalone MongoDB, and the ledger cannot be correct without
transactions. `docker compose up -d` runs `rs.initiate()` as part of the Mongo
healthcheck.

## 7. Technology, and why each piece is there

| Layer          | Choice                                                                            | Reason visible in the code                                                      |
| -------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Language       | TypeScript (strict) everywhere                                                    | one contract package shared by client and server                                |
| API            | Express 5 + Mongoose 8                                                            | plain, well-understood middleware chain                                         |
| Database       | MongoDB **replica set**                                                           | transactions for the ledger, change streams for the outbox                      |
| Cache / queues | Redis 7 + BullMQ                                                                  | sliding-window and token-bucket Lua scripts, background jobs, dead-letter queue |
| Frontend       | React 19 + Vite 6, **zero UI dependencies**                                       | hash routing, hand-rolled fetch client, inline-SVG charts, CSS-variable theming |
| Validation     | Zod, in `packages/shared`                                                         | the same schema validates the form and the request                              |
| Auth           | argon2id + 15-minute JWT access + opaque rotating refresh                         | tokens never touch localStorage                                                 |
| AI             | provider interface (`ai/gateway.ts`) with Gemini / Groq / OpenAI / local variants | the model is replaceable; tests use a scriptable stub                           |
| Payments       | Razorpay                                                                          | Stripe is not self-serve for new Indian businesses                              |
| Observability  | prom-client, pino, Sentry                                                         | RED + domain metrics, redacted structured logs                                  |
| Tooling        | pnpm workspaces + Turborepo, ESLint, Prettier, Husky, Vitest                      | one command lints, typechecks and tests every package                           |

## 8. How the pieces fit together (the mental model)

- **`packages/shared` is the contract.** Money maths, GSTIN checksum, GST slab
  history, permission strings, plan limits and every request schema live there
  and are imported by both the API and the web app. Change a rule once.
- **Controllers are thin.** They parse, call a service, and shape the response.
  Business rules live in services; irreversible accounting lives in engines.
- **Engines own correctness.** `GeneralLedger` is the only thing allowed to write
  journal entries. `GstEngine` derives returns from what is already posted. The
  forecast engine is pure arithmetic — no LLM in the number path.
- **The tenant plugin is the security boundary.** `plugins/tenantScope.ts`
  injects `companyId` into every query, so a forgotten `where` clause cannot leak
  another company's data. The escape hatch (`skipTenantScope`) is greppable and
  CI-gated to a few sanctioned files.
- **The outbox decouples writes from side effects.** A posting writes an
  `OutboxEvent` in the same transaction; the worker publishes it. No lost
  e-invoice because an HTTP call failed mid-transaction.
- **The AI is a narrator, not a calculator.** It can only call registered read
  tools, its arithmetic is validated against those results, and its writes are
  proposals until a human confirms.

## 9. Running it locally

```bash
pnpm install
pnpm setup:env          # writes .env.local with generated secrets
docker compose up -d    # Mongo replica set, Redis, MinIO, Mailhog
pnpm dev                # API :4000 + worker :4002, web → http://localhost:5180
```

Dev endpoints: API `http://localhost:4000/healthz` and `/readyz`, metrics at
`/metrics`, Mailhog (all outgoing mail) at `http://localhost:8025`, MinIO console
`http://localhost:9101`. Redis is published on **6380**. Mongo is normally
**27017**, but this machine carries a gitignored `docker-compose.override.yml`
that moves it to **27018** because a standalone Windows `mongod` owns 27017 —
and a standalone server cannot run transactions, so the API refuses to boot
against it.

Tests: `pnpm test` (Vitest; integration specs need the replica set and Redis).
`pnpm lint` and `pnpm typecheck` cover every package.

## 10. Reading order for your first day

1. `CLAUDE.md` — the ten rules (10 minutes).
2. `packages/shared/src/money.ts` and `accounting.ts` — how money and normal
   balances work.
3. `apps/api/src/engines/ledger/GeneralLedger.ts` — the heart of the system.
4. `apps/api/src/plugins/tenantScope.ts` — how isolation is enforced.
5. `apps/api/src/services/invoiceService.ts` — one complete document flow.
6. `apps/api/tests/integration/ledger.spec.ts` — the tests that define
   correctness, including 100 concurrent postings producing gapless numbers.
7. `apps/web/src/App.tsx` — how the UI is wired, then any feature page.
8. `progress.md` (next to this file) — what is done, half-done and missing.

`plan.md` is the original 3,000-line specification: it is the _intent_.
`progress.md` records what the code actually does today.
