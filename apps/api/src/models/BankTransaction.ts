/**
 * Bank statement lines (plan.md §8.1) — from AA or CSV. The FINGERPRINT is
 * the dedupe key: importing the same statement twice creates zero rows.
 */
import { createHash } from 'node:crypto';
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface BankTransactionDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  bankAccountId: Types.ObjectId;
  txnDate: Date;
  narration: string;
  reference?: string | null;
  amountPaise: number; // always positive; direction carries the sign
  direction: 'credit' | 'debit';
  balancePaise?: number | null;
  fingerprint: string;
  source: 'csv' | 'aa' | 'manual';
  status: 'unreconciled' | 'reconciled' | 'excluded';
  createdAt: Date;
  updatedAt: Date;
}

export function txnFingerprint(input: {
  bankAccountId: string;
  txnDate: string; // YYYY-MM-DD
  amountPaise: number;
  direction: string;
  narration: string;
}): string {
  return createHash('sha256')
    .update(
      `${input.bankAccountId}|${input.txnDate}|${input.amountPaise}|${input.direction}|${input.narration.trim().toLowerCase()}`,
    )
    .digest('hex');
}

const BankTransactionSchema = new Schema<BankTransactionDoc>(
  {
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'BankAccount', required: true },
    txnDate: { type: Date, required: true },
    narration: { type: String, required: true },
    reference: { type: String, default: null },
    amountPaise: { type: Number, required: true, min: 1 },
    direction: { type: String, enum: ['credit', 'debit'], required: true },
    balancePaise: { type: Number, default: null },
    fingerprint: { type: String, required: true },
    source: { type: String, enum: ['csv', 'aa', 'manual'], required: true },
    status: {
      type: String,
      enum: ['unreconciled', 'reconciled', 'excluded'],
      default: 'unreconciled',
    },
  },
  { timestamps: true },
);

BankTransactionSchema.plugin(tenantScope);
// Appendix C — THE dedupe index
BankTransactionSchema.index({ companyId: 1, bankAccountId: 1, fingerprint: 1 }, { unique: true });
BankTransactionSchema.index({ companyId: 1, status: 1, txnDate: -1 });

export const BankTransaction = model<BankTransactionDoc>('BankTransaction', BankTransactionSchema);
