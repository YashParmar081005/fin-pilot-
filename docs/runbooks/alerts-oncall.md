# On-call runbook — alert responses (plan.md §27.4)

Severity contract: **P1 pages** (any hour). P2 notifies the channel, respond
within the working day. P3 lands in the daily digest.

## P1 — Ledger integrity violation {#ledger-integrity}

`finpilot_ledger_integrity_violations_total > 0` — the nightly job found an
unbalanced entry, account drift, or an entry-number gap. This is I2/I6 broken.

1. **Do not restart anything.** The violation is in the data, not the process.
2. Pull the violation detail: worker logs, `LEDGER INTEGRITY VIOLATIONS` line —
   it names the company, the check, and the entry/account.
3. `ledger_balance`: find the entry, compare `sum(debit)` vs `sum(credit)`.
   A posted entry can only be corrected by a **reversing entry** (I4) — never
   an update. Identify how it bypassed the three balance layers; that is the bug.
4. `account_drift`: recompute the account's balance from its journal lines;
   if the cached `currentBalancePaise` drifted, find the write that bypassed
   `GeneralLedger` (I3 violation) before fixing the cache.
5. `number_gap`: check the `counters` doc vs max entry number. A gap means a
   number was consumed outside a committed transaction (I6 violation).
6. Root cause lands in an incident note; the fix is a reversing entry plus a
   patch, never a manual `updateOne`.

## P1 — Trial balance does not balance (nightly job failure)

Same discipline as above: reversing entries only, find the bypass, no manual edits.

## P2 — DLQ depth > 10

1. `GET /api/v1/admin/dlq` (super-admin) — inspect payloads and error strings.
2. One poison job: fix the data it references, then **replay** from the DLQ UI.
3. Many jobs, same queue: the downstream (IRP, SMTP, …) is likely down —
   check its status, wait for recovery, replay in batch.

## P2 — API p99 > 2 s / 5xx > 1%

1. Grafana → "Errors by code" — one code spiking tells you the subsystem.
2. `SYS_RETRY_TRANSACTION` spikes → Mongo contention or replica set trouble:
   check `rs.status()` and replication lag.
3. Latency without errors → check Mongo pool saturation and queue depth;
   a runaway aggregation shows up in `mongotop`.

## P2 — Mongo replication lag > 10 s

Check the secondary's disk and network. If the lag grows unbounded, planned
failover BEFORE the oplog window closes; a resync at production size is hours.

## P3 — e-invoice failure rate

`reason=irp_unavailable` → IRP sandbox/GSP outage, retries are already backing
off; nothing to do unless the 24h cancel window nears (§14.4 deadline job warns).
`reason=irp_rejected` / `schema_invalid` → our data or mapping bug: the invoice
error is surfaced verbatim on the invoice; fix data, re-trigger.

## P3 — AI grounding failures

The validator is doing its job (I9) — users saw the raw-table fallback, never a
wrong number. Investigate if the rate is rising: usually a new report format
whose numerals the extractor does not recognise.

## Breach suspicion — any severity

Stop. Open `docs/runbooks/breach-notification.md`. The 72-hour clock starts at
**detection**, not at confirmation.
