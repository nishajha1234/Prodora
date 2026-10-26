process.env.RATE_LIMIT_REGISTER = '1000:1m';
process.env.RATE_LIMIT_LOGIN = '1000:1m';
process.env.RATE_LIMIT_REFRESH = '1000:1m';

import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const { app } = await import('../src/app.js');
const { prisma } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');
const { REFRESH_COOKIE_NAME } = await import('../src/services/auth.service.js');

const PASSWORD = 'Phase3Test!Passw0rd';
const runId = randomUUID().slice(0, 8);
const testEmail = (label: string) => `phase3-${label}-${runId}@example.test`;

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function refreshCookieFrom(response: request.Response): string | undefined {
  const cookies = response.headers['set-cookie'];
  const list = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
  const cookie = list.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!cookie) return undefined;
  const value = cookie.split(';')[0]?.slice(REFRESH_COOKIE_NAME.length + 1);
  return value ? decodeURIComponent(value) : undefined;
}

function cookieCleared(response: request.Response): boolean {
  const cookies = response.headers['set-cookie'];
  const list = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
  const cookie = list.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!cookie) return false;
  // Express 5 clears with Max-Age=0 and/or an epoch Expires date.
  return /max-age=0/i.test(cookie) || /expires=thu, 01 jan 1970/i.test(cookie);
}

async function register(
  email: string,
  overrides: Record<string, unknown> = {},
) {
  return request(app)
    .post('/api/v1/auth/register')
    .send({
      email,
      displayName: 'Phase 3 Tester',
      password: PASSWORD,
      ...overrides,
    });
}

async function login(email: string, password = PASSWORD) {
  return request(app).post('/api/v1/auth/login').send({ email, password });
}

function bearer(response: request.Response): string {
  const token = response.body.accessToken as string;
  expect(token).toBeTypeOf('string');
  return token;
}

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { email: { startsWith: 'phase3-' } },
  });
  await prisma.$disconnect();
});

describe('registration', () => {
  it('creates an owner, returns a token, and sets an HttpOnly refresh cookie', async () => {
    const email = testEmail('register');
    const response = await register(email);

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      email,
      roleCode: 'owner',
      displayName: 'Phase 3 Tester',
    });
    expect(response.body.accessToken).toBeTypeOf('string');
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.body).not.toHaveProperty('passwordHash');

    const cookie = refreshCookieFrom(response);
    expect(cookie).toBeTypeOf('string');

    const raw = Array.isArray(response.headers['set-cookie'])
      ? response.headers['set-cookie'].find((c) =>
          c.startsWith(`${REFRESH_COOKIE_NAME}=`),
        )
      : undefined;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(raw).toContain('Path=/api/v1/auth');
    expect(raw).not.toMatch(/Secure/i);
  });

  it('stores the refresh token only as a SHA-256 hash', async () => {
    const response = await register(testEmail('hash'));
    const cookie = refreshCookieFrom(response);
    expect(cookie).toBeTruthy();

    const byHash = await prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(cookie!) },
    });
    expect(byHash).not.toBeNull();

    const byRaw = await prisma.refreshToken.findMany({
      where: { tokenHash: cookie! },
    });
    expect(byRaw).toHaveLength(0);
  });

  it('normalizes the email and accepts login with any casing', async () => {
    const email = `phase3-Mixed.${runId}@Example.COM`;
    const response = await register(email);

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe(`phase3-mixed.${runId}@example.com`);

    const loginResponse = await login(`PHASE3-MIXED.${runId}@example.com`);
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user.email).toBe(
      `phase3-mixed.${runId}@example.com`,
    );
  });

  it('rejects a duplicate email regardless of casing', async () => {
    const email = testEmail('dupe');
    expect((await register(email)).status).toBe(201);

    const duplicate = await register(email.toUpperCase());
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects weak passwords and malformed bodies safely', async () => {
    const weak = await register(testEmail('weak'), { password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');

    const malformed = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email' });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
    expect(malformed.body.error.requestId).toBeTypeOf('string');
  });

  it('never allows role self-escalation through the request body', async () => {
    const email = testEmail('escalate');
    const response = await register(email, {
      roleCode: 'admin',
      role: 'admin',
      roleId: 1,
      permissions: ['users:manage', 'roles:manage'],
    });

    expect(response.status).toBe(201);
    expect(response.body.user.roleCode).toBe('owner');

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${bearer(response)}`);
    expect(me.body.user.roleCode).toBe('owner');

    const permissions = await request(app)
      .get('/api/v1/auth/permissions')
      .set('Authorization', `Bearer ${bearer(response)}`);
    expect(permissions.body.permissions).toContain('account:read');
    expect(permissions.body.permissions).not.toContain('users:manage');
    expect(permissions.body.permissions).not.toContain('roles:manage');
    expect(permissions.body.permissions).not.toContain('permissions:manage');
  });
});

describe('login', () => {
  it('rejects a wrong password and an unknown email with the same safe error', async () => {
    const email = testEmail('login');
    await register(email);

    const wrongPassword = await login(email, 'WrongPassword!123');
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');

    const unknownEmail = await login(testEmail('nosuchuser'), PASSWORD);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error.message).toBe(
      wrongPassword.body.error.message,
    );
  });

  it('returns an access token and refresh cookie on success', async () => {
    const email = testEmail('login-ok');
    await register(email);

    const response = await login(email);
    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeTypeOf('string');
    expect(response.body.user.email).toBe(email);
    expect(refreshCookieFrom(response)).toBeTypeOf('string');
  });
});

describe('access tokens', () => {
  it('rejects an expired token', async () => {
    const response = await register(testEmail('expired'));
    const decoded = jwt.decode(response.body.accessToken) as {
      sub: string;
      email: string;
      roleCode: string;
    };

    const expired = jwt.sign(
      { sub: decoded.sub, email: decoded.email, roleCode: decoded.roleCode },
      env.JWT_ACCESS_SECRET,
      { issuer: 'prodora-api', audience: 'prodora-app', expiresIn: -10 },
    );

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expired}`);
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign(
      { sub: '1', email: 'attacker@example.test', roleCode: 'admin' },
      'a-completely-different-secret-value-32chars!',
      { issuer: 'prodora-api', audience: 'prodora-app', expiresIn: 900 },
    );

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${forged}`);
    expect(me.status).toBe(401);
  });

  it('rejects unauthenticated and refresh-cookie-only requests', async () => {
    const response = await register(testEmail('noauth'));
    const cookie = refreshCookieFrom(response);

    const noToken = await request(app).get('/api/v1/auth/me');
    expect(noToken.status).toBe(401);

    const cookieOnly = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookie}`);
    expect(cookieOnly.status).toBe(401);
  });
});

describe('refresh rotation and reuse detection', () => {
  it('rotates the refresh token and invalidates the previous one', async () => {
    const response = await register(testEmail('rotate'));
    const firstCookie = refreshCookieFrom(response)!;

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${firstCookie}`);
    expect(refreshed.status).toBe(200);

    const secondCookie = refreshCookieFrom(refreshed)!;
    expect(secondCookie).not.toBe(firstCookie);
    expect(refreshed.body.accessToken).toBeTypeOf('string');
    expect(refreshed.body).not.toHaveProperty('refreshToken');

    // New access token works.
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${bearer(refreshed)}`);
    expect(me.status).toBe(200);

    // Replaying the consumed token is rejected AND kills the session.
    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${firstCookie}`);
    expect(replay.status).toBe(401);

    // The successor token is revoked too because the session was compromised.
    const successor = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${secondCookie}`);
    expect(successor.status).toBe(401);

    const revoked = await prisma.refreshToken.findMany({
      where: { tokenHash: sha256(secondCookie), revokedAt: null },
    });
    expect(revoked).toHaveLength(0);
  });

  it('rejects refresh without a cookie', async () => {
    const response = await request(app).post('/api/v1/auth/refresh');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects an expired refresh token and revokes the session', async () => {
    const response = await register(testEmail('refttl'));
    const cookie = refreshCookieFrom(response)!;

    await prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(cookie) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookie}`);
    expect(refreshed.status).toBe(401);
    expect(refreshed.body.error.code).toBe('TOKEN_EXPIRED');

    const active = await prisma.refreshToken.findMany({
      where: { tokenHash: sha256(cookie), revokedAt: null },
    });
    expect(active).toHaveLength(0);
  });
});

describe('logout and revocation', () => {
  it('logs out the session and clears the cookie', async () => {
    const response = await register(testEmail('logout'));
    const cookie = refreshCookieFrom(response)!;

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookie}`);
    expect(logout.status).toBe(200);
    expect(cookieCleared(logout)).toBe(true);

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookie}`);
    expect(refreshed.status).toBe(401);
  });

  it('works with an expired/absent access token (cookie-only logout)', async () => {
    const response = await register(testEmail('logout-nojwt'));
    const cookie = refreshCookieFrom(response)!;

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookie}`);
    expect(logout.status).toBe(200);

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookie}`);
    expect(refreshed.status).toBe(401);
  });

  it('lists sessions and revokes only the target session', async () => {
    const email = testEmail('sessions');
    await register(email);
    const sessionA = await login(email);
    const sessionB = await login(email);
    const tokenB = bearer(sessionB);
    const cookieA = refreshCookieFrom(sessionA)!;
    const cookieB = refreshCookieFrom(sessionB)!;

    const sessions = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(sessions.status).toBe(200);
    // Registration plus two logins create three active sessions.
    expect(sessions.body.sessions).toHaveLength(3);

    const target = sessions.body.sessions.find(
      (s: { sessionId: string }) => s.sessionId === sessionA.body.sessionId,
    );
    expect(target).toBeTruthy();

    const revoke = await request(app)
      .post('/api/v1/auth/revoke')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ sessionId: target.sessionId });
    expect(revoke.status).toBe(200);

    // Revoked session cannot refresh.
    const refreshA = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookieA}`);
    expect(refreshA.status).toBe(401);

    // The other session still works.
    const refreshB = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookieB}`);
    expect(refreshB.status).toBe(200);

    const afterRevoke = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${bearer(refreshB)}`);
    expect(afterRevoke.body.sessions).toHaveLength(2);
  });

  it('cannot revoke a session that belongs to another user', async () => {
    const userA = await register(testEmail('owner-of-session'));
    const userB = await register(testEmail('attacker'));
    const sessionOfA = userA.body.sessionId as string;

    const attempt = await request(app)
      .post('/api/v1/auth/revoke')
      .set('Authorization', `Bearer ${bearer(userB)}`)
      .send({ sessionId: sessionOfA });
    expect(attempt.status).toBe(404);

    // User A's session still refreshes.
    const refreshA = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${refreshCookieFrom(userA)!}`);
    expect(refreshA.status).toBe(200);
  });

  it('rejects revoke without a sessionId', async () => {
    const response = await register(testEmail('revoke-missing'));
    const attempt = await request(app)
      .post('/api/v1/auth/revoke')
      .set('Authorization', `Bearer ${bearer(response)}`)
      .send({});
    expect(attempt.status).toBe(400);
  });
});

describe('authorization and endpoints', () => {
  it('exposes all Phase 3 endpoints behind the health check', async () => {
    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(200);

    const response = await register(testEmail('endpoints'));
    const token = bearer(response);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(`phase3-endpoints-${runId}@example.test`);

    const permissions = await request(app)
      .get('/api/v1/auth/permissions')
      .set('Authorization', `Bearer ${token}`);
    expect(permissions.status).toBe(200);
    expect(permissions.body.permissions).toEqual(
      expect.arrayContaining(['account:read', 'sessions:manage']),
    );

    const unknown = await request(app).post('/api/v1/auth/unknown');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('records authentication audit events without secrets', async () => {
    const email = testEmail('audit');
    const response = await register(email);
    const cookie = refreshCookieFrom(response)!;

    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookie}`);

    const events = await prisma.authEvent.findMany({
      orderBy: { id: 'desc' },
      take: 10,
    });
    const actions = events.map((event) => event.action);
    expect(actions).toContain('registration');
    expect(actions).toContain('refresh_rotate');

    for (const event of events) {
      expect(event.details ?? '').not.toContain(PASSWORD);
      expect(event.details ?? '').not.toContain(cookie);
    }
  });
});

describe('sensitive data stays out of logs and bodies', () => {
  let logs: string[] = [];
  let spies: Array<ReturnType<typeof vi.spyOn>> = [];

  beforeEach(() => {
    logs = [];
    spies = [
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(JSON.stringify(args));
      }),
      vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
        logs.push(JSON.stringify(args));
      }),
      vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
        logs.push(JSON.stringify(args));
      }),
      vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        logs.push(JSON.stringify(args));
      }),
    ];
  });

  afterEach(() => {
    for (const spy of spies) spy.mockRestore();
    spies = [];
  });

  it('never logs passwords, refresh tokens, or cookies', async () => {
    const email = testEmail('nologs');
    const registerResponse = await register(email);
    const cookie = refreshCookieFrom(registerResponse)!;

    const loginResponse = await login(email, 'WrongPassword!123');
    expect(loginResponse.status).toBe(401);

    const okLogin = await login(email);
    const okCookie = refreshCookieFrom(okLogin)!;

    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${okCookie}`);
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${okCookie}`);

    const joined = logs.join('\n');
    expect(joined).not.toContain(PASSWORD);
    expect(joined).not.toContain('WrongPassword!123');
    expect(joined).not.toContain(cookie);
    expect(joined).not.toContain(okCookie);
    expect(joined).not.toMatch(/prodora_refresh=/);
  });

  it('keeps the raw refresh token out of response bodies', async () => {
    const response = await register(testEmail('body'));
    const cookie = refreshCookieFrom(response)!;

    expect(JSON.stringify(response.body)).not.toContain(cookie);
    expect(response.body).not.toHaveProperty('refreshToken');

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookie}`);
    expect(JSON.stringify(refreshed.body)).not.toContain(
      refreshCookieFrom(refreshed)!,
    );
    expect(refreshed.body).not.toHaveProperty('refreshToken');
  });
});
