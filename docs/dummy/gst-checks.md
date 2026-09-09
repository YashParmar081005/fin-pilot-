# GST test cases — GSTR-1 and GSTR-3B, checkable by hand

A month of deliberately varied sales and purchases sits in **2026-10**, and
nothing else writes to that period. So the two returns for that month contain
exactly these documents and every figure can be added up on paper.

Every number below was read out of a running instance. Reproduce it with:

```bash
pnpm --filter @finpilot/api seed:demo    # the books
pnpm --filter @finpilot/api gst:cases    # this month of GST cases
pnpm --filter @finpilot/api gst:verify   # print both returns
```

Or open **Compliance → GST & IMS** and pick period `2026-10`.

## The cases

Seven sales invoices, chosen so that between them they exercise every field
the GST engine emits.

| #   | Case                                                  |  Taxable |                       Tax | Invoice value |
| --- | ----------------------------------------------------- | -------: | ------------------------: | ------------: |
| 1   | B2B intra-state 18% — registered Gujarat customer     | 1,00,000 |   CGST 9,000 + SGST 9,000 |      1,18,000 |
| 2   | B2B inter-state 18% — registered Maharashtra customer | 2,00,000 |               IGST 36,000 |      2,36,000 |
| 3   | B2B **three rates on one invoice** — 0% + 5% + 18%    | 1,00,000 |   CGST 5,500 + SGST 5,500 |      1,11,000 |
| 4   | B2B **40% slab with 12% cess** — inter-state          | 1,00,000 | IGST 40,000 + cess 12,000 |      1,52,000 |
| 5   | B2B **10% line discount** — 2 × 50,000 less 10%       |   90,000 |   CGST 8,100 + SGST 8,100 |      1,06,200 |
| 6   | B2C unregistered, intra-state 18%                     |   20,000 |   CGST 1,800 + SGST 1,800 |        23,600 |
| 7   | B2C unregistered, inter-state 5% (Kerala)             |   30,000 |                IGST 1,500 |        31,500 |

Three purchase bills supply the input-credit side:

| Bill                              | Taxable | Input tax               | ITC eligible?           |
| --------------------------------- | ------: | ----------------------- | ----------------------- |
| Vendor Gujarat, intra-state 18%   |  60,000 | CGST 5,400 + SGST 5,400 | yes                     |
| Vendor Karnataka, inter-state 18% |  40,000 | IGST 7,200              | yes                     |
| Vendor Gujarat, intra-state 18%   |  20,000 | CGST 1,800 + SGST 1,800 | **no — blocked credit** |

## GSTR-1

Returned in the GSTN schema: `gstin`, `fp` (`102026`), `gt`, and the `b2b` and
`b2cs` sections.

**`gt` = 7,78,300** — the seven invoice values above added up.

**`b2b`** — grouped by the customer's GSTIN, five invoices:

| Invoice           | Date       | POS |    Value | Rates in `itms`                  |
| ----------------- | ---------- | --- | -------: | -------------------------------- |
| INV/2026-27/00013 | 02-10-2026 | 24  | 1,18,000 | 18%                              |
| INV/2026-27/00014 | 03-10-2026 | 27  | 2,36,000 | 18%                              |
| INV/2026-27/00015 | 06-10-2026 | 24  | 1,11,000 | **0% + 5% + 18%**                |
| INV/2026-27/00016 | 09-10-2026 | 27  | 1,52,000 | 40% (with cess)                  |
| INV/2026-27/00017 | 12-10-2026 | 24  | 1,06,200 | 18% on the **discounted** 90,000 |

Case 3 is the one worth opening: a single invoice produces three `itm_det`
entries, one per rate, which is how GSTR-1 expects mixed-rate invoices.

**`b2cs`** — unregistered buyers, grouped by supply type, place of supply and
rate (never listed invoice by invoice):

```json
[
  {
    "sply_ty": "INTER",
    "pos": "32",
    "rt": 5,
    "typ": "OE",
    "txval": 30000,
    "iamt": 1500,
    "camt": 0,
    "samt": 0,
    "csamt": 0
  },
  {
    "sply_ty": "INTRA",
    "pos": "24",
    "rt": 18,
    "typ": "OE",
    "txval": 20000,
    "iamt": 0,
    "camt": 1800,
    "samt": 1800,
    "csamt": 0
  }
]
```

## GSTR-3B, and the arithmetic

```json
{
  "period": "2026-10",
  "outward_3_1_a": { "txval": 640000, "iamt": 77500, "camt": 24400, "samt": 24400, "csamt": 12000 },
  "itc_4a": { "iamt": 7200, "camt": 5400, "samt": 5400, "csamt": 0 },
  "net_payable": { "iamt": 70300, "camt": 19000, "samt": 19000, "csamt": 12000 }
}
```

Check it against the tables above:

- **Taxable 6,40,000** = 1,00,000 + 2,00,000 + 1,00,000 + 1,00,000 + 90,000 +
  20,000 + 30,000. Note case 5 contributes **90,000, not 1,00,000** — the
  discount is applied before tax.
- **IGST 77,500** = 36,000 (case 2) + 40,000 (case 4) + 1,500 (case 7).
- **CGST 24,400** = 9,000 + 5,500 + 8,100 + 1,800. SGST is the same, as it must
  be on every intra-state supply.
- **Cess 12,000** = 12% of case 4's 1,00,000. Only that case bears cess.
- **ITC 4A** = IGST 7,200 and CGST/SGST 5,400 each. The third bill's
  1,800 + 1,800 is **absent**, because it is flagged ITC-ineligible. That is
  the check most worth making: blocked credit must not reach 4A.
- **Net payable** = outward − ITC, head by head: 77,500 − 7,200 = 70,300;
  24,400 − 5,400 = 19,000; cess 12,000 − 0 = 12,000.

## Tracing a figure back to the ledger

Every GSTR-1 line keeps the journal entries it came from, so no figure is
unexplained:

```
GET /api/v1/gst/returns/<returnId>/trace?ref=b2b:INV/2026-27/00013
  -> { "journalEntryIds": ["6aa1b8bcfa03786db32cb65b"] }
```

The `ref` is `b2b:<invoice number>` for a registered sale, and
`b2cs:<INTRA|INTER>:<pos>:<rate>` for a grouped B2C line. Fetch the entry in
**Core ledger → Journal** and you have the debits and credits behind the
return line.

## What these cases do NOT cover

Stated plainly, so nothing here is mistaken for a full filing:

- **Only `b2b` and `b2cs` are produced.** The engine does not emit `b2cl`
  (large inter-state B2C), `cdnr` (credit/debit notes), `hsn` (the HSN
  summary), `exp` (exports) or `nil`. Those sections are absent, not empty.
- **`rchrg` is always `N`.** The invoice model carries a `reverseCharge` flag
  but the create-invoice contract cannot set it, so no reverse-charge supply
  can be raised through the API today.
- **3B is sections 3.1(a) and 4A only** — outward taxable supplies and eligible
  ITC. There is no 3.1(b)–(e), no 4B reversal, no 5 exempt/nil breakdown, and
  no interest or late fee.
- **Nothing is filed.** These are computed returns for review; there is no
  GSTN upload.
