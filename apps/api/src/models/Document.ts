/** Uploaded files + OCR extraction (plan.md §8.1, §16). Tenant-scoped. */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface ExtractedField<T> {
  value: T | null; // null = low confidence — NEVER guessed (§32 done-when)
  confidence: number; // 0–1
}

export interface DocumentDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  filename: string;
  mimeType: string;
  content: Buffer; // storage interface swaps to S3/MinIO at deploy config
  status: 'uploaded' | 'extracted' | 'failed';
  extractedBy: 'text-layer' | 'vision' | null;
  costPaise: number; // a clean PDF costs ₹0 to extract
  extraction: {
    vendorName: ExtractedField<string>;
    gstin: ExtractedField<string>;
    documentNumber: ExtractedField<string>;
    documentDate: ExtractedField<string>;
    totalPaise: ExtractedField<number>;
    taxablePaise: ExtractedField<number>;
    arithmeticOk: boolean | null;
  } | null;
  billId: Types.ObjectId | null;
  uploadedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const field = { value: Schema.Types.Mixed, confidence: Number };

const DocumentSchema = new Schema<DocumentDoc>(
  {
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    content: { type: Buffer, required: true },
    status: { type: String, enum: ['uploaded', 'extracted', 'failed'], default: 'uploaded' },
    extractedBy: { type: String, enum: ['text-layer', 'vision', null], default: null },
    costPaise: { type: Number, default: 0 },
    extraction: {
      type: {
        vendorName: field,
        gstin: field,
        documentNumber: field,
        documentDate: field,
        totalPaise: field,
        taxablePaise: field,
        arithmeticOk: Schema.Types.Mixed,
      },
      default: null,
    },
    billId: { type: Schema.Types.ObjectId, ref: 'Bill', default: null },
    uploadedBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

DocumentSchema.plugin(tenantScope);
export const Document = model<DocumentDoc>('Document', DocumentSchema);
