/** GSTR working papers (plan.md §8.1). Tenant-scoped; rows carry the journal trace. */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface GstReturnDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  type: 'gstr1' | 'gstr3b';
  period: string; // '2026-07'
  status: 'draft' | 'exported';
  data: Record<string, unknown>; // the GSTN-shaped JSON
  trace: Array<{ ref: string; journalEntryIds: Types.ObjectId[] }>;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GstReturnSchema = new Schema<GstReturnDoc>(
  {
    type: { type: String, enum: ['gstr1', 'gstr3b'], required: true },
    period: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    status: { type: String, enum: ['draft', 'exported'], default: 'draft' },
    data: Schema.Types.Mixed,
    trace: [
      {
        _id: false,
        ref: String,
        journalEntryIds: [{ type: Schema.Types.ObjectId, ref: 'JournalEntry' }],
      },
    ],
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

GstReturnSchema.plugin(tenantScope);
GstReturnSchema.index({ companyId: 1, type: 1, period: 1 }, { unique: true });

export const GstReturn = model<GstReturnDoc>('GstReturn', GstReturnSchema);
