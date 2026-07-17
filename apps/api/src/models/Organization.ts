/**
 * Organization — top-level tenant: a CA firm or a single business (plan.md §9).
 * NOT tenant-scoped: it IS the tenant boundary's parent.
 */
import { Schema, model, type Types } from 'mongoose';

export interface OrganizationDoc {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  type: 'business' | 'ca_firm';
  ownerUserId: Types.ObjectId;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  limits: {
    maxCompanies: number;
    maxUsers: number;
    maxInvoicesMonth: number;
    aiTokensMonth: number;
  };
  branding?: {
    logoUrl?: string;
    primaryHex?: string;
    customDomain?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<OrganizationDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    type: { type: String, enum: ['business', 'ca_firm'], default: 'business' },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise'],
      default: 'free',
    },
    limits: {
      maxCompanies: { type: Number, default: 1 },
      maxUsers: { type: Number, default: 3 },
      maxInvoicesMonth: { type: Number, default: 50 },
      aiTokensMonth: { type: Number, default: 200_000 },
    },
    branding: {
      logoUrl: String,
      primaryHex: { type: String, default: '#0F4C81' },
      customDomain: String,
    },
  },
  { timestamps: true },
);

export const Organization = model<OrganizationDoc>('Organization', OrganizationSchema);
