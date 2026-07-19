import { z } from 'zod';

/**
 * Purchase bill + expense claim contracts (plan.md §32 Phase 8). Like
 * invoices (I5), totals/taxes are absent from the schema — server-computed.
 */

const billLineSchema = z.object({
  itemId: z.string().length(24).optional(),
  description: z.string().trim().min(1).max(500),
  hsn: z
    .string()
    .regex(/^\d{4,8}$/)
    .optional(),
  qty: z.number().positive(),
  ratePaise: z.number().int().min(0),
  gstRate: z.number(),
  cessRate: z.number().min(0).default(0),
  /** ITC-ineligible tax is capitalised into the expense, not input tax (§14). */
  itcEligible: z.boolean().default(true),
});

export const createBillSchema = z.object({
  partyId: z.string().length(24),
  vendorBillNumber: z.string().trim().min(1).max(60),
  billDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  lines: z.array(billLineSchema).min(1).max(200),
  notes: z.string().max(2000).optional(),
  recurring: z
    .object({
      enabled: z.boolean().default(false),
      frequency: z.enum(['monthly', 'quarterly']).default('monthly'),
    })
    .optional(),
});

export const createExpenseSchema = z.object({
  date: z.coerce.date(),
  amountPaise: z.number().int().positive(),
  expenseAccountId: z.string().length(24),
  description: z.string().trim().min(1).max(500),
  notes: z.string().max(2000).optional(),
});

export const rejectSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type CreateBillInput = z.infer<typeof createBillSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type RejectInput = z.infer<typeof rejectSchema>;
