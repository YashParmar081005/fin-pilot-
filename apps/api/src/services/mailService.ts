/**
 * Outbound mail. Dev: Mailhog SMTP (docker-compose). Prod: Resend/SES later.
 * Test: an in-memory sink so specs can assert on sent mail without a server.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';
import { guardOutbound, mailLimiter } from '../integrations/limiters';

export interface SentMail {
  to: string;
  subject: string;
  text: string;
}

const testOutbox: SentMail[] = [];
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  const env = getEnv();
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
  });
  return transporter;
}

// L5 (§19.7): SMTP is an outbound client like any other — limited + breakered
let guardedSend: ((mail: SentMail) => Promise<unknown>) | null = null;

export async function sendMail(mail: SentMail): Promise<void> {
  const env = getEnv();
  if (env.NODE_ENV === 'test') {
    testOutbox.push(mail);
    return;
  }
  guardedSend ??= guardOutbound('smtp', mailLimiter, (m: SentMail) =>
    getTransporter().sendMail({ from: getEnv().MAIL_FROM, ...m }),
  );
  try {
    await guardedSend(mail);
  } catch (err) {
    // Mail must never take down an auth flow — log and continue.
    logger.error({ err, to: mail.to, subject: mail.subject }, 'mail send failed');
  }
}

/** Test hook — returns the in-memory outbox (test env only). */
export function getTestOutbox(): SentMail[] {
  return testOutbox;
}

export function mailTemplates(appUrl: string) {
  return {
    verifyEmail: (token: string): Omit<SentMail, 'to'> => ({
      subject: 'Verify your FinPilot email',
      text: `Welcome to FinPilot!\n\nVerify your email: ${appUrl}/verify-email?token=${token}\n\nThis link expires in 1 hour.`,
    }),
    resetPassword: (token: string): Omit<SentMail, 'to'> => ({
      subject: 'Reset your FinPilot password',
      text: `Reset your password: ${appUrl}/reset-password?token=${token}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
    }),
    refreshReuseAlert: (): Omit<SentMail, 'to'> => ({
      subject: 'FinPilot security alert — session revoked',
      text: 'A sign-in token for your account was reused. All sessions from that device family were signed out as a precaution. If this was not you, change your password now.',
    }),
  };
}
