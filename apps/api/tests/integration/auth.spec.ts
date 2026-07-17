/**
 * Phase 2 acceptance (plan.md §32):
 * - reuse detection: use R, refresh → R', replay R → the whole family is
 *   revoked and the user is emailed
 * - timing on a nonexistent email is within 10% of an existing one
 * - 6 failed logins locks the account for 15 min
 * Plus: register/verify-email, password reset, TOTP 2FA, session listing.
 */
import { authenticator } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { connectTestDb, disconnectTestDb } from '../helpers/db';
import { getTestOutbox } from '../../src/services/mailService';
import { buildApp } from '../../src/server';
import { User } from '../../src/models/User';

let app: Express;

beforeAll(async () => {
  await connectTestDb();
  app = buildApp('api');
});

afterAll(async () => {
  await disconnectTestDb();
});

const PASSWORD = 'correct-horse-battery';

function extractRefreshCookie(res: request.Response): string {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  const rt = cookies?.find((c) => c.startsWith('fp_rt='));
  expect(rt, 'refresh cookie present').toBeDefined();
  expect(rt).toContain('HttpOnly');
  expect(rt).toContain('Path=/api/v1/auth');
  return rt!.split(';')[0]!.slice('fp_rt='.length);
}

function lastMailToken(to: string): string {
  const mail = [...getTestOutbox()].reverse().find((m) => m.to === to);
  expect(mail, `mail sent to ${to}`).toBeDefined();
  const match = /token=([0-9a-f]{64})/.exec(mail!.text);
  expect(match, 'token in mail body').toBeTruthy();
  return match![1]!;
}

async function registerAndLogin(email: string) {
  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: PASSWORD, name: 'Test User' })
    .expect(201);
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return { accessToken: res.body.data.accessToken as string, refresh: extractRefreshCookie(res) };
}

describe('register + email verification', () => {
  const email = 'owner@vadodara-textiles.in';

  it('registers, emails a verification token, verifies', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, name: 'Owner' })
      .expect(201);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.emailVerified).toBe(false);

    await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: lastMailToken(email) })
      .expect(200);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    expect(login.body.data.user.emailVerified).toBe(true);
  });

  it('a verification token is single-use', async () => {
    const token = lastMailToken(email);
    await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(401);
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, name: 'Owner Again' })
      .expect(409);
    expect(res.body.error.code).toBe('AUTH_EMAIL_ALREADY_REGISTERED');
  });

  it('rejects an invalid body with the 422 validation envelope', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'short', name: '' })
      .expect(422);
    expect(res.body.error.code).toBe('SYS_VALIDATION_FAILED');
    expect(res.body.error.details.fieldErrors.email).toBeDefined();
  });
});

describe('refresh rotation with family reuse detection (§17.2)', () => {
  const email = 'accountant@vadodara-textiles.in';

  it('rotates R → R′, then a replay of R burns the whole family and emails the user', async () => {
    const { refresh: R } = await registerAndLogin(email);

    // legitimate rotation: R → R'
    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `fp_rt=${R}`)
      .expect(200);
    const Rprime = extractRefreshCookie(rotated);
    expect(Rprime).not.toBe(R);

    const mailsBefore = getTestOutbox().filter((m) => m.to === email).length;

    // replay the OLD token → reuse detected
    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `fp_rt=${R}`)
      .expect(401);
    expect(reuse.body.error.code).toBe('AUTH_TOKEN_REUSE');

    // the whole family is dead — R' no longer works either
    await request(app).post('/api/v1/auth/refresh').set('Cookie', `fp_rt=${Rprime}`).expect(401);

    // and the user was alerted by email
    const securityMails = getTestOutbox().filter((m) => m.to === email);
    expect(securityMails.length).toBe(mailsBefore + 1);
    expect(securityMails.at(-1)!.subject).toContain('security alert');
  });

  it('a garbage refresh token is a plain 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'fp_rt=deadbeef')
      .expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });
});

describe('login throttle (§17.3)', () => {
  const email = 'lockout@vadodara-textiles.in';

  it('6 failed logins locks the account for 15 min — even for the right password', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, name: 'Lockout' })
      .expect(201);

    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
      expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    }

    const locked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(423);
    expect(locked.body.error.code).toBe('AUTH_ACCOUNT_LOCKED');
    const retryAt = new Date(locked.body.error.details.retryAt).getTime();
    expect(retryAt).toBeGreaterThan(Date.now() + 13 * 60_000);
    expect(retryAt).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
  });
});

describe('timing safety (§17.3)', () => {
  it('nonexistent email responds within 10% of an existing one', async () => {
    const email = 'timing@vadodara-textiles.in';
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, name: 'Timing' })
      .expect(201);

    async function medianLoginMs(target: string): Promise<number> {
      const times: number[] = [];
      for (let i = 0; i < 9; i++) {
        // keep the lockout throttle out of the measurement (it has its own test)
        await User.updateOne({ email }, { failedLoginCount: 0, lockedUntil: null });
        const start = process.hrtime.bigint();
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email: target, password: 'definitely-wrong' })
          .expect(401);
        times.push(Number(process.hrtime.bigint() - start) / 1e6);
      }
      times.sort((a, b) => a - b);
      return times[Math.floor(times.length / 2)]!;
    }

    // warm both paths once (dummy hash creation, JIT)
    await medianLoginMs(email);
    await medianLoginMs('ghost@vadodara-textiles.in');

    const existing = await medianLoginMs(email);
    const ghost = await medianLoginMs('ghost@vadodara-textiles.in');
    const spread = Math.abs(existing - ghost) / Math.max(existing, ghost);
    expect(spread, `existing=${existing}ms ghost=${ghost}ms`).toBeLessThan(0.1);
  });
});

describe('password reset (§17.3)', () => {
  const email = 'reset@vadodara-textiles.in';
  const NEW_PASSWORD = 'brand-new-password-9';

  it('forgot → reset invalidates sessions and old password', async () => {
    const { refresh } = await registerAndLogin(email);

    await request(app).post('/api/v1/auth/forgot-password').send({ email }).expect(200);
    // identical response for an unknown email — no account enumeration
    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@nowhere.in' })
      .expect(200);

    await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: lastMailToken(email), password: NEW_PASSWORD })
      .expect(200);

    // every session is revoked
    await request(app).post('/api/v1/auth/refresh').set('Cookie', `fp_rt=${refresh}`).expect(401);
    // old password is dead, new one works
    await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(401);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: NEW_PASSWORD })
      .expect(200);
  });
});

describe('TOTP 2FA (§17.3)', () => {
  const email = '2fa@vadodara-textiles.in';
  let accessToken: string;
  let secret: string;
  let recoveryCodes: string[];

  it('setup → verify enables 2FA and returns 10 recovery codes', async () => {
    ({ accessToken } = await registerAndLogin(email));

    const setup = await request(app)
      .post('/api/v1/auth/2fa/setup')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    secret = setup.body.data.secret;
    expect(setup.body.data.otpauthUrl).toContain('otpauth://totp/');

    const verify = await request(app)
      .post('/api/v1/auth/2fa/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: authenticator.generate(secret) })
      .expect(200);
    recoveryCodes = verify.body.data.recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);
  });

  it('login now requires TOTP; a valid code passes', async () => {
    const missing = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(401);
    expect(missing.body.error.code).toBe('AUTH_TOTP_REQUIRED');

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD, totp: authenticator.generate(secret) })
      .expect(200);
  });

  it('a recovery code works exactly once', async () => {
    const code = recoveryCodes[0]!;
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD, totp: code })
      .expect(200);
    const replay = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD, totp: code })
      .expect(401);
    expect(replay.body.error.code).toBe('AUTH_TOTP_INVALID');
  });
});

describe('session listing and remote revoke (§17.3)', () => {
  const email = 'sessions@vadodara-textiles.in';

  it('lists active sessions and can kill one from another device', async () => {
    const first = await registerAndLogin(email);
    // second device
    const second = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const secondToken = second.body.data.accessToken as string;

    const list = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200);
    const sessions = list.body.data.sessions as Array<{ id: string; current: boolean }>;
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);

    // revoke the first device's session
    const target = sessions.find((s) => !s.current)!;
    await request(app)
      .delete(`/api/v1/auth/sessions/${target.id}`)
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200);

    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `fp_rt=${first.refresh}`)
      .expect(401);
  });

  it('sessions endpoints require authentication', async () => {
    await request(app).get('/api/v1/auth/sessions').expect(401);
  });
});
