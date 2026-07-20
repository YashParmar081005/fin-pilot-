/**
 * Subscription (plan.md §9 `subscriptions`, §32 Phase 23): plan, seats, usage
 * per organization. Platform-level — NOT tenant-scoped; keyed by
 * organizationId. Razorpay is the only provider (§ decision 3); the provider
 * client sits behind an interface so a second one is a new file.
 */
import { Schema, model, type Types } from 'mongoose';
import type { Plan } from '@finpilot/shared';

export interface MonthlyUsage {
  aiTokens: number;
  ocrPages: number;
  invoices: number;
  rolledUpAt: Date;
}

export interface SubscriptionDoc {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  plan: Plan;
  status: 'created' | 'active' | 'past_due' | 'cancelled';
  seats: number;
  razorpaySubscriptionId?: string | null;
  currentPeriodEnd?: Date | null;
  /** Nightly rollup (§20.7 `subscription.usage_rollup`), keyed 'YYYY-MM'. */
  usage: Map<string, MonthlyUsage>;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<SubscriptionDoc>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    plan: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise'],
      default: 'free',
    },
    status: {
      type: String,
      enum: ['created', 'active', 'past_due', 'cancelled'],
      default: 'active', // the implicit free plan is always "active"
    },
    seats: { type: Number, default: 3 },
    razorpaySubscriptionId: { type: String, default: null },
    currentPeriodEnd: { type: Date, default: null },
    usage: {
      type: Map,
      of: new Schema<MonthlyUsage>(
        {
          aiTokens: { type: Number, default: 0 },
          ocrPages: { type: Number, default: 0 },
          invoices: { type: Number, default: 0 },
          rolledUpAt: Date,
        },
        { _id: false },
      ),
      default: {},
    },
  },
  { timestamps: true },
);

SubscriptionSchema.index({ organizationId: 1 }, { unique: true });
SubscriptionSchema.index(
  { razorpaySubscriptionId: 1 },
  { unique: true, partialFilterExpression: { razorpaySubscriptionId: { $type: 'string' } } },
);

export const Subscription = model<SubscriptionDoc>('Subscription', SubscriptionSchema);
