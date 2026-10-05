import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { findSetCookie } from './helpers/cookies.js';
import { createTestApp } from './helpers/create-test-app.js';
import { loginUser, registerUser } from './helpers/users.js';

describe('POST /api/auth/logout', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  function logout(cookie?: string) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: cookie ? { cookie } : {},
    });
  }

  function me(cookie: string) {
    return app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
  }

  function expectCleared(response: Awaited<ReturnType<typeof logout>>) {
    const cleared = findSetCookie(response.headers['set-cookie'], 'sid');

    expect(cleared).toBeDefined();
    expect(cleared?.value).toBe('');
    expect(cleared?.attributes['path']).toBe('/');
    expect(cleared?.attributes['httponly']).toBe(true);
    expect(new Date(String(cleared?.attributes['expires'])).getTime()).toBeLessThan(Date.now());
  }

  it('ends the session, clears the cookie and returns 204', async () => {
    const { cookie, user } = await registerUser(app);

    const response = await logout(cookie);

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expectCleared(response);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('rejects the old cookie afterwards', async () => {
    const { cookie } = await registerUser(app);
    expect((await me(cookie)).statusCode).toBe(200);

    await logout(cookie);

    const replay = await me(cookie);
    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('only ends the current session, not the same user’s other sessions', async () => {
    const { email, password, cookie: first } = await registerUser(app);
    const { cookie: second } = await loginUser(app, { email, password });

    await logout(first);

    expect((await me(first)).statusCode).toBe(401);
    expect((await me(second ?? '')).statusCode).toBe(200);
  });

  it.each([
    { name: 'no cookie', cookie: undefined },
    { name: 'a garbage cookie', cookie: 'sid=not-a-real-token' },
  ])('still returns 204 and clears the cookie with $name', async ({ cookie }) => {
    const response = await logout(cookie);

    expect(response.statusCode).toBe(204);
    expectCleared(response);
  });

  it('is harmless when repeated', async () => {
    const { cookie } = await registerUser(app);

    expect((await logout(cookie)).statusCode).toBe(204);
    expect((await logout(cookie)).statusCode).toBe(204);
  });
});
