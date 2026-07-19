/**
 * Expense claim + approval state machine (plan.md §8.1, §32 Phase 8).
 * submitted → approved (posts to GL) | rejected. An expense can NEVER be
 * approved by its own submitter — enforced in the service, tested in §29.
 */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface ExpenseDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  date: Date;
  amountPaise: number;
  expenseAccountId: Types.ObjectId;
  description: string;
  notes?: string;
  status: 'submitted' | 'approved' | 'rejected' | 'reimbursed';
  submittedBy: Types.ObjectId;
  approvedBy?: Types.ObjectId | null;
  rejectedReason?: string | null;
  journalEntryId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseSchema = new Schema<ExpenseDoc>(
  {
    date: { type: Date, required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    expenseAccountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    description: { type: String, required: true },
    notes: String,
    status: {
      type: String,
      enum: ['submitted', 'approved', 'rejected', 'reimbursed'],
      default: 'submitted',
    },
    submittedBy: { type: Schema.Types.ObjectId, required: true },
    approvedBy: { type: Schema.Types.ObjectId, default: null },
    rejectedReason: { type: String, default: null },
    journalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

ExpenseSchema.plugin(tenantScope);
ExpenseSchema.index({ companyId: 1, status: 1, date: -1 });
ExpenseSchema.index({ companyId: 1, submittedBy: 1, date: -1 });

export const Expense = model<ExpenseDoc>('Expense', ExpenseSchema);
