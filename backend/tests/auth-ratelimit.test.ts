// Tight limits must be in place before the app (and its env config) loads.
process.env.RATE_LIMIT_REGISTER = '1000:1m';
process.env.RATE_LIMIT_LOGIN = '3:1m';
process.env.RATE_LIMIT_REFRESH = '1000:1m';

import request from 'supertest';
import { describe, expect, it } from 'vitest';

const { app } = await import('../src/app.js');

describe('auth rate limiting', () => {
  it('returns 429 with Retry-After once the login window is exhausted', async () => {
    const attempts = [];
    for (let i = 0; i < 4; i += 1) {
      attempts.push(
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: `ratelimit-${i}@example.test`,
            password: 'SomeWrongPassword!1',
          }),
      );
    }

    // First three attempts are genuine auth failures...
    for (const attempt of attempts.slice(0, 3)) {
      expect(attempt.status).toBe(401);
    }

    // ...the fourth is rejected before credentials are even checked.
    const limited = attempts[3]!;
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeTypeOf('string');
  });
});
