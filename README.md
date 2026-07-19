# FinPilot AI

AI-native finance & accounting copilot for Indian SMEs.
**Stack:** MERN (MongoDB · Express · React · Node.js) — pnpm workspace monorepo.

> The single source of truth for this project is [plan.md](plan.md). The invariants live in [CLAUDE.md](CLAUDE.md) — read them before writing any code.

## Prerequisites

- Node.js ≥ 22
- pnpm ≥ 10 (`npm i -g pnpm`)
- Docker Desktop (Mongo **replica set**, Redis, MinIO, Mailhog run in containers)

## Quick start

```bash
pnpm install
pnpm setup:env          # seeds .env.local from .env.example with a generated JWT secret
docker compose up -d    # mongo (1-node replica set, auto rs.initiate), redis, minio, mailhog
pnpm dev                # boots api (:4000) + worker + web (:5173)
```

Verify:

- `curl http://localhost:4000/healthz` → `200`
- `docker compose exec mongo mongosh --quiet --eval "rs.status().members[0].stateStr"` → `PRIMARY`
- Web: http://localhost:5173 · Mailhog: http://localhost:8025 · MinIO console: http://localhost:9101
- Dev ports: api 4000 · redis 6380 · minio 9100/9101 (6379/9000 belong to another local project)

## Workspace layout

```
packages/shared    the contract — Zod schemas, money helpers, permissions, constants (FE + BE)
packages/presets   shared tsconfig / eslint / prettier presets
apps/api           Express 5 API + worker (PROCESS_TYPE=api|ws|worker selects the entrypoint)
apps/web           React 19 + Vite 6 SPA
```

## Scripts

| Command          | What it does                               |
| ---------------- | ------------------------------------------ |
| `pnpm dev`       | api + worker + web, watch mode             |
| `pnpm test`      | Vitest across all workspaces               |
| `pnpm lint`      | ESLint across all workspaces               |
| `pnpm typecheck` | `tsc --noEmit` across all workspaces       |
| `pnpm format`    | Prettier write                             |
| `pnpm setup:env` | create `.env.local` with generated secrets |

## Build phases

Development follows the 24-phase plan in plan.md §32.

| Phase | Scope                                                             | Status |
| ----- | ----------------------------------------------------------------- | ------ |
| 0     | Repo and rails (monorepo, docker infra, env validation)           | ✅     |
| 1     | Error, response, request rails (envelope, AppError, requestId)    | ✅     |
| 2     | Auth (argon2id, refresh rotation + reuse detection, 2FA, lockout) | ✅     |
| 3     | Tenancy and RBAC (tenant plugin, roles, invites, perm cache)      | ✅     |
| 4     | Chart of accounts (60-account Indian SME COA, tree UI)            | ✅     |
| 5     | General Ledger engine (post/reverse/TB, gapless numbers, I2–I4)   | ✅     |
| 6     | Parties and items (GSTIN checksum, GST 2.0 rate history, imports) | ✅     |
| 7     | Invoicing (I5 totals, §12.2 GL posting, idempotency I7)           | ✅     |
| 8     | Bills, expenses, approvals (ITC posting, no self-approval)        | ✅     |
| 9     | Payments and allocation (advances + GST, Razorpay webhook)        | ✅     |
| 10    | Rate limiting (§19 layers, Lua, fail-open/closed, breakers)       | ✅     |
| 11    | Queues (BullMQ, outbox publisher, DLQ + replay, cron)             | ✅     |
| 12    | GST returns (GSTR-1/3B, journal-entry trace, TB reconciliation)   | ✅     |
| 13    | E-invoicing (async IRN, INV-01, 4xx/5xx semantics, 24h cancel)    | ✅     |
| 14    | IMS (sync + bill matcher, push-back, pending cap, ITC alarm)      | ✅     |
| 15    | Banking (CSV import + fingerprint dedupe, AA sandbox flow)        | ✅     |
| 16    | Reconciliation (scoring engine, human confirm, from-line entry)   | ✅     |
| 17    | Reports (TB/P&L/BS/cash flow/aged, queued CSV exports)            | ✅     |
| 18    | Documents/OCR (₹0 text layer, confidence contract, bill-from-doc) | ✅     |
| 19    | The AI Copilot                                                    | next   |
