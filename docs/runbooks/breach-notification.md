# Breach notification runbook — DPDP Act 2023 (plan.md §28.4)

FinPilot is a **Data Fiduciary**. On personal-data breach, notification to the
Data Protection Board of India and to affected Data Principals is mandatory.
**The clock is 72 hours from detection.** Detection means "we suspect", not
"we have confirmed".

## Hour 0 — detect and contain

- [ ] Note detection time (UTC + IST) in the incident doc. The clock runs.
- [ ] Assemble: on-call engineer, org owner, legal contact.
- [ ] Contain without destroying evidence: rotate the compromised credential,
      revoke the token family (`revokedReason: 'admin'`), block the IP at nginx.
      Do NOT wipe logs, do NOT restart Mongo, snapshot first.
- [ ] Preserve: Pino logs, `auditlogs`, `adminaudits`, `impersonationsessions`,
      `sessions` for the window, plus a Mongo snapshot.

## Hour 0–24 — scope

- [ ] Which collections/fields were readable or writable? Personal data means
      name, email, phone, PAN, GSTIN, bank data — not just credentials.
- [ ] Which companies (tenants)? The tenant plugin scoping means a leaked
      access token bounds the blast radius to that user's memberships —
      enumerate them from `memberships`.
- [ ] Was the ledger written? Run the integrity job on the affected companies
      immediately; violations → the incident is also a books-integrity incident
      (see alerts-oncall.md P1).

## Hour 24–72 — notify

- [ ] Draft the Board notification: nature of breach, data categories, principal
      count, containment done, remediation planned. Legal reviews. File it.
- [ ] Notify affected users via the notification service (email channel,
      `security.breach` event, no mute honoured for this event class).
- [ ] If payment data is in scope, notify Razorpay per their incident terms.

## After

- [ ] Post-mortem within 7 days: timeline, root cause, the control that failed
      (map it to the §28.1 threat-model row), and the code change that closes it.
- [ ] Update this runbook with what was slow or missing.
