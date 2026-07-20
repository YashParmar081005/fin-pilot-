/**
 * Notifications (plan.md §32 Phase 22). Every notification is IDEMPOTENT
 * per (event, user) via the dedupeKey unique index, and RESPECTS
 * preferences — event toggles and channel toggles both.
 */
import { Types } from 'mongoose';
import { Notification, NotificationPreference } from '../models/Notification';
import { User } from '../models/User';
import { sendMail } from './mailService';
import { logger } from '../config/logger';

/** WhatsApp BSP behind an interface — templates are pre-approved by Meta. */
export interface WhatsAppClient {
  sendTemplate(to: string, templateName: string, params: string[]): Promise<void>;
}
export class MockWhatsAppClient implements WhatsAppClient {
  sent: Array<{ to: string; templateName: string; params: string[] }> = [];
  async sendTemplate(to: string, templateName: string, params: string[]) {
    this.sent.push({ to, templateName, params });
  }
}
let whatsapp: WhatsAppClient = new MockWhatsAppClient();
export const setWhatsAppClient = (c: WhatsAppClient): void => void (whatsapp = c);

export interface NotifyInput {
  companyId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  event: string; // 'invoice.overdue', 'gst.gstr1_due', …
  title: string;
  body: string;
  dedupeKey: string;
  whatsappTemplate?: { name: string; params: string[] };
}

export const notificationService = {
  /** Returns true if a NEW notification landed (false = deduped or muted). */
  async notify(input: NotifyInput): Promise<boolean> {
    const prefs = await NotificationPreference.findOne(
      { userId: input.userId, companyId: input.companyId },
      null,
      { skipTenantScope: true },
    ).lean();
    if (prefs?.events?.[input.event] === false) return false; // event muted

    // in-app insert IS the idempotency lock (unique dedupeKey)
    if (prefs?.channels?.inApp !== false) {
      try {
        await Notification.create({
          companyId: input.companyId,
          userId: input.userId,
          event: input.event,
          title: input.title,
          body: input.body,
          dedupeKey: input.dedupeKey,
        });
      } catch (err) {
        if ((err as { code?: number }).code === 11000) return false; // already sent
        throw err;
      }
    }

    const user = await User.findById(input.userId).lean();
    if (user && prefs?.channels?.email !== false) {
      await sendMail({ to: user.email, subject: input.title, text: input.body });
    }
    if (user?.phone && prefs?.channels?.whatsapp === true && input.whatsappTemplate) {
      await whatsapp
        .sendTemplate(user.phone, input.whatsappTemplate.name, input.whatsappTemplate.params)
        .catch((err) => logger.error({ err }, 'whatsapp send failed'));
    }
    return true;
  },

  listFor(userId: Types.ObjectId | string) {
    return Notification.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();
  },

  async markRead(userId: Types.ObjectId | string, ids: string[]) {
    await Notification.updateMany(
      { _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, userId },
      { readAt: new Date() },
    );
  },
};
