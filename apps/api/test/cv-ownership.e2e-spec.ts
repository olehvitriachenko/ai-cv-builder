import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { cvIdSchema } from '../src/modules/cv/cv.schemas.js';
import { generateSessionToken } from '../src/modules/auth/session-token.js';
import { createTestApp } from './helpers/create-test-app.js';
import { registerUser } from './helpers/users.js';

describe('CV ownership', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  function createCv(cookie: string | undefined, payload: object = {}, query = '') {
    return app.inject({
      method: 'POST',
      url: `/api/cvs${query}`,
      headers: cookie ? { cookie } : {},
      payload,
    });
  }

  function getCv(cookie: string | undefined, id: string, query = '', headers = {}) {
    return app.inject({
      method: 'GET',
      url: `/api/cvs/${id}${query}`,
      headers: { ...(cookie ? { cookie } : {}), ...headers },
    });
  }

  describe('creating and reading', () => {
    it('creates a CV owned by the authenticated user', async () => {
      const a = await registerUser(app);

      const response = await createCv(a.cookie, { targetRole: 'Backend Engineer' });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(Object.keys(body).sort((x, y) => x.localeCompare(y))).toEqual([
        'createdAt',
        'id',
        'targetRole',
        'updatedAt',
      ]);
      expect(body.targetRole).toBe('Backend Engineer');
      expect(typeof body.createdAt).toBe('string');

      const row = await prisma.cv.findUniqueOrThrow({ where: { id: body.id } });
      expect(row.userId).toBe(a.user.id);
    });

    it('stores a CV without a targetRole as null and rejects a blank one', async () => {
      const a = await registerUser(app);

      const withoutRole = await createCv(a.cookie);
      expect(withoutRole.statusCode).toBe(201);
      expect(withoutRole.json().targetRole).toBeNull();

      const blank = await createCv(a.cookie, { targetRole: '   ' });
      expect(blank.statusCode).toBe(400);
      expect(blank.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('returns an owned CV', async () => {
      const a = await registerUser(app);
      const created = (await createCv(a.cookie, { targetRole: 'QA Engineer' })).json();

      const response = await getCv(a.cookie, created.id);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(created);
    });

    it('produces ids that the id schema accepts', async () => {
      const a = await registerUser(app);
      const created = (await createCv(a.cookie)).json();

      expect(cvIdSchema.safeParse(created.id).success).toBe(true);
    });

    it('rejects a malformed id with 400', async () => {
      const a = await registerUser(app);

      const response = await getCv(a.cookie, 'not-an-id');

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('cross-user access', () => {
    it('answers another user’s CV exactly like a CV that does not exist', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);
      const cv = (await createCv(a.cookie, { targetRole: 'Secret Role' })).json();

      const notOwned = await getCv(b.cookie, cv.id);
      const missing = await getCv(b.cookie, 'cnonexistentidxxxxxxxxxxx');

      expect(notOwned.statusCode).toBe(404);
      expect(notOwned.json()).toMatchObject({ statusCode: 404, code: 'CV_NOT_FOUND' });
      expect(notOwned.body).toBe(missing.body);
      expect(notOwned.statusCode).toBe(missing.statusCode);
      expect(notOwned.body).not.toContain('Secret Role');
    });

    it('ignores a client-supplied userId in the body', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);

      const response = await createCv(a.cookie, { targetRole: 'Mine', userId: b.user.id });

      expect(response.statusCode).toBe(201);
      const row = await prisma.cv.findUniqueOrThrow({ where: { id: response.json().id } });
      expect(row.userId).toBe(a.user.id);
      expect(await prisma.cv.count({ where: { userId: b.user.id } })).toBe(0);
    });

    it('ignores userId in the query and an x-user-id header when creating', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);

      const response = await createCv(a.cookie, { targetRole: 'Mine' }, `?userId=${b.user.id}`);

      const row = await prisma.cv.findUniqueOrThrow({ where: { id: response.json().id } });
      expect(row.userId).toBe(a.user.id);
    });

    it('does not let a userId in the query or a header grant or hide access', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);
      const cv = (await createCv(a.cookie, { targetRole: 'Mine' })).json();

      const intruder = await getCv(b.cookie, cv.id, `?userId=${a.user.id}`, {
        'x-user-id': a.user.id,
      });
      expect(intruder.statusCode).toBe(404);

      const owner = await getCv(a.cookie, cv.id, `?userId=${b.user.id}`, {
        'x-user-id': b.user.id,
      });
      expect(owner.statusCode).toBe(200);
    });
  });

  describe('unauthenticated access', () => {
    it('answers every kind of bad session with the same 401 on both CV routes', async () => {
      const owner = await registerUser(app);
      const cv = (await createCv(owner.cookie)).json();

      const expired = await registerUser(app);
      await prisma.session.updateMany({
        where: { userId: expired.user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const signedOut = await registerUser(app);
      await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { cookie: signedOut.cookie },
      });

      const kinds = [
        undefined,
        `sid=${generateSessionToken()}`,
        'sid=%%%garbage',
        expired.cookie,
        signedOut.cookie,
      ];

      const responses = (
        await Promise.all(
          kinds.flatMap((cookie) => [createCv(cookie, { targetRole: 'x' }), getCv(cookie, cv.id)]),
        )
      ).map((response) => response);

      for (const response of responses) {
        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED' });
      }
      const [first, ...rest] = responses.map((response) => response.body);
      for (const body of rest) {
        expect(body).toBe(first);
      }
    });
  });
});
