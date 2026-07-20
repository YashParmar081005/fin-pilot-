# Restore drill — 2026-Q3

> Plan.md §31: "An untested backup is not a backup." Quarterly, on the calendar.

| Field         | Value                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Date          | 2026-07-21                                                                                                                     |
| Environment   | dev (Docker single-node replica set)                                                                                           |
| Method        | `scripts/ops/restore-drill.sh finpilot`                                                                                        |
| Source        | `finpilot` (8 collections, 75 documents)                                                                                       |
| Restored into | throwaway `restore_drill_20260721_012944`, dropped after verify                                                                |
| Verification  | per-collection `countDocuments` source vs restored — **all 8 match**; all indexes (unique, TTL, partial) rebuilt from metadata |
| Elapsed       | **8 s**                                                                                                                        |
| RTO target    | 3600 s (1 h) — **met**                                                                                                         |
| Result        | **PASSED**                                                                                                                     |

## What this drill does and does not prove

- **Proves:** the dump→restore→verify pipeline works end to end; index metadata
  (unique, TTL) survives the round trip; the script's mismatch detection works.
- **Does not prove:** restore time at production scale. Dev is 75 documents;
  production with millions of journal entries must be drilled on staging with a
  production-sized dataset before launch. Repeat there and record it here.
- **Reminder from §31:** also back up the S3/MinIO document bucket and the KMS
  key escrow. A restored database whose `totpSecretEnc` cannot be decrypted has
  locked out every user — the drill on staging must include a TOTP login
  against the restored data.

## Next drill

Due 2026-Q4. Staging, production-sized fixture, TOTP-decrypt check included.
