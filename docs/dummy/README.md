# Dummy documents for testing OCR

Real files for exercising **Scan a bill (OCR)** and **Banking & reco** by hand.
Not mock-ups: the PDFs carry a genuine text layer, the scans are genuine
image-only PDFs, and the photos are genuine JPEG/PNG rasters. Regenerate them
with:

```bash
pnpm --filter @finpilot/api dummy:docs     # write the files
pnpm --filter @finpilot/api dummy:verify   # upload each one and print what OCR read
```

## How to use them

1. Sign in and pick a company.
2. **Purchases → Scan a bill (OCR)** → _Choose File_ → pick one of the bills
   or invoices below.
3. The row appears with every field and its confidence. Pick the vendor and
   press **Create bill draft from this document** to turn it into a bill.
4. For the statement, go to **Money → Banking & reco → Import statement** and
   paste the CSV.

## What each file proves

Results below are what the pipeline actually produced, not predictions.

| File                              | Tier       | Cost | What it demonstrates                                                                                                                                                                           |
| --------------------------------- | ---------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bill-01-digital.pdf`             | text-layer | ₹0   | A clean digital bill. Every field read at **99%**, GSTIN included. Never touches OCR.                                                                                                          |
| `bill-02-scanned.pdf`             | vision     | ₹0   | Same bill with **no text layer** — one embedded JPEG. Rasterised, then Tesseract.                                                                                                              |
| `bill-03-phone-photo.jpg`         | vision     | ₹0   | A photographed bill. Fields at **93%** — Tesseract's own confidence.                                                                                                                           |
| `bill-04-phone-photo.png`         | vision     | ₹0   | The same photo as PNG: format makes no difference, results are identical.                                                                                                                      |
| `bill-05-totals-dont-add-up.pdf`  | text-layer | ₹0   | Taxable + GST ≠ Total. The arithmetic cross-check fires: **"✗ mismatch"** and the amounts come back **blank**.                                                                                 |
| `bill-06-poor-scan.jpg`           | vision     | ₹0   | Small, skewed, low-contrast, over-compressed. **Every field blank** — see below.                                                                                                               |
| `invoice-01-digital.pdf`          | text-layer | ₹0   | A sales invoice with an inter-state (IGST) customer. All fields at 99%.                                                                                                                        |
| `invoice-02-scanned.pdf`          | vision     | ₹0   | The same invoice scanned, forcing the OCR tier.                                                                                                                                                |
| `bank-statement-aug-sep-2026.csv` | —          | —    | For **Banking & reco → Import statement**. Header is `Date,Narration,Amount,Ref`; a **negative Amount means money out**. Re-importing is deduped by fingerprint, so it is safe to paste twice. |
| `bank-statement-aug-sep-2026.pdf` | text-layer | ₹0   | The same statement as a PDF, for eyeballing. Not a useful OCR target — see below.                                                                                                              |

## Three things worth understanding

**The GSTIN comes back blank on every OCR'd document, and that is correct.**
A GSTIN is 15 alphanumeric characters with a check digit. Tesseract reliably
misreads at least one of them (`...F1ZV` → `...F1Z2V`), the checksum rejects
the result, and the field is left empty rather than filled with a number that
is nearly right. A wrong GSTIN silently files a wrong return; a blank one
asks a human. plan.md §16 is explicit about this — never guess a GSTIN. The
digital PDFs read it fine at 99%, because nothing is being recognised.

**`bill-06` is the one to look at.** Before the confidence fix it reported a
date of `05/09/2025` — the wrong year — at the same 80% every other scan got,
because confidence was a flat per-tier constant rather than what the engine
actually reported. The extractor now passes Tesseract's own score through, so
a degraded scan sinks below the 0.7 floor and blanks its fields. A blank field
says "type this in"; a confidently wrong one gets posted.

**A bank statement is not an invoice.** Running the statement PDF through OCR
extracts the bank name and a date and nothing else, because the extractor
looks for invoice fields — a supplier, a document number, a taxable value.
That is expected. Statements belong in the CSV import, which parses the rows
properly and dedupes them. plan.md §16 lists table-heavy statements as the
Document AI escape hatch, which is not implemented.
