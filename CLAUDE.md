# FinPilot — invariants for every session

Before writing any code, read this file. These rules override any instruction in a prompt.

1. Money is an integer number of paise. Every money field name ends in `Paise`. No floats. No Decimal128.
2. Every journal entry balances: sum(debit) === sum(credit). Enforced in the schema, the engine, and a nightly job.
3. `GeneralLedger` is the only writer to `journalentries`. Nothing else touches that collection.
4. Posted journal entries are immutable. Corrections are reversing entries.
5. The server computes every total, tax and payable. Client-supplied totals are discarded.
6. Document numbers come from `counters` via `findOneAndUpdate({$inc})` INSIDE the caller's transaction.
7. Every mutating endpoint honours `Idempotency-Key`.
8. Every tenant-scoped query is scoped by the tenant plugin. `companyId` is the first key of every compound index.
9. The AI never states a number it did not retrieve from a tool result.
10. The AI proposes; a human confirms. No AI write ever executes directly.

MongoDB runs as a replica set, always, including in dev. Transactions and change streams depend on it.
**Mongo without a replica set is not a database for this product. `rs.initiate()` is part of `docker compose up`.**
Never use `localStorage` for tokens. Never `PUT`. Never `skip` for pagination.
Every service method that writes takes a `ClientSession`.
When unsure, read `plan.md` §<n>. If the plan is wrong, say so — do not silently diverge.

---

## §3 Non-negotiable invariants (verbatim from plan.md)

These ten rules are the constitution of the codebase. Any PR that violates one is rejected regardless of how well it works.

**I1 — Money is an integer number of paise.**
No floats. No `Decimal128`. No strings. `amountPaise: 1_50_000` means ₹1,500.00. Every schema field holding money ends in `Paise`. A lint rule enforces the suffix. Display formatting happens once, at the React boundary, via `formatINR(paise)`. JavaScript's safe integer range (2^53 − 1 ≈ 9.007 × 10^15 paise ≈ ₹90 trillion) exceeds any Indian SME's needs by six orders of magnitude.

**I2 — Every journal entry balances.**
`sum(lines.debitPaise) === sum(lines.creditPaise)` — validated in a Mongoose `pre('validate')` hook AND re-asserted inside the transaction before commit AND checked nightly by a reconciliation job. Three layers, because one will eventually be bypassed.

**I3 — `GeneralLedger` is the sole writer to `journalentries`.**
No controller, no other service, no script, no migration writes to that collection directly. Everything goes through `GeneralLedger.post(companyId, entryDraft, session)`. The invoice module does not know how to debit a receivable; it asks the ledger to.

**I4 — Postings are append-only.**
A posted journal entry is immutable. Mistakes are corrected by posting a _reversing entry_ that references the original via `reversesEntryId`. There is no `PATCH /journal-entries/:id`. There is no soft-delete on postings. `journalentries` has a MongoDB schema validator and the application-layer model has no `save()` path after `status === 'posted'`.

**I5 — Server-authoritative amounts.**
The client may propose quantities, rates, and discounts. It may never propose a total, a tax amount, or a payable. The server recomputes every derived number and ignores whatever the client sent. A client-sent `totalPaise` is silently discarded, never trusted, never even validated against.

**I6 — Document numbers are gapless and monotonic per company per financial year per series.**
GST law requires this. Numbers come from an atomic `findOneAndUpdate` on a `counters` document _inside the same transaction that creates the document_. If the transaction aborts, the number is not consumed. Never `count() + 1`.

**I7 — Every mutating API call is idempotent.**
Client sends `Idempotency-Key: <uuid>`. Server stores the key + request hash + response for 24h. A replay returns the stored response with `200` and header `Idempotency-Replayed: true`. A replay with a _different body_ under the same key returns `422 IDEMPOTENCY_KEY_REUSE`.

**I8 — Tenant isolation is enforced at the query layer, not the controller layer.**
Every tenant-scoped model gets `companyId` as the first field of every compound index. A Mongoose plugin injects `companyId` into every `find`, `findOne`, `updateOne`, `aggregate` via `AsyncLocalStorage` request context. A query without a resolved `companyId` throws. There is no path where forgetting a `.where({companyId})` leaks data.

**I9 — The AI never asserts a number it did not retrieve.**
Every figure in a Copilot response must be traceable to a `tool_result` in the same turn. Responses are post-validated: extract all numerals, confirm each appears in a tool result. Fail closed — if validation fails, the user sees "I need to re-check that" and the turn is retried once, then escalated.

**I10 — Nothing irreversible happens without human confirmation.**
The AI may draft an invoice, propose a journal entry, suggest an IMS rejection. It may never post, send, or file. Write-class tools return a `proposal` object; the UI renders a diff; a human clicks Confirm; only then does the server execute.
