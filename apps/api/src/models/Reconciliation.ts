/** Reconciliation audit record (plan.md §8.1): bankTxn ↔ journal entry. */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface ReconciliationDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  bankTransactionId: Types.ObjectId;
  journalEntryId: Types.ObjectId;
  score: number;
  method: 'suggested' | 'manual' | 'created';
  confirmedBy: Types.ObjectId;
  confirmedAt: Date;
}

const ReconciliationSchema = new Schema<ReconciliationDoc>(
  {
    bankTransactionId: {
      type: Schema.Types.ObjectId,
      ref: 'BankTransaction',
      required: true,
      unique: true,
    },
    journalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', required: true },
    score: { type: Number, required: true },
    method: { type: String, enum: ['suggested', 'manual', 'created'], required: true },
    confirmedBy: { type: Schema.Types.ObjectId, required: true },
    confirmedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

ReconciliationSchema.plugin(tenantScope);

export const Reconciliation = model<ReconciliationDoc>('Reconciliation', ReconciliationSchema);
