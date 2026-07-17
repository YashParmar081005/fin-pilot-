/**
 * THE LEDGER (plan.md §10). APPEND ONLY.
 * GeneralLedger is the only writer (I3). Posted entries are immutable (I4) —
 * the only permitted mutation is stamping status/reversedByEntryId during a
 * reversal. Every entry balances (I2), enforced here, in the engine, by the
 * collMod validator (migration 003), and by the nightly integrity job.
 */
import { Schema, model, type Types } from 'mongoose';
import { AppError } from '../utils/AppError';
import { tenantScope } from '../plugins/tenantScope';

export const JOURNAL_SOURCE_TYPES = [
  'manual',
  'invoice',
  'bill',
  'payment',
  'expense',
  'bank',
  'opening_balance',
  'reversal',
  'depreciation',
  'fx',
  'closing',
  'ai_proposed',
] as const;
export type JournalSourceType = (typeof JOURNAL_SOURCE_TYPES)[number];

export interface JournalLine {
  lineNo: number;
  accountId: Types.ObjectId;
  debitPaise: number;
  creditPaise: number;
  description?: string;
  partyId?: Types.ObjectId | null;
  itemId?: Types.ObjectId | null;
  costCenter?: string | null;
  project?: string | null;
  gst?: {
    rate?: number | null;
    taxablePaise?: number | null;
    hsn?: string;
    component?: 'cgst' | 'sgst' | 'igst' | 'cess' | null;
  };
}

export interface JournalEntryDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  entryNumber: string;
  date: Date;
  fy: string;
  narration: string;
  source: {
    type: JournalSourceType;
    documentId?: Types.ObjectId | null;
    documentModel?: string | null;
  };
  lines: JournalLine[];
  totalDebitPaise: number;
  totalCreditPaise: number;
  status: 'posted' | 'reversed';
  reversesEntryId?: Types.ObjectId | null;
  reversedByEntryId?: Types.ObjectId | null;
  postedBy: Types.ObjectId;
  postedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const JournalLineSchema = new Schema<JournalLine>(
  {
    lineNo: { type: Number, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    debitPaise: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    creditPaise: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    description: String,
    // dimensions — every analytical report is a group-by on these
    partyId: { type: Schema.Types.ObjectId, ref: 'Party', default: null },
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', default: null },
    costCenter: { type: String, default: null },
    project: { type: String, default: null },
    // tax annotation for GST return building
    gst: {
      rate: { type: Number, default: null },
      taxablePaise: { type: Number, default: null },
      hsn: String,
      component: { type: String, enum: ['cgst', 'sgst', 'igst', 'cess', null], default: null },
    },
  },
  { _id: false },
);

// A line is either a debit or a credit, never both, never neither.
JournalLineSchema.pre('validate', function () {
  const d = this.debitPaise ?? 0;
  const c = this.creditPaise ?? 0;
  if (d < 0 || c < 0) throw new AppError('LEDGER_NEGATIVE_AMOUNT', 422);
  if (d > 0 === c > 0) throw new AppError('LEDGER_LINE_MUST_BE_DR_XOR_CR', 422);
});

const JournalEntrySchema = new Schema<JournalEntryDoc>(
  {
    entryNumber: { type: String, required: true }, // gapless, from counters (I6)
    date: { type: Date, required: true }, // the accounting date, NOT createdAt
    fy: { type: String, required: true }, // '2026-27' — denormalised for partitioned queries
    narration: { type: String, required: true },

    source: {
      type: { type: String, required: true, enum: JOURNAL_SOURCE_TYPES },
      documentId: { type: Schema.Types.ObjectId, default: null },
      documentModel: { type: String, default: null },
    },

    lines: {
      type: [JournalLineSchema],
      validate: [(v: unknown[]) => v.length >= 2, 'LEDGER_MIN_TWO_LINES'],
    },

    totalDebitPaise: { type: Number, required: true },
    totalCreditPaise: { type: Number, required: true },

    status: { type: String, enum: ['posted', 'reversed'], default: 'posted', required: true },
    reversesEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    reversedByEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },

    postedBy: { type: Schema.Types.ObjectId, required: true },
    postedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, optimisticConcurrency: false },
);

// I2 — the balance invariant, enforced at the schema layer
JournalEntrySchema.pre('validate', function () {
  const d = this.lines.reduce((s, l) => s + l.debitPaise, 0);
  const c = this.lines.reduce((s, l) => s + l.creditPaise, 0);
  if (d !== c) throw new AppError('LEDGER_UNBALANCED', 422, { debit: d, credit: c });
  if (d === 0) throw new AppError('LEDGER_ZERO_ENTRY', 422);
  this.totalDebitPaise = d;
  this.totalCreditPaise = c;
});

// I4 — immutability. The only permitted mutation is stamping the reversal.
JournalEntrySchema.pre('save', function (next) {
  if (this.isNew) return next();
  const changed = this.modifiedPaths();
  const allowed = new Set(['status', 'reversedByEntryId', 'updatedAt']);
  if (changed.some((p) => !allowed.has(p))) {
    return next(new AppError('LEDGER_IMMUTABLE', 409, { attemptedPaths: changed }));
  }
  next();
});

// no bulk path around the guard — these run BEFORE the tenant plugin's hooks
JournalEntrySchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'findOneAndDelete',
    'deleteOne',
    'deleteMany',
    'replaceOne',
  ],
  function (next) {
    next(new AppError('LEDGER_IMMUTABLE', 409));
  },
);

// Model.bulkWrite / insertMany bypass query middleware — close those doors too.
JournalEntrySchema.statics.bulkWrite = function () {
  throw new AppError('LEDGER_IMMUTABLE', 409);
};
JournalEntrySchema.statics.insertMany = function () {
  throw new AppError('LEDGER_IMMUTABLE', 409);
};

JournalEntrySchema.plugin(tenantScope);

// §10 indexes — mirrored in migrations/003 for production (background: true)
JournalEntrySchema.index({ companyId: 1, date: -1, _id: -1 }); // day book, pagination
JournalEntrySchema.index({ companyId: 1, 'lines.accountId': 1, date: -1 }); // account ledger ← the hot one
JournalEntrySchema.index({ companyId: 1, fy: 1, 'lines.accountId': 1 }); // trial balance, P&L
JournalEntrySchema.index({ companyId: 1, 'source.documentId': 1 }); // entry for a document
JournalEntrySchema.index(
  { companyId: 1, 'lines.partyId': 1, date: -1 },
  { partialFilterExpression: { 'lines.partyId': { $type: 'objectId' } } },
);
JournalEntrySchema.index({ companyId: 1, entryNumber: 1 }, { unique: true });

export const JournalEntry = model<JournalEntryDoc>('JournalEntry', JournalEntrySchema);
