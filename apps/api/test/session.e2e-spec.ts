import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { generateSessionToken } from '../src/modules/auth/session-token.js';
import { createTestApp } from './helpers/create-test-app.js';
import { registerUser } from './helpers/users.js';

describe('GET /api/auth/me and session validity', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  function me(headers: Record<string, string> = {}, query = '') {
    return app.inject({ method: 'GET', url: `/api/auth/me${query}`, headers });
  }

  it('recognises a request that carries only the cookie (reload persistence)', async () => {
    const { cookie, user } = await registerUser(app);

    const response = await me({ cookie });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: user.id, email: user.email });
  });

  it('rejects every kind of bad session with the same 401 UNAUTHENTICATED', async () => {
    const expired = await registerUser(app);
    await prisma.session.updateMany({
      where: { userId: expired.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const deleted = await registerUser(app);
    await prisma.user.delete({ where: { id: deleted.user.id } });

    const responses = await Promise.all([
      me(),
      me({ cookie: 'sid=%%%not-a-token' }),
      me({ cookie: 'sid=' }),
      me({ cookie: `sid=${generateSessionToken()}` }),
      me({ cookie: expired.cookie }),
      me({ cookie: deleted.cookie }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED' });
    }
    const [first, ...rest] = responses.map((r) => r.body);
    for (const body of rest) {
      expect(body).toBe(first);
    }
  });

  it('deletes an expired session when it is used', async () => {
    const { cookie, user } = await registerUser(app);
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await me({ cookie });

    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('cascades session deletion when the user is deleted', async () => {
    const { user } = await registerUser(app);

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('never lets a client-supplied userId change who is authenticated', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);

    const response = await me({ cookie: a.cookie, 'x-user-id': b.user.id }, `?userId=${b.user.id}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: a.user.id, email: a.user.email });
  });
});
