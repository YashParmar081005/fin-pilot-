# Dummy documents for testing OCR

Real files for exercising **Scan a bill (OCR)** and **Banking & reco** by hand.
Not mock-ups: the PDFs carry a genuine text layer, the scans are genuine
image-only PDFs, and the photos are genuine JPEG/PNG rasters. Regenerate and
re-check them with:

```bash
pnpm --filter @finpilot/api dummy:docs               # write the files
pnpm --filter @finpilot/api dummy:verify             # bills/invoices -> what OCR read
pnpm --filter @finpilot/api dummy:verify:statement   # statements -> parsed rows
```

## Bills and invoices — Purchases → Scan a bill (OCR)

Upload, review the fields and their confidence, pick the vendor, then press
**Create bill draft from this document**. Results below are what the pipeline
actually produced, not predictions.

| File                             | Tier       | What it demonstrates                                                                                    |
| -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `bill-01-digital.pdf`            | text-layer | A clean digital bill. Every field at **99%**, GSTIN included. Never touches OCR, costs ₹0.              |
| `bill-02-scanned.pdf`            | vision     | Same bill with **no text layer** — one embedded JPEG. Rasterised, then Tesseract.                       |
| `bill-03-phone-photo.jpg`        | vision     | A photographed bill. Fields at **93%** — Tesseract's own score, not a constant.                         |
| `bill-04-phone-photo.png`        | vision     | The same photo as PNG: format makes no difference, results are identical.                               |
| `bill-05-totals-dont-add-up.pdf` | text-layer | Taxable + GST ≠ Total. The arithmetic cross-check fires: **"✗ mismatch"**, amounts come back **blank**. |
| `bill-06-poor-scan.jpg`          | vision     | Small, skewed, low-contrast, over-compressed. **Every field blank** — see below.                        |
| `invoice-01-digital.pdf`         | text-layer | A sales invoice with an inter-state (IGST) customer. All fields at 99%.                                 |
| `invoice-02-scanned.pdf`         | vision     | The same invoice scanned, forcing the OCR tier.                                                         |

## Bank statements — Money → Banking & reco

**Scan a statement** takes a PDF or a photo, reads the rows, and puts them in
the CSV box for review. Nothing is stored until you press **Import**, so a
misread statement cannot post itself.

| File                              | What it demonstrates                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `statement-01-digital.pdf`        | A statement with a running balance. **8 of 8 rows read, every one balance-confirmed.**                                     |
| `statement-02-scanned.pdf`        | The same statement with no text layer. 7 rows recovered, 1 refused — see below.                                            |
| `statement-03-photo.jpg`          | A photograph of it. Same result: **7 rows, 2 balance-confirmed, 1 flagged for manual entry.**                              |
| `bank-statement-aug-sep-2026.csv` | Skips OCR entirely — paste into **Import statement**. Header `Date,Narration,Amount,Ref`; **negative Amount = money out**. |
| `bank-statement-aug-sep-2026.pdf` | A statement without a balance column, for comparison.                                                                      |

### How a statement is read

An invoice has labelled fields. A statement is a **table**, and once OCR has
flattened it the columns are gone — every row is just a date, some words and a
few numbers. So the columns are recovered positionally and then _checked_:
because statements print a running balance, `balance(n) − balance(n−1)`
reproduces both the amount and its direction independently. When that delta
agrees with the amount read from the row, two separate readings agree and the
row is marked **✓ balance**.

When it does not agree, the row is **not imported**. In
`statement-03-photo.jpg` one line reads:

```text
01/09/2026 CHQ PAID OFFICE RENT SEPT 85,000.00 9,88,000.00
```

Tesseract misread the balance on the line above, so the delta no longer
matched, and "CHQ PAID OFFICE RENT" contains no DR/CR marker — there was no
honest way to tell whether ₹85,000 went in or out. It is shown verbatim for
you to type in rather than guessed at. Getting that wrong moves money the
wrong way round on a real ledger.

## Two things to expect, both correct

**The GSTIN comes back blank on every OCR'd bill.** A GSTIN is 15 alphanumeric
characters with a check digit. Tesseract reliably misreads at least one of them
(`...F1ZV` → `...F1Z2V`), the checksum rejects the result, and the field is
left empty rather than filled with something nearly right. A wrong GSTIN
silently files a wrong return; a blank one asks a human. plan.md §16 is
explicit — never guess a GSTIN. The digital PDFs read it fine at 99%, because
nothing is being recognised there.

**`bill-06` is the one worth looking at.** It used to report a date of
`05/09/2025` — the wrong year — at the same confidence every clean scan got,
because confidence was a flat per-tier constant rather than what the engine
reported. The extractor now passes Tesseract's own score through, so a degraded
scan sinks below the 0.7 floor and blanks its fields. A blank field says "type
this in"; a confidently wrong one gets posted.

## If you edit these files

Their wording is load-bearing. `parseInvoiceText` takes the **first**
`/(?:gst|tax)…([\d,]+)/` match, so a line like `CGST 9%: 5,400.00` placed above
the total captures `9` as the tax amount and breaks the arithmetic check. That
is why the percentage break-ups are kept out of the machine-read block.
