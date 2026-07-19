/**
 * Idempotency replay protection (I7, plan.md §18.6).
 * _id = "{companyId}:{key}" — the insertOne IS the lock (atomic on _id).
 */
import { Schema, model } from 'mongoose';

export interface IdempotencyKeyDoc {
  _id: string;
  requestHash: string; // sha256(method + path + canonicalJson(body))
  status: 'in_flight' | 'completed';
  responseStatus?: number;
  responseBody?: unknown;
  createdAt: Date;
}

const IdempotencyKeySchema = new Schema<IdempotencyKeyDoc>(
  {
    _id: String,
    requestHash: { type: String, required: true },
    status: { type: String, enum: ['in_flight', 'completed'], required: true },
    responseStatus: Number,
    responseBody: Object,
    createdAt: { type: Date, default: Date.now, expires: 86_400 }, // 24 h replay window
  },
  { versionKey: false },
);

export const IdempotencyKey = model<IdempotencyKeyDoc>('IdempotencyKey', IdempotencyKeySchema);
