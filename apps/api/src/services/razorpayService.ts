/**
 * Razorpay webhook handling (plan.md §32 Phase 9).
 * Signature: HMAC-SHA256 of the RAW body with RAZORPAY_WEBHOOK_SECRET.
 * Replay protection: one payment per razorpay payment id (unique partial
 * index on Payment.reference) — a replayed webhook is a NO-OP, not an error.
 * Order creation via the REST API lands with the payment-link feature; the
 * webhook side is what moves money into the books.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';
import { Invoice } from '../models/Invoice';
import { Payment } from '../models/Payment';
import { accountRepo } from '../repositories/accountRepo';
import { requestContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';
import { paymentService } from './paymentService';

export function verifyRazorpaySignature(rawBody: Buffer, signature: string): boolean {
  const secret = getEnv().RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface RazorpayCapturedEvent {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        amount?: number; // paise — razorpay is paise-native
        notes?: { companyId?: string; invoiceId?: string };
      };
    };
  };
}

/** The Razorpay system actor for audit rows. */
const RAZORPAY_ACTOR = new Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');

export async function handleRazorpayEvent(
  event: RazorpayCapturedEvent,
): Promise<{ handled: boolean; replayed?: boolean }> {
  if (event.event !== 'payment.captured') return { handled: false };

  const entity = event.payload?.payment?.entity;
  const razorpayId = entity?.id;
  const amountPaise = entity?.amount;
  const companyId = entity?.notes?.companyId;
  const invoiceId = entity?.notes?.invoiceId;
  if (!razorpayId || !amountPaise || !companyId || !invoiceId) {
    throw new AppError('SYS_VALIDATION_FAILED', 400, { webhook: 'missing id/amount/notes' });
  }

  return requestContext.run(
    { companyId: new Types.ObjectId(companyId), userId: RAZORPAY_ACTOR },
    async () => {
      // replay no-op: this razorpay payment id already recorded?
      const existing = await Payment.findOne({ method: 'razorpay', reference: razorpayId }).lean();
      if (existing) return { handled: true, replayed: true };

      const invoice = await Invoice.findOne({ _id: invoiceId }).lean();
      if (!invoice) throw new AppError('SYS_NOT_FOUND', 404, { invoiceId });

      const bank = await accountRepo.findByCode('1120'); // Bank Accounts
      const allocation = Math.min(amountPaise, invoice.amountDuePaise);
      await paymentService.create(
        {
          direction: 'inflow',
          partyId: String(invoice.partyId),
          date: new Date(),
          amountPaise,
          method: 'razorpay',
          reference: razorpayId,
          depositAccountId: String(bank!._id),
          allocations:
            allocation > 0
              ? [{ documentModel: 'Invoice', documentId: invoiceId, amountPaise: allocation }]
              : [],
        },
        RAZORPAY_ACTOR,
      );
      logger.info({ razorpayId, invoiceId, amountPaise }, 'razorpay payment recorded');
      return { handled: true };
    },
  );
}
