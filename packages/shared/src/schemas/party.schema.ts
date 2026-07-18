import { z } from 'zod';
import { GST_STATE_CODES } from '../constants/gst';
import { validateGstin } from '../gstin';

/** Party (customers AND vendors — one collection) contracts (plan.md §11). */

const gstinChecked = z
  .string()
  .trim()
  .toUpperCase()
  .refine(validateGstin, 'Invalid GSTIN (checksum failed)');

const stateCode = z
  .string()
  .length(2)
  .refine((code) => code in GST_STATE_CODES, 'Unknown GST state code');

const address = z.object({
  line1: z.string().max(200).optional(),
  line2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  country: z.string().default('IN'),
});

export const createPartySchema = z.object({
  type: z.array(z.enum(['customer', 'vendor'])).min(1),
  name: z.string().trim().min(1).max(200),
  legalName: z.string().trim().max(200).optional(),
  gstin: gstinChecked.optional(),
  gstRegistrationType: z
    .enum(['regular', 'composition', 'unregistered', 'sez', 'overseas'])
    .default('unregistered'),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}\d{4}[A-Z]$/)
    .optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  billingAddress: address.optional(),
  shippingAddress: address.optional(),
  placeOfSupplyStateCode: stateCode.optional(),
  creditLimitPaise: z.number().int().min(0).default(0),
  creditDays: z.number().int().min(0).default(0),
  tags: z.array(z.string().max(50)).default([]),
  notes: z.string().max(2000).optional(),
});

export const updatePartySchema = createPartySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

// rows stay UNVALIDATED here — the service validates per row so one bad row
// fails alone instead of 422ing the whole batch (partial success by design)
export const importPartiesSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(1000),
});

export type CreatePartyInput = z.infer<typeof createPartySchema>;
export type UpdatePartyInput = z.infer<typeof updatePartySchema>;
export type ImportPartiesInput = z.infer<typeof importPartiesSchema>;
