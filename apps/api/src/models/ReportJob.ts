/** Human-visible job status (plan.md §8.1 'jobs') — the export progress bar. */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface ReportJobDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  type: string;
  params: Record<string, unknown>;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number; // 0–100
  artefactCsv?: string | null;
  error?: string | null;
  requestedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ReportJobSchema = new Schema<ReportJobDoc>(
  {
    type: { type: String, required: true },
    params: Schema.Types.Mixed,
    status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued' },
    progress: { type: Number, default: 0 },
    artefactCsv: { type: String, default: null },
    error: { type: String, default: null },
    requestedBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

ReportJobSchema.plugin(tenantScope);
export const ReportJob = model<ReportJobDoc>('ReportJob', ReportJobSchema);
