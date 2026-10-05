import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { hashSessionToken } from '../src/modules/auth/session/session-token.js';
import { findSetCookie } from './helpers/cookies.js';
import { createTestApp } from './helpers/create-test-app.js';
import { VALID_PASSWORD, loginUser, registerUser, uniqueEmail } from './helpers/users.js';

describe('POST /api/auth/login', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  function me(cookie: string) {
    return app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
  }

  it('signs in with correct credentials and sets a session cookie that works', async () => {
    const { email, password, user } = await registerUser(app);

    const { response, cookie } = await loginUser(app, { email, password });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: user.id, email });

    const setCookie = findSetCookie(response.headers['set-cookie'], 'sid');
    expect(setCookie?.attributes['httponly']).toBe(true);
    expect(setCookie?.attributes['samesite']).toBe('Lax');
    expect(setCookie?.attributes['path']).toBe('/');
    expect(setCookie?.attributes['secure']).toBeUndefined();
    expect(setCookie?.attributes['expires']).toEqual(expect.any(String));

    expect(cookie).toBeDefined();
    const current = await me(cookie ?? '');
    expect(current.statusCode).toBe(200);
    expect(current.json()).toEqual({ id: user.id, email });
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const { email } = await registerUser(app);

    const wrongPassword = await loginUser(app, { email, password: 'definitely-wrong' });
    const unknownEmail = await loginUser(app, {
      email: uniqueEmail('nobody'),
      password: VALID_PASSWORD,
    });

    for (const { response, cookie } of [wrongPassword, unknownEmail]) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(cookie).toBeUndefined();
    }
    expect(wrongPassword.response.body).toBe(unknownEmail.response.body);
    expect(wrongPassword.response.headers['content-type']).toBe(
      unknownEmail.response.headers['content-type'],
    );
  });

  it('accepts an email with different case or surrounding whitespace', async () => {
    const { email, password, user } = await registerUser(app);

    const { response } = await loginUser(app, { email: `  ${email.toUpperCase()}  `, password });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: user.id, email });
  });

  it('treats a malformed-format email as a failed login, not a validation error', async () => {
    const { response } = await loginUser(app, { email: 'not-an-email', password: VALID_PASSWORD });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it.each([
    { name: 'missing fields', payload: {} },
    { name: 'wrong types', payload: { email: 123, password: true } },
    { name: 'an empty password', payload: { email: 'a@example.test', password: '' } },
    { name: 'an empty email', payload: { email: '', password: 'x' } },
  ])('returns 400 for $name', async ({ payload }) => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('creates a separate session per login and leaves earlier ones valid', async () => {
    const { email, password, user, cookie: registrationCookie } = await registerUser(app);

    const first = await loginUser(app, { email, password });
    const second = await loginUser(app, { email, password });

    expect(first.cookie).not.toBe(second.cookie);
    expect((await me(registrationCookie)).statusCode).toBe(200);
    expect((await me(first.cookie ?? '')).statusCode).toBe(200);
    expect((await me(second.cookie ?? '')).statusCode).toBe(200);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(3);
  });

  it('stores only a hash of each session token', async () => {
    const { email, password, user } = await registerUser(app);
    const { cookie } = await loginUser(app, { email, password });
    const rawToken = (cookie ?? '').slice('sid='.length);

    const hashes = (await prisma.session.findMany({ where: { userId: user.id } })).map(
      (session) => session.tokenHash,
    );

    expect(hashes).toContain(hashSessionToken(rawToken));
    expect(hashes).not.toContain(rawToken);
  });
});
