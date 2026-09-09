# How FinPilot works — sections, and the flow through them

What each part of the sidebar is for, and how a real transaction travels from
one section to the next. Every figure below was read out of a running instance
with the demo books loaded, not written from memory.

If you want click-by-click instructions instead, [GUIDE.md](../GUIDE.md) walks
the same ground as a tutorial. This document is the map.

## The one idea that explains the layout

Very little in FinPilot writes to the ledger. **Issuing** a sales invoice,
**approving** a purchase bill or expense, and **recording a payment** account
for nearly every posting; Journal can also post a manual entry directly, which
is the escape hatch for the things a business document does not cover.
Everything else either prepares those events or reads what they produced.

That is why almost every screen has a two-step shape: a **draft** you can edit
freely, and an **act** that is permanent. A draft invoice is a form. An issued
one has consumed a gapless number and posted a balanced journal entry, and the
only way to undo it is a reversing entry. The same line runs through OCR (it
proposes; you confirm), the Copilot (it drafts; you post) and bank
reconciliation (it suggests; you match).

## What each section is for

| Section                             | What it is for                                                                                                                          | What it writes                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Dashboard**                       | Cash, receivables, payables, net profit, a health score and a 13-week cash projection. The attention panel lists what needs a decision. | Nothing — it only reads.                                    |
| **Core ledger → Chart of accounts** | The Schedule III account tree every posting lands in. Seed the 60-account Indian SME chart here on day one.                             | Accounts.                                                   |
| **Core ledger → Journal**           | Every posting, newest first, with its lines. You can post a manual entry and reverse an existing one.                                   | Journal entries (the only screen that writes one directly). |
| **Core ledger → Trial balance**     | Debits and credits per account, as of a date. The fastest check that the books balance.                                                 | Nothing.                                                    |
| **Core ledger → Parties & items**   | Customers, vendors, and the goods/services you sell. Credit terms live here, and they decide invoice due dates.                         | Parties and items.                                          |
| **Sales → Invoicing**               | Draft an invoice, then issue it. Issuing assigns the gapless number and posts to the ledger.                                            | Invoices, and a journal entry on issue.                     |
| **Purchases → Bills & expenses**    | Vendor bills and staff expense claims. Both are drafts until approved.                                                                  | Bills and expenses, and a journal entry on approval.        |
| **Purchases → Scan a bill (OCR)**   | Upload a PDF or a photo of a vendor bill; the fields are extracted with a confidence each.                                              | A stored document. It only _proposes_ a bill draft.         |
| **Money → Payments**                | Record money in and money out, allocated against specific invoices or bills.                                                            | Payments, and a journal entry.                              |
| **Money → Banking & reco**          | Bank accounts, statement import (CSV **or** scanned), and match suggestions between bank lines and documents.                           | Bank transactions; reconciliation matches you confirm.      |
| **Compliance → GST & IMS**          | GSTR-1/3B figures for a period, and the Invoice Management System records to accept or reject.                                          | IMS actions.                                                |
| **Reports → All reports**           | Trial balance, P&L, balance sheet, cash flow, AR and AP ageing, as of a date, exportable to CSV.                                        | Nothing.                                                    |
| **AI → Copilot**                    | Ask questions about your books. It answers from tool results and drafts entries as proposals.                                           | Nothing directly — proposals wait for you.                  |
| **Platform → Notifications**        | What the background workers want you to know.                                                                                           | Read receipts.                                              |
| **Platform → Team**                 | Invite people and set their role. Roles decide which of the above they see.                                                             | Members and invites.                                        |
| **Platform → Billing**              | Your plan, usage against its limits, and invoices.                                                                                      | Subscription changes.                                       |
| **Operator console**                | Only visible to super-admins: organisations, impersonation, dead-letter replay.                                                         | Admin actions, all audited.                                 |

## The flow, with real numbers

### 1. Set up once

**Chart of accounts** → seed the Indian SME chart. **Parties & items** → add
customers and vendors. Give customers **credit terms** here; without them an
invoice is due the day it is issued and your ageing report will read 100%
overdue on healthy books.

### 2. Sell something

**Sales → Invoicing.** You enter the customer, the date and the lines — a
description, a quantity, a rate, a GST rate. You never enter a total: the
server computes it and discards anything a client sends. Create draft, then
**Issue**.

Issuing an intra-state sale to a Gujarat customer, from the same Gujarat
company, splits the tax in two:

```
INV/2026-27/00050   Ahmedabad Retail LLP   taxable 14,500.00   total 17,110.00

  1130 Accounts Receivable        Dr 17,110.00
  4100 Sales                      Cr 14,500.00
  2120 GST Output — CGST          Cr  1,305.00
  2121 GST Output — SGST          Cr  1,305.00
```

The same sale to a Maharashtra customer is inter-state, so one IGST line
replaces the pair. Nothing in the form changes; the engine decides from the
two state codes:

```
INV/2026-27/00049   Maharashtra Mills      taxable 26,000.00   total 30,680.00

  1130 Accounts Receivable        Dr 30,680.00
  4100 Sales                      Cr 26,000.00
  2122 GST Output — IGST          Cr  4,680.00
```

### 3. Get paid

**Money → Payments.** Record the receipt and allocate it to the invoice. The
receivable clears and the invoice moves toward `paid`:

```
PAY/2026-27/00032   inflow   40,710.00

  1120 Bank Accounts              Dr 40,710.00
  1130 Accounts Receivable        Cr 40,710.00
```

### 4. Buy something

**Purchases → Bills & expenses.** A bill starts as a draft and posts nothing.
On **approve** it lands, and the GST you paid becomes an input credit you can
claim:

```
VB-2026-006   total 3,304.00

  5110 Purchases                  Dr 2,800.00
  1150 GST Input — CGST           Dr   252.00
  1151 GST Input — SGST           Dr   252.00
  2110 Accounts Payable           Cr 3,304.00
```

A draft bill is invisible to your books. If payables read ₹0 while bills exist,
they are waiting for approval.

### 5. …or photograph the bill instead of typing it

**Purchases → Scan a bill (OCR).** Upload a PDF or a photo. A clean digital PDF
is read from its own text layer for ₹0 and every field lands around 99%. A
photograph goes to Tesseract and reports the engine's own confidence. Fields
below the threshold come back **blank rather than guessed** — a blank asks you
to type it; a confident wrong number gets posted.

Pick the vendor, press **Create bill draft from this document**, and you rejoin
step 4 at the draft stage. Nothing posts until you approve.

Sample files with the expected results are in
[docs/dummy](dummy/README.md).

### 6. Reconcile the bank

**Money → Banking & reco.** Two ways in:

- **Import statement** — paste CSV with `Date,Narration,Amount,Ref`, where a
  negative Amount means money out.
- **Scan a statement** — upload a PDF or a photo. Where the statement prints a
  running balance, each row's amount and direction are re-derived from
  `balance(n) − balance(n−1)` and only accepted when the two readings agree;
  those rows are marked **✓ balance**. A row that cannot be settled honestly is
  shown verbatim for you to enter by hand rather than guessed at.

Either way the rows land in the review box and **nothing is stored until you
press Import**. Re-importing the same statement is safe: rows are
fingerprinted, so duplicates are skipped.

Then **Reconciliation suggestions** proposes matches between bank lines and
your invoices and bills. You confirm them; it never posts on its own.

### 7. File and report

**Compliance → GST & IMS** builds GSTR-1 and 3B for a period and syncs the IMS
records for you to accept or reject. **Reports** gives the trial balance, P&L,
balance sheet, cash flow and AR/AP ageing as of any date, with CSV export.
**Dashboard** summarises all of it and tells you what needs attention.

## Why the flow has these seams

The two-step shape is not ceremony. Four rules from
[CLAUDE.md](../CLAUDE.md) produce it:

- **The server computes every total.** You supply quantities and rates; totals,
  tax splits and payables are recomputed server-side and whatever a client sent
  is discarded.
- **Document numbers are gapless.** GST law requires no gaps, so a number is
  drawn atomically at issue and inside the same transaction. Drafts have no
  number because a draft may never exist.
- **Postings are append-only.** A posted entry is immutable; mistakes are fixed
  with a reversing entry that references the original. Hence Journal's
  **Reverse** rather than an edit.
- **The AI proposes, a human confirms.** OCR, the Copilot and reconciliation
  all stop one step short of writing.

## Try the whole thing

With the stack running (`scripts/start-local-stack.ps1`, then `pnpm dev` in
each app):

```bash
pnpm --filter @finpilot/api seed:demo    # a year of books: invoices, bills,
                                         # payments, a statement, OCR documents
```

The seed drives the real HTTP API end to end, so it doubles as a smoke test —
if a section is broken it fails there by name. It is re-runnable and reuses
what already exists rather than duplicating it.

Sign in as `owner@finpilot.demo` / `finpilot-demo-password1` and the numbers
quoted above are the ones you will see.
