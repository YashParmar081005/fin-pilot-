/**
 * Auth controllers (plan.md §5.2): parse, call ONE service method, serialise.
 * No business logic here.
 */
import type { Request, Response } from 'express';
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  TotpVerifyInput,
  VerifyEmailInput,
} from '@finpilot/shared';
import { authService, type ClientInfo } from '../services/authService';
import { REFRESH_COOKIE, refreshCookieOptions } from '../services/tokenService';
import { ok } from '../utils/respond';

function clientInfo(req: Request): ClientInfo {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

export const authController = {
  async register(req: Request, res: Response) {
    const user = await authService.register(req.body as RegisterInput);
    ok(res, { user }, 201);
  },

  async login(req: Request, res: Response) {
    const result = await authService.login(req.body as LoginInput, clientInfo(req));
    setRefreshCookie(res, result.refreshToken);
    ok(res, { accessToken: result.accessToken, user: result.user });
  },

  async refresh(req: Request, res: Response) {
    const raw = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE] ?? '';
    const result = await authService.refresh(raw, clientInfo(req));
    setRefreshCookie(res, result.refreshToken);
    ok(res, { accessToken: result.accessToken, user: result.user });
  },

  async logout(req: Request, res: Response) {
    await authService.logout((req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions().path });
    ok(res, { loggedOut: true });
  },

  async verifyEmail(req: Request, res: Response) {
    await authService.verifyEmail((req.body as VerifyEmailInput).token);
    ok(res, { verified: true });
  },

  async forgotPassword(req: Request, res: Response) {
    await authService.forgotPassword((req.body as ForgotPasswordInput).email);
    // identical response whether or not the account exists (§17.3)
    ok(res, { sent: true });
  },

  async resetPassword(req: Request, res: Response) {
    const body = req.body as ResetPasswordInput;
    await authService.resetPassword(body.token, body.password);
    ok(res, { reset: true });
  },

  async totpSetup(req: Request, res: Response) {
    ok(res, await authService.totpSetup(req.user!.id));
  },

  async totpVerify(req: Request, res: Response) {
    ok(res, await authService.totpVerify(req.user!.id, (req.body as TotpVerifyInput).code));
  },

  async totpDisable(req: Request, res: Response) {
    await authService.totpDisable(req.user!.id, (req.body as TotpVerifyInput).code);
    ok(res, { disabled: true });
  },

  async listSessions(req: Request, res: Response) {
    ok(res, { sessions: await authService.listSessions(req.user!.id, req.user!.familyId) });
  },

  async revokeSession(req: Request, res: Response) {
    await authService.revokeSession(req.user!.id, String(req.params.id));
    ok(res, { revoked: true });
  },
};
