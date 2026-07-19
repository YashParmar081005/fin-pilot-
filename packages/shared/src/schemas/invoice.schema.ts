import { z } from 'zod';
import { GST_STATE_CODES } from '../constants/gst';

/**
 * Invoice contracts (plan.md §11, I5). The client proposes quantities, rates
 * and discounts. It may NEVER propose a total, tax, or payable — those fields
 * do not exist in this schema, and unknown keys are stripped by Zod, so a
 * client-sent grandTotalPaise is silently discarded (never even validated).
 */

const lineSchema = z.object({
  itemId: z.string().length(24).optional(),
  description: z.string().trim().min(1).max(500),
  hsn: z
    .string()
    .regex(/^\d{4,8}$/)
    .optional(),
  qty: z.number().positive(),
  ratePaise: z.number().int().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  gstRate: z.number(),
  cessRate: z.number().min(0).default(0),
});

export const createInvoiceSchema = z.object({
  partyId: z.string().length(24),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  placeOfSupplyStateCode: z
    .string()
    .length(2)
    .refine((c) => c in GST_STATE_CODES, 'Unknown GST state code')
    .optional(), // defaults to the party's POS / GSTIN state (§14.2)
  series: z.string().trim().max(10).default('INV'),
  lines: z.array(lineSchema).min(1).max(200),
  notes: z.string().max(2000).optional(),
  termsAndConditions: z.string().max(4000).optional(),
});

export const updateInvoiceSchema = createInvoiceSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

export const cancelInvoiceSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>;
