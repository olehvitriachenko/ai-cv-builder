import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './helpers/create-test-app.js';

const WEB_ORIGIN = 'http://localhost:3000';

describe('CORS preflight', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  function preflight(method: string, origin = WEB_ORIGIN) {
    return app.inject({
      method: 'OPTIONS',
      url: '/api/cvs/some-id',
      headers: { origin, 'access-control-request-method': method },
    });
  }

  it.each(['PUT', 'DELETE'])('allows %s from the web origin with credentials', async (method) => {
    const response = await preflight(method);

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    const allowed = String(response.headers['access-control-allow-methods']);
    expect(allowed.split(',').map((value) => value.trim())).toContain(method);
  });

  it('still allows the existing methods', async () => {
    const response = await preflight('POST');

    expect(String(response.headers['access-control-allow-methods'])).toContain('POST');
  });

  it('does not allow a foreign origin', async () => {
    const response = await preflight('DELETE', 'http://evil.example');

    expect(response.headers['access-control-allow-origin']).not.toBe('http://evil.example');
  });
});
