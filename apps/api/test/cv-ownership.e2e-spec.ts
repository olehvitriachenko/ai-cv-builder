import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { cvIdSchema } from '../src/modules/cv/schemas/cv.schemas.js';
import { generateSessionToken } from '../src/modules/auth/session/session-token.js';
import { createTestApp } from './helpers/create-test-app.js';
import { VALID_SOURCE_TEXT, VALID_TARGET_ROLE, getStatus, postCv } from './helpers/cvs.js';
import { buildMultipart } from './helpers/multipart.js';
import { buildTextPdf } from './helpers/pdf.js';
import { seedCompleted, seedFailed } from './helpers/seed.js';
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

  /** A valid free-text create request; `overrides` replace or add body fields. */
  function createCv(cookie: string | undefined, overrides: object = {}, query = '') {
    return postCv(
      app,
      cookie,
      { targetRole: VALID_TARGET_ROLE, sourceText: VALID_SOURCE_TEXT, ...overrides },
      query,
    );
  }

  function getCv(cookie: string | undefined, id: string, query = '', headers = {}) {
    return getStatus(app, cookie, id, query, headers);
  }

  describe('creating and reading', () => {
    it('creates a CV owned by the authenticated user', async () => {
      const a = await registerUser(app);

      const response = await createCv(a.cookie, { targetRole: 'Backend Engineer' });

      expect(response.statusCode).toBe(202);
      const body = response.json();
      expect(Object.keys(body).sort((x, y) => x.localeCompare(y))).toEqual([
        'createdAt',
        'failureReason',
        'finishedAt',
        'id',
        'sourceType',
        'startedAt',
        'status',
        'targetRole',
        'updatedAt',
      ]);
      expect(body.targetRole).toBe('Backend Engineer');
      expect(typeof body.createdAt).toBe('string');

      const row = await prisma.cv.findUniqueOrThrow({ where: { id: body.id } });
      expect(row.userId).toBe(a.user.id);
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
      expect(notOwned.body).not.toContain(VALID_SOURCE_TEXT);
    });

    it('ignores a client-supplied userId in the body', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);

      const response = await createCv(a.cookie, { targetRole: 'Mine', userId: b.user.id });

      expect(response.statusCode).toBe(202);
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
        await Promise.all(kinds.flatMap((cookie) => [createCv(cookie), getCv(cookie, cv.id)]))
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

  describe('generation endpoints (status, result, retry, upload)', () => {
    const MISSING_ID = 'cnonexistentidxxxxxxxxxxx';

    function resultOf(cookie: string | undefined, id: string, query = '', headers = {}) {
      return app.inject({
        method: 'GET',
        url: `/api/cvs/${id}/result${query}`,
        headers: { ...(cookie ? { cookie } : {}), ...headers },
      });
    }

    function retryOf(cookie: string | undefined, id: string, query = '', headers = {}) {
      return app.inject({
        method: 'POST',
        url: `/api/cvs/${id}/retry${query}`,
        headers: { ...(cookie ? { cookie } : {}), ...headers },
      });
    }

    function uploadOf(cookie: string | undefined, fields: Record<string, string> = {}, query = '') {
      const { payload, headers } = buildMultipart(
        { targetRole: VALID_TARGET_ROLE, ...fields },
        {
          filename: 'cv.pdf',
          contentType: 'application/pdf',
          data: buildTextPdf(['Jane Doe - Backend Engineer, Acme Corp 2019-2023, Node.js APIs']),
        },
      );
      return app.inject({
        method: 'POST',
        url: `/api/cvs/upload${query}`,
        headers: { ...headers, ...(cookie ? { cookie } : {}) },
        payload,
      });
    }

    it('answers another user’s status, result and retry exactly like a CV that does not exist', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);
      const completed = (await createCv(a.cookie, { targetRole: 'Secret Role' })).json().id;
      await seedCompleted(prisma, completed);
      const failed = (await createCv(a.cookie)).json().id;
      await seedFailed(prisma, failed);
      const failedBefore = await prisma.cv.findUniqueOrThrow({ where: { id: failed } });

      const pairs = [
        [await getCv(b.cookie, completed), await getCv(b.cookie, MISSING_ID)],
        [await resultOf(b.cookie, completed), await resultOf(b.cookie, MISSING_ID)],
        [await retryOf(b.cookie, failed), await retryOf(b.cookie, MISSING_ID)],
      ] as const;

      for (const [foreign, missing] of pairs) {
        expect(foreign.statusCode).toBe(404);
        expect(foreign.json()).toMatchObject({ statusCode: 404, code: 'CV_NOT_FOUND' });
        expect(foreign.statusCode).toBe(missing.statusCode);
        expect(foreign.body).toBe(missing.body);
        expect(foreign.body).not.toContain('Secret Role');
        expect(foreign.body).not.toContain('Ada Lovelace');
      }

      // B's retry attempt changed nothing about A's CV.
      const failedAfter = await prisma.cv.findUniqueOrThrow({ where: { id: failed } });
      expect(failedAfter).toEqual(failedBefore);
    });

    it('lets the owner use all three on their own CV', async () => {
      const a = await registerUser(app);
      const completed = (await createCv(a.cookie)).json().id;
      await seedCompleted(prisma, completed);
      const failed = (await createCv(a.cookie)).json().id;
      await seedFailed(prisma, failed);

      expect((await getCv(a.cookie, completed)).statusCode).toBe(200);
      expect((await resultOf(a.cookie, completed)).statusCode).toBe(200);
      const retried = await retryOf(a.cookie, failed);
      expect(retried.statusCode).toBe(202);
      expect(retried.json().status).toBe('PENDING');
    });

    it('ignores a client-supplied userId in the form, query and headers on every operation', async () => {
      const a = await registerUser(app);
      const b = await registerUser(app);
      const completed = (await createCv(a.cookie)).json().id;
      await seedCompleted(prisma, completed);
      const failed = (await createCv(a.cookie)).json().id;
      await seedFailed(prisma, failed);
      const spoof = { 'x-user-id': a.user.id };

      // Upload: the owner stays the caller.
      const uploaded = await uploadOf(b.cookie, { userId: a.user.id }, `?userId=${a.user.id}`);
      expect(uploaded.statusCode).toBe(202);
      expect(
        (await prisma.cv.findUniqueOrThrow({ where: { id: uploaded.json().id } })).userId,
      ).toBe(b.user.id);

      // B cannot gain access by claiming to be A.
      for (const response of [
        await getCv(b.cookie, completed, `?userId=${a.user.id}`, spoof),
        await resultOf(b.cookie, completed, `?userId=${a.user.id}`, spoof),
        await retryOf(b.cookie, failed, `?userId=${a.user.id}`, spoof),
      ]) {
        expect(response.statusCode).toBe(404);
      }

      // A is not locked out by claiming to be B.
      const bId = { 'x-user-id': b.user.id };
      expect((await getCv(a.cookie, completed, `?userId=${b.user.id}`, bId)).statusCode).toBe(200);
      expect((await resultOf(a.cookie, completed, `?userId=${b.user.id}`, bId)).statusCode).toBe(
        200,
      );
      expect((await retryOf(a.cookie, failed, `?userId=${b.user.id}`, bId)).statusCode).toBe(202);
    });

    it('answers every kind of bad session with the same 401 on result, retry and upload', async () => {
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
      const before = await prisma.cv.count();

      for (const operation of [
        (cookie: string | undefined) => resultOf(cookie, cv.id),
        (cookie: string | undefined) => retryOf(cookie, cv.id),
        (cookie: string | undefined) => uploadOf(cookie),
      ]) {
        const responses = await Promise.all(kinds.map((cookie) => operation(cookie)));

        for (const response of responses) {
          expect(response.statusCode).toBe(401);
          expect(response.json()).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED' });
        }
        expect(new Set(responses.map((response) => response.body)).size).toBe(1);
      }
      expect(await prisma.cv.count()).toBe(before);
    });
  });
});
