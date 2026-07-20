/** In-app notifications (§8.1, TTL 90 d) + per-user preferences. */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface NotificationDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  userId: Types.ObjectId;
  event: string;
  title: string;
  body: string;
  dedupeKey: string; // idempotency per (event, user)
  readAt?: Date | null;
  createdAt: Date;
}

const NotificationSchema = new Schema<NotificationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    event: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    dedupeKey: { type: String, required: true },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now, expires: 90 * 86_400 },
  },
  { versionKey: false },
);
NotificationSchema.plugin(tenantScope);
NotificationSchema.index({ companyId: 1, userId: 1, dedupeKey: 1 }, { unique: true });
export const Notification = model<NotificationDoc>('Notification', NotificationSchema);

export interface NotificationPreferenceDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  userId: Types.ObjectId;
  channels: { inApp: boolean; email: boolean; whatsapp: boolean };
  events: Record<string, boolean>; // absent = enabled
}

const NotificationPreferenceSchema = new Schema<NotificationPreferenceDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    channels: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: false },
    },
    events: { type: Schema.Types.Mixed, default: {} },
  },
  { versionKey: false },
);
NotificationPreferenceSchema.plugin(tenantScope);
NotificationPreferenceSchema.index({ companyId: 1, userId: 1 }, { unique: true });
export const NotificationPreference = model<NotificationPreferenceDoc>(
  'NotificationPreference',
  NotificationPreferenceSchema,
);
