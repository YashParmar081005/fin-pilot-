import { z } from 'zod';

/**
 * Auth request contracts (plan.md §17, §18.5). One schema, both ends:
 * the API validates with these; the web forms resolve against them.
 */

const email = z.string().trim().toLowerCase().email();
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const registerSchema = z.object({
  email,
  password,
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .regex(/^\+91\d{10}$/, 'Phone must be +91 followed by 10 digits')
    .optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1),
  // 6-digit TOTP or a recovery code, required only when 2FA is enabled
  totp: z.string().trim().min(6).max(20).optional(),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(32).max(128),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(128),
  password,
});

export const totpVerifySchema = z.object({
  code: z.string().trim().min(6).max(20),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type TotpVerifyInput = z.infer<typeof totpVerifySchema>;
