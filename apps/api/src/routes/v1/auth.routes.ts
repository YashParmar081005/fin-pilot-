import { Router } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  totpVerifySchema,
  verifyEmailSchema,
} from '@finpilot/shared';
import { authController as ctrl } from '../../controllers/authController';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';

export const authRoutes = Router();

authRoutes.post('/register', validate(registerSchema), asyncHandler(ctrl.register));
authRoutes.post('/login', validate(loginSchema), asyncHandler(ctrl.login));
authRoutes.post('/refresh', asyncHandler(ctrl.refresh));
authRoutes.post('/logout', asyncHandler(ctrl.logout));
authRoutes.post('/verify-email', validate(verifyEmailSchema), asyncHandler(ctrl.verifyEmail));
authRoutes.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  asyncHandler(ctrl.forgotPassword),
);
authRoutes.post('/reset-password', validate(resetPasswordSchema), asyncHandler(ctrl.resetPassword));

authRoutes.post('/2fa/setup', authenticate, asyncHandler(ctrl.totpSetup));
authRoutes.post(
  '/2fa/verify',
  authenticate,
  validate(totpVerifySchema),
  asyncHandler(ctrl.totpVerify),
);
authRoutes.post(
  '/2fa/disable',
  authenticate,
  validate(totpVerifySchema),
  asyncHandler(ctrl.totpDisable),
);

authRoutes.get('/sessions', authenticate, asyncHandler(ctrl.listSessions));
authRoutes.delete('/sessions/:id', authenticate, asyncHandler(ctrl.revokeSession));
