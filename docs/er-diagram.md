# FinPilot — entity relationship diagram

The 33 collections, their keys, and how they reference one another.

Extracted from the Mongoose schemas in `apps/api/src/models`, so this is what
the code actually declares rather than a design sketch. For the runtime picture
— processes, layers, queues — read [architecture.md](./architecture.md); for
what each screen does, [how-it-works.md](./how-it-works.md).

---

## Two rules shape the whole schema

**Everything tenant-scoped carries `companyId`, and it is the first key of every
compound index.** It is omitted from the per-domain diagrams below only to keep
them readable — assume it on every entity except the seven listed as
organization- or user-scoped (`Organization`, `User`, `Role`, `Membership`,
`Session`, `VerificationToken`, `Subscription`) and the four global ones
(`IdempotencyKey`, `DeadLetter`, `AdminAudit`, `ImpersonationSession`).

**Every money-moving document points at exactly one `JournalEntry`.** Invoice,
Bill, Expense, Payment and Reconciliation each hold a `journalEntryId`. That
field is the seam between the document world and the books: the document records
_what was agreed_, the journal entry records _what it did to the accounts_.

---

## The map

```mermaid
flowchart TB
    subgraph tenancy [Tenancy and identity]
        ORG[Organization] --> CO[Company]
        USR[User] --> MEM[Membership]
        ROLE[Role] --> MEM
        CO --> MEM
    end

    subgraph books [The books]
        ACC[Account]
        JE[JournalEntry]
        CTR[Counter]
    end

    subgraph docs [Documents]
        INV[Invoice]
        BILL[Bill]
        EXP[Expense]
        PAY[Payment]
        PARTY[Party]
        ITEM[Item]
        DOC[Document]
    end

    subgraph bank [Banking]
        BA[BankAccount]
        BT[BankTransaction]
        REC[Reconciliation]
    end

    subgraph gst [Compliance]
        GR[GstReturn]
        IMS[ImsRecord]
    end

    CO --> ACC
    CO --> docs
    CO --> bank
    CO --> gst

    INV -->|journalEntryId| JE
    BILL -->|journalEntryId| JE
    EXP -->|journalEntryId| JE
    PAY -->|journalEntryId| JE
    REC -->|journalEntryId| JE
    JE -->|lines.accountId| ACC
    CTR -.->|"numbers invoices,<br/>bills, payments"| docs
    BA -->|ledgerAccountId| ACC
    IMS -.->|matchedBillId| BILL
```

Read it as: a company owns a chart of accounts and a pile of documents; every
document that moves money resolves to a journal entry; every journal line lands
on an account.

---

## 1. Tenancy and identity

```mermaid
erDiagram
    ORGANIZATION ||--o{ COMPANY : "owns"
    ORGANIZATION ||--o{ ROLE : "defines"
    ORGANIZATION ||--o| SUBSCRIPTION : "is billed by"
    USER ||--o{ ORGANIZATION : "owns"
    USER ||--o{ MEMBERSHIP : "holds"
    COMPANY ||--o{ MEMBERSHIP : "grants"
    ROLE ||--o{ MEMBERSHIP : "confers"
    USER ||--o{ SESSION : "opens"
    USER ||--o{ VERIFICATIONTOKEN : "is issued"

    ORGANIZATION {
        ObjectId _id PK
        ObjectId ownerUserId FK
        string name
        string slug UK
        string plan
    }
    COMPANY {
        ObjectId _id PK
        ObjectId organizationId FK
        string legalName
        string gstin
        string stateCode "drives CGST+SGST vs IGST"
        date booksBeginDate
        int aggregateTurnoverPaise
    }
    USER {
        ObjectId _id PK
        string email UK
        string passwordHash "argon2"
        string totpSecretEnc
        bool superAdmin
    }
    MEMBERSHIP {
        ObjectId _id PK
        ObjectId userId FK
        ObjectId companyId FK
        ObjectId roleId FK
        string status "invited, active, revoked"
    }
    ROLE {
        ObjectId _id PK
        ObjectId organizationId FK
        string key "owner, accountant, clerk"
        array permissions
        bool isSystem
    }
    SESSION {
        ObjectId _id PK
        ObjectId userId FK
        string familyId "refresh rotation family"
        string tokenHash
        date expiresAt
    }
    SUBSCRIPTION {
        ObjectId _id PK
        ObjectId organizationId FK
        string plan
        string razorpaySubscriptionId
        object usage
    }
    VERIFICATIONTOKEN {
        ObjectId _id PK
        ObjectId userId FK
        string purpose
        string tokenHash
    }
```

`MEMBERSHIP` is the join that makes tenancy work: a user reaches a company only
through an active membership, and `tenantResolve` checks it on every request
before any query runs.

---

## 2. The books

```mermaid
erDiagram
    COMPANY ||--o{ ACCOUNT : "has chart of"
    ACCOUNT ||--o{ ACCOUNT : "is parent of"
    COMPANY ||--o{ JOURNALENTRY : "posts"
    JOURNALENTRY ||--|{ JOURNALLINE : "balances across"
    JOURNALLINE }o--|| ACCOUNT : "debits or credits"
    JOURNALLINE }o--o| PARTY : "attributed to"
    JOURNALLINE }o--o| ITEM : "attributed to"
    JOURNALENTRY ||--o| JOURNALENTRY : "reverses"
    COMPANY ||--o{ COUNTER : "numbers from"

    ACCOUNT {
        ObjectId _id PK
        ObjectId companyId FK
        ObjectId parentId FK "self, the tree"
        string code UK "1120, 5110"
        string type "asset, liability, equity, income, expense"
        string subType
        string path "materialised, 1000-1100-1120"
        int depth
        bool isSystem "cannot be deleted"
        int currentBalancePaise
    }
    JOURNALENTRY {
        ObjectId _id PK
        ObjectId companyId FK
        string entryNumber UK "gapless per fy"
        date date
        string fy
        string narration
        int totalDebitPaise "must equal credit"
        int totalCreditPaise
        string status "posted, immutable"
        ObjectId reversesEntryId FK
        ObjectId reversedByEntryId FK
        ObjectId postedBy FK
    }
    JOURNALLINE {
        int lineNo PK "embedded in entry"
        ObjectId accountId FK
        int debitPaise
        int creditPaise
        ObjectId partyId FK
        ObjectId itemId FK
        object gst "rate, taxable, hsn, component"
    }
    COUNTER {
        string _id PK "companyId:fy:series"
        int seq "incremented in the caller transaction"
        string prefix
        int width
    }
```

Three things this diagram encodes that matter:

- **`JOURNALLINE` is embedded, not a collection.** An entry and its lines are one
  document, so the balance rule is enforced by a single schema hook and a posting
  can never half-commit.
- **`ACCOUNT.parentId` plus `path`** is a materialised-path tree. Reparenting
  rewrites the whole subtree's `path`, which is why there is a cycle check.
- **`reversesEntryId` / `reversedByEntryId`** are how corrections work. There is
  no update path on a posted entry.

`JOURNALENTRY.source` also carries a polymorphic `{ type, documentId,
documentModel }` pointing back at whatever caused the posting — one of `manual`,
`invoice`, `bill`, `payment`, `expense`, `bank`, `opening_balance`, `reversal`,
`depreciation`, `fx`, `closing`, `ai_proposed`.

---

## 3. Sales, purchases and parties

```mermaid
erDiagram
    PARTY ||--o{ INVOICE : "is billed"
    PARTY ||--o{ BILL : "supplies"
    PARTY ||--o{ PAYMENT : "pays or is paid"
    INVOICE ||--|{ INVOICELINE : "itemises"
    BILL ||--|{ BILLLINE : "itemises"
    INVOICELINE }o--o| ITEM : "of"
    BILLLINE }o--o| ITEM : "of"
    INVOICE ||--o| JOURNALENTRY : "posted as"
    BILL ||--o| JOURNALENTRY : "posted as"
    EXPENSE ||--o| JOURNALENTRY : "posted as"
    PAYMENT ||--o| JOURNALENTRY : "posted as"
    PAYMENT ||--o{ PAYMENTALLOCATION : "settles through"
    PAYMENTALLOCATION }o--|| INVOICE : "against, when documentModel is Invoice"
    PAYMENTALLOCATION }o--|| BILL : "against, when documentModel is Bill"
    PARTY }o--o| ACCOUNT : "receivable and payable"
    ITEM }o--o| ACCOUNT : "income, expense, inventory"
    EXPENSE }o--|| ACCOUNT : "charged to"
    DOCUMENT }o--o| BILL : "was scanned into"

    PARTY {
        ObjectId _id PK
        array type "customer, vendor, or both"
        string name
        string gstin
        string gstRegistrationType
        ObjectId receivableAccountId FK
        ObjectId payableAccountId FK
        int outstandingReceivablePaise "denormalised, display only"
        int outstandingPayablePaise "denormalised, display only"
    }
    INVOICE {
        ObjectId _id PK
        string invoiceNumber UK
        ObjectId partyId FK
        object partySnapshot "frozen at issue"
        string placeOfSupplyStateCode
        string supplyType "intra or inter state"
        int taxableValuePaise
        int cgstPaise
        int sgstPaise
        int igstPaise
        int grandTotalPaise
        int amountDuePaise
        string status "draft, issued, paid, cancelled"
        ObjectId journalEntryId FK
        object eInvoice "irn, ackNo, qr"
    }
    BILL {
        ObjectId _id PK
        ObjectId partyId FK
        string vendorBillNumber
        int itcEligiblePaise
        int grandTotalPaise
        int amountPaidPaise
        string status "draft, approved, cancelled"
        ObjectId journalEntryId FK
    }
    EXPENSE {
        ObjectId _id PK
        int amountPaise
        ObjectId expenseAccountId FK
        string status "submitted, approved, rejected"
        ObjectId submittedBy FK
        ObjectId approvedBy FK
        ObjectId journalEntryId FK
    }
    PAYMENT {
        ObjectId _id PK
        string paymentNumber UK
        string direction "inflow or outflow"
        ObjectId partyId FK
        int amountPaise
        ObjectId depositAccountId FK
        int unallocatedPaise
        ObjectId journalEntryId FK
    }
    PAYMENTALLOCATION {
        string documentModel "Invoice or Bill"
        ObjectId documentId FK "polymorphic"
        int amountPaise
        ObjectId allocatedBy FK
        date allocatedAt "append only"
    }
    ITEM {
        ObjectId _id PK
        string kind "goods or service"
        string sku UK
        string hsn
        string sac
        int gstRate
        int sellingPricePaise
        bool trackInventory
    }
    DOCUMENT {
        ObjectId _id PK
        string filename
        string mimeType
        string status
        string extractedBy "text layer, tesseract"
        int costPaise
        ObjectId billId FK
    }
```

**`PAYMENTALLOCATION` is the one polymorphic reference in the schema.** An
allocation points at an Invoice or a Bill depending on `documentModel`, which is
why the index is on `allocations.documentId` rather than a typed FK. Allocations
are append-only — an over-allocation is blocked by the rule
`sum(allocations) + refunded <= amountPaise`.

`partySnapshot` is deliberate denormalisation: a later edit to a party must never
change an invoice that was already issued.

---

## 4. Banking and reconciliation

```mermaid
erDiagram
    COMPANY ||--o{ BANKACCOUNT : "banks with"
    BANKACCOUNT }o--|| ACCOUNT : "mirrors ledger account"
    BANKACCOUNT ||--o{ BANKTRANSACTION : "statement of"
    BANKTRANSACTION ||--o| RECONCILIATION : "is matched by"
    RECONCILIATION }o--|| JOURNALENTRY : "to"

    BANKACCOUNT {
        ObjectId _id PK
        string name
        string bankName
        string accountNumberMasked
        string ifsc
        ObjectId ledgerAccountId FK "usually 1120"
        string source "manual, csv, scan, aa"
        string aaConsentStatus
    }
    BANKTRANSACTION {
        ObjectId _id PK
        ObjectId bankAccountId FK
        date txnDate
        string narration
        int amountPaise
        string direction "credit or debit"
        int balancePaise
        string fingerprint UK "makes re-import idempotent"
        string status "unmatched, matched"
    }
    RECONCILIATION {
        ObjectId _id PK
        ObjectId bankTransactionId FK
        ObjectId journalEntryId FK
        int score "match confidence"
        string method "auto or manual"
        ObjectId confirmedBy FK
    }
```

`fingerprint` is what makes importing the same statement twice harmless — the
duplicate rows are recognised and skipped rather than doubling the bank balance.

---

## 5. Compliance

```mermaid
erDiagram
    COMPANY ||--o{ GSTRETURN : "files"
    COMPANY ||--o{ IMSRECORD : "receives"
    IMSRECORD }o--o| BILL : "matched to"

    GSTRETURN {
        ObjectId _id PK
        string type "GSTR-1 or GSTR-3B"
        string period "MM-YYYY"
        string status
        object data "the generated return"
        object trace "which documents fed each figure"
    }
    IMSRECORD {
        ObjectId _id PK
        string taxPeriod
        string supplierGstin
        string documentNumber
        int taxableValuePaise
        int igstPaise
        int cgstPaise
        int sgstPaise
        string action "no_action, accept, reject, pending"
        ObjectId matchedBillId FK
        ObjectId actionTakenBy FK
    }
```

`GSTRETURN.trace` is why a return can be audited: it records which invoices and
bills produced each box, so a CA can check a figure back to its documents.

---

## 6. Platform, plumbing and AI

```mermaid
erDiagram
    COMPANY ||--o{ NOTIFICATION : "raises"
    USER ||--o{ NOTIFICATION : "receives"
    COMPANY ||--o{ REPORTJOB : "queues"
    COMPANY ||--o{ AUDITLOG : "records"
    COMPANY ||--o{ OUTBOXEVENT : "emits"
    COMPANY ||--o{ AICONVERSATION : "holds"
    USER ||--o{ AICONVERSATION : "talks in"
    AICONVERSATION ||--o{ AIPROPOSAL : "produces"
    USER ||--o{ IMPERSONATIONSESSION : "is impersonated in"

    OUTBOXEVENT {
        ObjectId _id PK
        string type
        object payload
        string status "pending, published"
        int attempts
        date publishedAt
    }
    IDEMPOTENCYKEY {
        string _id PK "the client key"
        string requestHash "422 if body differs"
        int responseStatus
        object responseBody
        date createdAt "swept after 24h"
    }
    DEADLETTER {
        ObjectId _id PK
        string queue
        string jobId
        object data
        string error
        date replayedAt
    }
    REPORTJOB {
        ObjectId _id PK
        string type
        object params
        string status
        int progress
        string artefactCsv
    }
    AUDITLOG {
        ObjectId _id PK
        string action
        string entityType
        ObjectId entityId FK "polymorphic"
        ObjectId actorId FK
    }
    AIPROPOSAL {
        ObjectId _id PK
        ObjectId conversationId FK
        string type
        object payload
        object preview "rendered as a diff"
        string status "proposed, confirmed, expired"
        ObjectId confirmedBy FK
        ObjectId resultId FK "what it created once confirmed"
    }
    NOTIFICATION {
        ObjectId _id PK
        string event
        string dedupeKey UK
        date readAt
    }
```

`OUTBOXEVENT` is written inside the same transaction as the posting it describes,
then published by the worker — so the books and the outside world cannot
disagree. `AIPROPOSAL.status` is where rule 10 lives: nothing the model drafts
exists in the books until a human sets it to `confirmed`.

---

## Every foreign key, in one table

| From                     | Field                                                                          | To                                               | Note                             |
| ------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------- |
| Company                  | `organizationId`                                                               | Organization                                     |                                  |
| Organization             | `ownerUserId`                                                                  | User                                             |                                  |
| Role                     | `organizationId`                                                               | Organization                                     |                                  |
| Subscription             | `organizationId`                                                               | Organization                                     |                                  |
| Membership               | `userId`, `companyId`, `roleId`, `invitedBy`                                   | User, Company, Role, User                        | the tenancy join                 |
| Session                  | `userId`                                                                       | User                                             |                                  |
| VerificationToken        | `userId`                                                                       | User                                             |                                  |
| Account                  | `companyId`, `parentId`, `bankAccountId`                                       | Company, **Account**, BankAccount                | `parentId` is the tree           |
| JournalEntry             | `companyId`, `postedBy`                                                        | Company, User                                    |                                  |
| JournalEntry             | `reversesEntryId`, `reversedByEntryId`                                         | **JournalEntry**                                 | corrections                      |
| JournalEntry             | `source.documentId`                                                            | _polymorphic_                                    | with `source.documentModel`      |
| JournalEntry `.lines[]`  | `accountId`, `partyId`, `itemId`                                               | Account, Party, Item                             | embedded                         |
| Party                    | `companyId`, `receivableAccountId`, `payableAccountId`                         | Company, Account, Account                        |                                  |
| Item                     | `companyId`, `incomeAccountId`, `expenseAccountId`, `inventoryAccountId`       | Company, Account × 3                             |                                  |
| Invoice                  | `companyId`, `partyId`, `journalEntryId`                                       | Company, Party, JournalEntry                     |                                  |
| Invoice `.lines[]`       | `itemId`                                                                       | Item                                             | embedded                         |
| Bill                     | `companyId`, `partyId`, `journalEntryId`, `approvedBy`, `createdBy`            | Company, Party, JournalEntry, User × 2           |                                  |
| Bill `.lines[]`          | `itemId`                                                                       | Item                                             | embedded                         |
| Expense                  | `companyId`, `expenseAccountId`, `journalEntryId`, `submittedBy`, `approvedBy` | Company, Account, JournalEntry, User × 2         |                                  |
| Payment                  | `companyId`, `partyId`, `depositAccountId`, `journalEntryId`, `createdBy`      | Company, Party, Account, JournalEntry, User      |                                  |
| Payment `.allocations[]` | `documentId`, `allocatedBy`                                                    | **Invoice or Bill**, User                        | polymorphic via `documentModel`  |
| Document                 | `companyId`, `billId`, `uploadedBy`                                            | Company, Bill, User                              | OCR output                       |
| BankAccount              | `companyId`, `ledgerAccountId`                                                 | Company, Account                                 |                                  |
| BankTransaction          | `companyId`, `bankAccountId`                                                   | Company, BankAccount                             |                                  |
| Reconciliation           | `companyId`, `bankTransactionId`, `journalEntryId`, `confirmedBy`              | Company, BankTransaction, JournalEntry, User     |                                  |
| GstReturn                | `companyId`                                                                    | Company                                          |                                  |
| ImsRecord                | `companyId`, `matchedBillId`, `actionTakenBy`                                  | Company, Bill, User                              |                                  |
| Notification             | `companyId`, `userId`                                                          | Company, User                                    |                                  |
| ReportJob                | `companyId`, `requestedBy`                                                     | Company, User                                    |                                  |
| AuditLog                 | `companyId`, `entityId`, `actorId`                                             | Company, _polymorphic_, User                     | with `entityType`                |
| OutboxEvent              | `companyId`                                                                    | Company                                          |                                  |
| AiConversation           | `companyId`, `userId`                                                          | Company, User                                    |                                  |
| AiProposal               | `companyId`, `conversationId`, `proposedBy`, `confirmedBy`, `resultId`         | Company, AiConversation, User × 2, _polymorphic_ |                                  |
| AdminAudit               | `adminUserId`, `targetId`                                                      | User, _polymorphic_                              | platform-wide                    |
| ImpersonationSession     | `adminUserId`, `targetUserId`                                                  | User, User                                       | platform-wide                    |
| Counter                  | —                                                                              | —                                                | `_id` is `companyId:fy:series`   |
| IdempotencyKey           | —                                                                              | —                                                | `_id` is the client's key        |
| DeadLetter               | —                                                                              | —                                                | queue name, not a collection ref |

---

## What the diagrams deliberately do not show

- **`companyId`** on every tenant-scoped entity, drawn only where it carries
  meaning. It is always there, always first in the index, and injected by the
  tenant plugin rather than written by hand.
- **Denormalised mirrors.** `Party.outstandingReceivablePaise`,
  `Account.currentBalancePaise` and `Invoice.amountDuePaise` are derived from the
  ledger and rebuilt from it. They are display conveniences; no decision reads
  them.
- **Timestamps.** Every collection has `createdAt` / `updatedAt`.
