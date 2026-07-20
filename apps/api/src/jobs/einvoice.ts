/**
 * The einvoice.generate worker body — §20.4 verbatim pattern:
 * guard first, UnrecoverableError for 4xx (our data is wrong — do not
 * retry), rethrow 5xx for backoff → DLQ.
 */
import { Company } from '../models/Company';
import { Invoice } from '../models/Invoice';
import { UnrecoverableError } from '../queues/infra';
import { irpLimiter } from '../integrations/limiters';
import { IrpValidationError, buildInv01, getIrpClient } from '../integrations/irp/client';
import { logger } from '../config/logger';
import { einvoiceIrnFailures } from '../observability/metrics';

export async function processEInvoice(data: {
  invoiceId: string;
  companyId: string;
}): Promise<{ irn?: string; skipped?: string }> {
  const invoice = await Invoice.findOne({ _id: data.invoiceId, companyId: data.companyId }, null, {
    skipTenantScope: true,
  }).lean();
  if (!invoice) throw new UnrecoverableError('INVOICE_NOT_FOUND');
  if (invoice.eInvoice.status === 'generated') return { skipped: 'already_generated' }; // ← the guard

  const company = await Company.findById(data.companyId).lean();
  if (!company?.gstin) throw new UnrecoverableError('COMPANY_GSTIN_MISSING');

  let payload;
  try {
    payload = buildInv01(invoice, company); // zod-validated before transmit
  } catch (err) {
    await Invoice.updateOne(
      { _id: invoice._id },
      {
        $set: { 'eInvoice.status': 'failed', 'eInvoice.lastError': String(err) },
        $inc: { 'eInvoice.attemptCount': 1 },
      },
    ).setOptions({ skipTenantScope: true });
    einvoiceIrnFailures.inc({ reason: 'schema_invalid' });
    throw new UnrecoverableError('IRP_SCHEMA_INVALID'); // our bug; do not retry
  }

  try {
    const res = await irpLimiter.schedule(() => getIrpClient().generateIrn(payload));
    await Invoice.updateOne(
      { _id: invoice._id },
      {
        $set: {
          'eInvoice.irn': res.irn,
          'eInvoice.ackNo': res.ackNo,
          'eInvoice.ackDate': res.ackDate,
          'eInvoice.signedQrCode': res.signedQrCode,
          'eInvoice.status': 'generated',
        },
        $inc: { 'eInvoice.attemptCount': 1 },
      },
    ).setOptions({ skipTenantScope: true });
    logger.info({ invoiceId: data.invoiceId, irn: res.irn.slice(0, 12) }, 'IRN generated');
    return { irn: res.irn };
  } catch (err) {
    if (err instanceof IrpValidationError) {
      // 4xx — the IRP says our data is wrong; surface verbatim, NO retry
      await Invoice.updateOne(
        { _id: invoice._id },
        {
          $set: { 'eInvoice.status': 'failed', 'eInvoice.lastError': err.message },
          $inc: { 'eInvoice.attemptCount': 1 },
        },
      ).setOptions({ skipTenantScope: true });
      einvoiceIrnFailures.inc({ reason: 'irp_rejected' });
      throw new UnrecoverableError(`IRP_REJECTED: ${err.message}`);
    }
    einvoiceIrnFailures.inc({ reason: 'irp_unavailable' });
    await Invoice.updateOne(
      { _id: invoice._id },
      { $inc: { 'eInvoice.attemptCount': 1 } },
    ).setOptions({ skipTenantScope: true });
    throw err; // 5xx / network — let BullMQ back off and retry → DLQ
  }
}

/** einvoice.deadline_warn (§14.4): T+21d pending IRNs for AATO ≥ ₹10 Cr. */
export async function warnEInvoiceDeadlines(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 21 * 86_400_000);
  const pending = await Invoice.find(
    { 'eInvoice.status': 'pending', issueDate: { $lte: cutoff } },
    'invoiceNumber companyId issueDate',
    { skipTenantScope: true },
  ).lean();
  let warned = 0;
  for (const inv of pending) {
    const company = await Company.findById(inv.companyId).lean();
    if ((company?.aggregateTurnoverPaise ?? 0) >= 10_00_00_000 * 100) {
      logger.warn(
        { invoice: inv.invoiceNumber, company: company!.legalName },
        'e-invoice 30-day IRP window closing — report NOW',
      );
      warned += 1;
    }
  }
  return warned;
}
