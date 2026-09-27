import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';

describe('API foundation', () => {
  it('returns the health response', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'prodora-api',
      version: '1',
    });
    expect(response.headers['x-request-id']).toBeTypeOf('string');
  });

  it('returns a safe structured error for unknown routes', async () => {
    const response = await request(app).get('/api/v1/unknown');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource was not found.',
      },
    });
    expect(response.body.error.requestId).toBe(
      response.headers['x-request-id'],
    );
  });
});
