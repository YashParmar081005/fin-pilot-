/**
 * AI proposal (I10, plan.md §24): a write tool NEVER executes — it returns
 * this object. The payload is the INPUT to replay through the same human
 * path; the preview is display-only and is IGNORED at confirm time.
 */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export const PROPOSAL_TTL_MS = 24 * 3_600_000;

export interface AiProposalDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  conversationId: Types.ObjectId;
  type: 'invoice' | 'journal_entry' | 'ims_action';
  payload: Record<string, unknown>; // client-proposable fields ONLY (I5)
  preview: Record<string, unknown>; // display-only; never trusted
  status: 'proposed' | 'confirmed' | 'rejected' | 'expired';
  proposedBy: Types.ObjectId;
  confirmedBy?: Types.ObjectId | null;
  resultId?: Types.ObjectId | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiProposalSchema = new Schema<AiProposalDoc>(
  {
    conversationId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['invoice', 'journal_entry', 'ims_action'], required: true },
    payload: Schema.Types.Mixed,
    preview: Schema.Types.Mixed,
    status: {
      type: String,
      enum: ['proposed', 'confirmed', 'rejected', 'expired'],
      default: 'proposed',
    },
    proposedBy: { type: Schema.Types.ObjectId, required: true },
    confirmedBy: { type: Schema.Types.ObjectId, default: null },
    resultId: { type: Schema.Types.ObjectId, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AiProposalSchema.plugin(tenantScope);
export const AiProposal = model<AiProposalDoc>('AiProposal', AiProposalSchema);
