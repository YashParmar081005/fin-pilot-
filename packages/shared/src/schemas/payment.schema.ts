import { z } from 'zod';

/**
 * Payment contracts (plan.md §11, §32 Phase 9). One payment can settle many
 * documents; allocations are append-only; sum(allocations) <= amountPaise
 * ALWAYS (schema refine + service assert + model invariant).
 */

const allocationSchema = z.object({
  documentModel: z.enum(['Invoice', 'Bill']),
  documentId: z.string().length(24),
  amountPaise: z.number().int().positive(),
});

export const createPaymentSchema = z
  .object({
    direction: z.enum(['inflow', 'outflow']),
    partyId: z.string().length(24),
    date: z.coerce.date(),
    amountPaise: z.number().int().positive(),
    method: z
      .enum(['cash', 'bank_transfer', 'upi', 'neft', 'rtgs', 'imps', 'cheque', 'card', 'razorpay'])
      .default('bank_transfer'),
    reference: z.string().max(100).optional(), // UTR / cheque no / razorpay id
    depositAccountId: z.string().length(24),
    allocations: z.array(allocationSchema).default([]),
    /** GST rate for the UNALLOCATED (advance) part of an inflow — tax on advance. */
    advanceGstRate: z.number().optional(),
  })
  .refine((p) => p.allocations.reduce((s, a) => s + a.amountPaise, 0) <= p.amountPaise, {
    message: 'allocations exceed the payment amount',
    path: ['allocations'],
  });

export const allocatePaymentSchema = z.object({
  allocations: z.array(allocationSchema).min(1),
});

export const refundPaymentSchema = z.object({
  amountPaise: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type AllocatePaymentInput = z.infer<typeof allocatePaymentSchema>;
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
