import type { Request, Response } from 'express';
import type { CancelInvoiceInput, CreateInvoiceInput, UpdateInvoiceInput } from '@finpilot/shared';
import { formatINR } from '@finpilot/shared';
import type { InvoiceDoc } from '../models/Invoice';
import { invoiceService } from '../services/invoiceService';
import { sendMail } from '../services/mailService';
import { AppError } from '../utils/AppError';
import { ok } from '../utils/respond';

function dto(invoice: InvoiceDoc) {
  const { _id, companyId: _c, __v: _v, ...rest } = invoice as InvoiceDoc & { __v?: number };
  return { id: String(_id), ...rest };
}

export const invoiceController = {
  async create(req: Request, res: Response) {
    ok(
      res,
      { invoice: dto(await invoiceService.createDraft(req.body as CreateInvoiceInput)) },
      201,
    );
  },

  async list(req: Request, res: Response) {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    ok(res, { invoices: (await invoiceService.list(status)).map(dto) });
  },

  async get(req: Request, res: Response) {
    ok(res, { invoice: dto(await invoiceService.get(String(req.params.id))) });
  },

  async update(req: Request, res: Response) {
    ok(res, {
      invoice: dto(
        await invoiceService.updateDraft(String(req.params.id), req.body as UpdateInvoiceInput),
      ),
    });
  },

  async issue(req: Request, res: Response) {
    ok(res, { invoice: dto(await invoiceService.issue(String(req.params.id))) }, 201);
  },

  async cancel(req: Request, res: Response) {
    ok(res, {
      invoice: dto(
        await invoiceService.cancel(String(req.params.id), (req.body as CancelInvoiceInput).reason),
      ),
    });
  },

  async send(req: Request, res: Response) {
    const invoice = await invoiceService.get(String(req.params.id));
    if (invoice.status === 'draft')
      throw new AppError('DOC_CANNOT_EDIT_ISSUED', 409, { reason: 'issue before sending' });
    const to = typeof req.body?.email === 'string' ? req.body.email : null;
    if (!to) throw new AppError('SYS_VALIDATION_FAILED', 422, { email: 'required' });
    await sendMail({
      to,
      subject: `Invoice ${invoice.invoiceNumber} — ${formatINR(invoice.grandTotalPaise)}`,
      text: [
        `Invoice ${invoice.invoiceNumber} dated ${invoice.issueDate.toISOString().slice(0, 10)}`,
        `Amount due: ${formatINR(invoice.amountDuePaise)} (due ${invoice.dueDate.toISOString().slice(0, 10)})`,
        '',
        ...invoice.lines.map(
          (l) =>
            `${l.description} — ${l.qty} × ${formatINR(l.ratePaise)} = ${formatINR(l.lineTotalPaise)}`,
        ),
        '',
        `Taxable ${formatINR(invoice.taxableValuePaise)} · CGST ${formatINR(invoice.cgstPaise)} · SGST ${formatINR(invoice.sgstPaise)} · IGST ${formatINR(invoice.igstPaise)}`,
        `Grand total: ${formatINR(invoice.grandTotalPaise)}`,
      ].join('\n'),
    });
    ok(res, { sent: true });
  },
};
