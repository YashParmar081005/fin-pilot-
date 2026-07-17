import { z } from 'zod';
import { GST_STATE_CODES } from '../constants/gst';

/**
 * Company + membership request contracts (plan.md §9, §18.5).
 * GSTIN/PAN here are format checks only — the checksum validation is Phase 6.
 */

const pan = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Invalid PAN format');

// 15 chars: state(2) + PAN(10) + entity code + literal 'Z' + checksum.
// plan.md §9 had an off-by-one regex (16 chars) — corrected, see changelog.
const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Invalid GSTIN format');

const stateCode = z
  .string()
  .length(2)
  .refine((code) => code in GST_STATE_CODES, 'Unknown GST state code');

const addressSchema = z.object({
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

export const createCompanySchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  tradeName: z.string().trim().max(200).optional(),
  pan: pan.optional(),
  gstin: gstin.optional(),
  gstRegistrationType: z
    .enum(['regular', 'composition', 'unregistered', 'sez', 'casual'])
    .default('regular'),
  stateCode,
  address: addressSchema.optional(),
  financialYearStartMonth: z.number().int().min(1).max(12).default(4),
  booksBeginDate: z.coerce.date(),
});

export const updateCompanySchema = createCompanySchema
  .omit({ booksBeginDate: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  roleKey: z.enum(['company_admin', 'accountant', 'employee', 'auditor']),
});

export const updateMemberSchema = z
  .object({
    roleKey: z.enum(['company_admin', 'accountant', 'employee', 'auditor']).optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .refine((v) => v.roleKey || v.status, 'No fields to update');

export const acceptInviteSchema = z.object({
  token: z.string().min(16),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
