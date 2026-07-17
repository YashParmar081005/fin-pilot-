import { z } from 'zod';
import { ACCOUNT_SUBTYPES, ACCOUNT_TYPES, isValidSubType } from '../accounting';

/** Account request contracts (plan.md §10, §18.5). */

export const createAccountSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[0-9]{3,6}$/, 'Code must be 3–6 digits'),
    name: z.string().trim().min(1).max(120),
    type: z.enum(ACCOUNT_TYPES),
    subType: z.enum(ACCOUNT_SUBTYPES),
    parentId: z.string().length(24).nullable().optional(),
    gstRate: z.number().nullable().optional(),
  })
  .refine((v) => isValidSubType(v.type, v.subType), {
    message: 'subType does not belong to this account type',
    path: ['subType'],
  });

export const updateAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
    // reparent — null moves the account to the root
    parentId: z.string().length(24).nullable().optional(),
    gstRate: z.number().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
