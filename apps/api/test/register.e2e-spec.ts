import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { hashSessionToken } from '../src/modules/auth/session-token.js';
import { findSetCookie } from './helpers/cookies.js';
import { createTestApp } from './helpers/create-test-app.js';
import { VALID_PASSWORD, registerUser, uniqueEmail } from './helpers/users.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

describe('POST /api/auth/register', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  function register(payload: object) {
    return app.inject({ method: 'POST', url: '/api/auth/register', payload });
  }

  it('creates the account, signs the user in and sets a safe session cookie', async () => {
    const email = uniqueEmail();

    const response = await register({ email, password: VALID_PASSWORD });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(Object.keys(body).sort((a, b) => a.localeCompare(b))).toEqual(['email', 'id']);
    expect(body.email).toBe(email);

    const cookie = findSetCookie(response.headers['set-cookie'], 'sid');
    expect(cookie).toBeDefined();
    expect(cookie?.attributes['httponly']).toBe(true);
    expect(cookie?.attributes['samesite']).toBe('Lax');
    expect(cookie?.attributes['path']).toBe('/');
    expect(cookie?.attributes['secure']).toBeUndefined();

    const expires = cookie?.attributes['expires'];
    expect(typeof expires).toBe('string');
    const lifetime = new Date(String(expires)).getTime() - Date.now();
    expect(Math.abs(lifetime - WEEK_MS)).toBeLessThan(60_000);
  });

  it('stores an Argon2id password hash and only a hash of the session token', async () => {
    const { user, cookie, password } = await registerUser(app);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(stored.passwordHash).not.toContain(password);

    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
    const rawToken = cookie.slice('sid='.length);
    expect(sessions[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sessions[0]?.tokenHash).not.toBe(rawToken);
    expect(sessions[0]?.tokenHash).toBe(hashSessionToken(rawToken));
  });

  it('rejects a duplicate email, including different case and whitespace', async () => {
    const { email } = await registerUser(app);

    const response = await register({
      email: `  ${email.toUpperCase()} `,
      password: VALID_PASSWORD,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ statusCode: 409, code: 'EMAIL_ALREADY_REGISTERED' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('lets exactly one of two simultaneous registrations win', async () => {
    const email = uniqueEmail();

    const responses = await Promise.all([
      register({ email, password: VALID_PASSWORD }),
      register({ email, password: VALID_PASSWORD }),
    ]);

    expect(responses.map((r) => r.statusCode).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  describe('invalid input', () => {
    const email = uniqueEmail('invalid');
    const cases: { name: string; payload?: object; raw?: string; fields?: string[] }[] = [
      {
        name: 'a bad email',
        payload: { email: 'nope', password: VALID_PASSWORD },
        fields: ['email'],
      },
      { name: 'a too-short password', payload: { email, password: 'short' }, fields: ['password'] },
      { name: 'missing fields', payload: {}, fields: ['email', 'password'] },
      {
        name: 'wrong types',
        payload: { email: 123, password: true },
        fields: ['email', 'password'],
      },
      { name: 'no body' },
      { name: 'an empty JSON body', raw: '' },
      { name: 'malformed JSON', raw: '{"email": ' },
    ];

    it.each(cases)(
      'returns 400 for $name and creates no user',
      async ({ payload, raw, fields }) => {
        const response =
          raw === undefined
            ? await app.inject({ method: 'POST', url: '/api/auth/register', payload })
            : await app.inject({
                method: 'POST',
                url: '/api/auth/register',
                headers: { 'content-type': 'application/json' },
                payload: raw,
              });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
        expect(response.headers['set-cookie']).toBeUndefined();
        for (const field of fields ?? []) {
          expect(response.json().fieldErrors).toHaveProperty(field);
        }
        expect(await prisma.user.count({ where: { email } })).toBe(0);
      },
    );
  });

  it('ignores a client-supplied userId', async () => {
    const response = await register({
      email: uniqueEmail(),
      password: VALID_PASSWORD,
      userId: 'someone-else',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().id).not.toBe('someone-else');
    expect(await prisma.user.count({ where: { id: 'someone-else' } })).toBe(0);
  });
});
