# FinPilot — end-to-end user guide

How to run the software and use every feature, in the order a real business would.

---

## 1. Start the software (development)

Prerequisites: Node.js ≥ 22, pnpm ≥ 10, Docker Desktop.

```bash
pnpm install
pnpm setup:env          # creates .env.local with generated secrets
docker compose up -d    # MongoDB replica set, Redis, MinIO, Mailhog
pnpm dev                # API :4000 + background worker + web app
```

Open the web app at the address Vite prints (usually **http://localhost:5173** —
it picks the next free port if that one is busy). Useful side doors:

| What                            | Where                           |
| ------------------------------- | ------------------------------- |
| API health                      | http://localhost:4000/healthz   |
| Readiness (DB primary + Redis)  | http://localhost:4000/readyz    |
| Every email the app sends (dev) | http://localhost:8025 (Mailhog) |
| Prometheus metrics              | http://localhost:4000/metrics   |

> Tip: `docker compose -f docker-compose.observability.yml up -d` also starts
> Prometheus (:9090) and Grafana (:3001, admin/admin — import
> `ops/grafana/finpilot-dashboard.json`).

---

## 2. Create your account and company

1. On the app's login screen click **"New here? Create an account"**, enter your
   name, email and a password (8+ characters), and submit — you're signed in
   immediately. A verification email lands in Mailhog.
2. Create your first **company**: legal name, state code (e.g. `24` = Gujarat,
   `27` = Maharashtra — it drives CGST+SGST vs IGST), and optionally your GSTIN
   (it is checksum-validated; a typo is rejected on the spot).
3. Pick the company. You land on the **Dashboard**.

Your organization is created implicitly with your first company, on the **free
plan**: 1 company, 3 users, 50 invoices/month, 200k AI tokens.

**Interface basics:** the 🌙/☀️ button (top right) switches dark/light theme; the
`◀` button on the sidebar edge collapses it to icons; the red number on
_Notifications_ is your unread count. Amounts are always shown in ₹ but stored
as integer paise — the engine never touches floats.

## 3. Seed the chart of accounts

Go to **Core ledger → Chart of accounts** and click **"Seed the Indian SME
chart (60 accounts)"**. This creates a Schedule-III-grouped chart — bank,
receivables, payables, GST input/output, sales, expense heads — that every
other module posts into. You can add custom accounts later; system accounts
are protected.

## 4. Add the people you do business with

**Core ledger → Parties & items**

- Add **customers** (who you invoice) and **vendors** (who bill you). GSTIN is
  optional but validated. Outstanding receivable/payable per party shows here.
- Add **items/services** with HSN/SAC and a GST rate (GST 2.0 slabs: 0/5/18/40).

## 5. Invoice a customer (Sales)

**Sales → Invoicing**

1. Pick the customer, set the issue date, add lines: description, qty, rate,
   GST rate. Click **Create draft**.
2. You typed only qty/rate — **the server computes every total** (subtotal,
   CGST/SGST or IGST by your state vs the customer's, grand total). Whatever a
   client sends as a "total" is discarded.
3. Click **Issue** on the draft. This is the real event: the invoice receives
   the next **gapless number** (`INV/2026-27/00001` — GST law requires no
   gaps), and a balanced journal entry posts to the ledger automatically
   (Dr Receivables / Cr Sales / Cr GST output).
4. **Email** sends it to the customer (see it in Mailhog in dev). **Cancel**
   never deletes — it posts a reversing entry; the number stays consumed.
5. If the company has e-invoicing enabled, the IRN generates in the background
   — the e-invoice status chip shows pending → generated.

## 6. Record what you owe (Purchases)

**Purchases → Bills & expenses**

- **Vendor bill**: pick the vendor, their bill number, date, amount, GST rate →
  **Record bill**. It waits in `pending_approval`; clicking **Approve** posts it
  (Dr Expense + Dr GST input credit / Cr Payables). You cannot approve what you
  yourself submitted — the server refuses self-approval.
- **Expense**: pick the expense account, describe it, submit; same approval flow.

### …or photograph the bill instead

**Purchases → Scan a bill (OCR)**

1. Upload a PDF or photo of a vendor bill.
2. The extractor reads vendor name, GSTIN, bill number, date, taxable and total
   amounts — each with a **confidence percentage**. A clean PDF costs ₹0 to
   read. A field the OCR isn't sure about shows _"not read — fill by hand"_:
   **it never guesses**.
3. Confirm the vendor and GST rate, click **Create bill draft** — the draft
   appears under Bills for the normal approval flow. A human confirms every
   entry; OCR only drafts.

## 7. Money in, money out

**Money → Payments**

- Record an **inflow** when a customer pays: amount, method (UPI/NEFT/…),
  deposit account, and optionally allocate it to an open invoice. Allocation
  drives the invoice to `partially_paid`/`paid`. An unallocated inflow is an
  **advance** — GST on advances posts automatically.
- Record an **outflow** when you pay a vendor bill.
- Razorpay payments arrive on their own through the webhook and settle
  invoices automatically; a replayed webhook is a no-op.

**Money → Banking & reco**

1. Create a bank account, then paste your bank statement CSV
   (`Date,Narration,Amount,Ref` header) and **Import**. Re-importing the same
   lines is safe — duplicates are fingerprint-detected and skipped.
2. **Reconciliation suggestions** appear with a score and reasons (amount
   match, date proximity, name in narration). Nothing posts by itself —
   **you** click _Confirm match_. Unmatched bank charges can be posted
   directly to an expense account from the line.

## 8. GST compliance

**Compliance → GST & IMS** (pick the period at the top)

- **IMS** — since the 2026 rules you must accept/reject every supplier invoice
  before the 14th; silence = deemed accepted. Click **Sync from IMS**, and each
  inward record is auto-matched against your books:
  - `matched` — the bill exists → **Accept**
  - `not_in_books` — you never recorded it (possibly fake) → **Reject**
  - `pending` — parks it for at most one period (the law caps it)
    Every action pushes back to the portal through the GSP.
- **GSTR-1** and **GSTR-3B** tabs prepare the returns from your ledger (every
  figure traceable to journal entries) and **Export JSON** in the GSTN shape.
  FinPilot prepares; you or your CA file.

## 9. Reports

**Reports → All reports**: Trial balance, P&L, Balance sheet, Cash flow, AR/AP
aging — as of any date. **Export CSV** queues the export and downloads it when
ready. The trial balance page also asserts debits = credits in front of you.

## 10. Ask the AI Copilot

**AI → Copilot**

Ask in plain language: _"what was my revenue this month"_, _"who owes me
money"_, _"draft an invoice for Acme Retail for ₹5,000 consulting at 18% GST"_.

Two guarantees, enforced server-side:

- **Every number is real.** The model calls read-tools against your books; its
  answer is validated so that every figure appeared in a tool result. If
  validation fails twice you get the verified raw table instead of prose.
- **It never writes.** A drafting request produces a **proposal** in the inbox
  below the chat. You see the exact payload and click **Confirm — execute for
  real** (the server recomputes everything through the same services a human
  uses) or **Reject**. Proposals expire on their own.

The dashboard's health score, 13-week cash forecast and anomaly signals are
**deterministic math**, not an LLM — hover the health chips for the formulas.

## 11. Notifications, team, billing

- **Platform → Notifications**: in-app feed (overdue invoices daily, GST due
  dates on the 8th/17th) + per-channel and per-event mute preferences.
- **Platform → Team**: invite an accountant, admin, employee or **auditor**
  (read-only by permission, not by promise) by email. The invitee registers
  with that email, then accepts from the invite link.
- **Platform → Billing**: live usage meters (invoices, AI tokens, OCR pages vs
  your plan). Hitting a limit returns a clear "upgrade" error everywhere in the
  app; the org owner upgrades here — Razorpay hosts the checkout and the plan
  activates on the payment webhook.

## 12. Operator console (super-admins only)

An **Admin console** section appears only for platform operators: organization
list with plans, manual plan changes (reason required, audited), dead-letter
queue replay, and **impersonation** — which demands a written reason, lights a
red banner across the impersonated session, logs every request, and dies the
moment you end it.

---

## The guarantees underneath (why you can trust the numbers)

1. Money is integer paise end-to-end; formatting to ₹ happens only on screen.
2. Every journal entry balances — validated three separate ways.
3. One engine writes the ledger; nothing else can.
4. Posted entries are immutable; corrections are reversing entries.
5. The server computes every total; client-sent totals are discarded.
6. Document numbers are gapless per company/FY/series (GST law).
7. Every mutating request is idempotent — a double-click can't post twice.
8. Tenant isolation is enforced in the query layer; a company can never see
   another's rows.
9. The AI never states a number it didn't retrieve.
10. Nothing irreversible happens without a human clicking Confirm.
