/**
 * Notification cron bodies (plan.md §20.7, §32 Phase 22).
 * Overdue-invoice reminders (daily cadence via a per-day dedupeKey) and GST
 * due-date reminders on the 8th (GSTR-1 due 11th) and 17th (3B due 20th).
 */
import { formatINR } from '@finpilot/shared';
import { Company } from '../models/Company';
import { Invoice } from '../models/Invoice';
import { Organization } from '../models/Organization';
import { notificationService } from '../services/notificationService';

async function ownerOf(companyId: unknown): Promise<{ ownerUserId: unknown } | null> {
  const company = await Company.findById(companyId).lean();
  const org = company ? await Organization.findById(company.organizationId).lean() : null;
  return org ? { ownerUserId: org.ownerUserId } : null;
}

/** Daily reminder per overdue invoice — one per invoice per day. */
export async function overdueInvoiceReminders(now = new Date()): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  const overdue = await Invoice.find({ status: 'overdue' }, null, { skipTenantScope: true }).lean();
  let sent = 0;
  for (const invoice of overdue) {
    const owner = await ownerOf(invoice.companyId);
    if (!owner) continue;
    const landed = await notificationService.notify({
      companyId: invoice.companyId,
      userId: owner.ownerUserId as never,
      event: 'invoice.overdue',
      title: `Invoice ${invoice.invoiceNumber} is overdue`,
      body: `${invoice.partySnapshot?.name ?? 'A customer'} owes ${formatINR(invoice.amountDuePaise)} (due ${invoice.dueDate.toISOString().slice(0, 10)}).`,
      dedupeKey: `overdue:${invoice._id}:${day}`,
      whatsappTemplate: { name: 'invoice_overdue_v1', params: [String(invoice.invoiceNumber)] },
    });
    if (landed) sent += 1;
  }
  return sent;
}

/** GST filing reminders — the 8th (GSTR-1 due the 11th), the 17th (3B due the 20th). */
export async function gstDueDateReminders(now = new Date()): Promise<number> {
  const dayOfMonth = now.getUTCDate();
  const kind = dayOfMonth === 8 ? 'gstr1' : dayOfMonth === 17 ? 'gstr3b' : null;
  if (!kind) return 0;
  const period = now.toISOString().slice(0, 7);
  const dueDay = kind === 'gstr1' ? 11 : 20;

  const companies = await Company.find({ gstin: { $type: 'string' } }).lean();
  let sent = 0;
  for (const company of companies) {
    const owner = await ownerOf(company._id);
    if (!owner) continue;
    const landed = await notificationService.notify({
      companyId: company._id,
      userId: owner.ownerUserId as never,
      event: `gst.${kind}_due`,
      title: `${kind === 'gstr1' ? 'GSTR-1' : 'GSTR-3B'} due on the ${dueDay}th`,
      body: `${company.legalName}: file ${kind === 'gstr1' ? 'GSTR-1' : 'GSTR-3B'} for ${period} by the ${dueDay}th.`,
      dedupeKey: `gst:${kind}:${period}:${owner.ownerUserId}`,
    });
    if (landed) sent += 1;
  }
  return sent;
}
