import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createCvFromText, getStatus } from './helpers/cvs.js';
import { seedCompleted, seedFailed, seedQuestion } from './helpers/seed.js';
import { registerUser } from './helpers/users.js';

describe('DELETE /api/cvs/:id', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  function remove(cookie: string | undefined, id: string) {
    return app.inject({
      method: 'DELETE',
      url: `/api/cvs/${id}`,
      headers: cookie ? { cookie } : {},
    });
  }

  it('deletes a COMPLETED CV together with its questions', async () => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, id);
    await seedQuestion(prisma, id, { status: 'UNANSWERED' });
    await seedQuestion(prisma, id, { status: 'ANSWERED' });
    await seedQuestion(prisma, id, { status: 'APPLIED' });
    const before = await prisma.clarificationQuestion.count({ where: { cvId: id } });

    const response = await remove(user.cookie, id);

    expect(before).toBe(3);
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(await prisma.cv.count({ where: { id } })).toBe(0);
    expect(await prisma.clarificationQuestion.count({ where: { cvId: id } })).toBe(0);
    expect((await getStatus(app, user.cookie, id)).statusCode).toBe(404);
    const list = await app.inject({ method: 'GET', url: '/api/cvs', headers: { cookie: user.cookie } });
    expect(list.json<{ items: { id: string }[] }>().items.map((item) => item.id)).not.toContain(id);
  });

  it('deletes a FAILED CV', async () => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedFailed(prisma, id);

    const response = await remove(user.cookie, id);

    expect(response.statusCode).toBe(204);
    expect(await prisma.cv.count({ where: { id } })).toBe(0);
  });

  it.each(['PENDING', 'PROCESSING'] as const)(
    'refuses to delete a %s CV and leaves it and its questions intact',
    async (status) => {
      const user = await registerUser(app);
      const id = await createCvFromText(app, user.cookie);
      await seedQuestion(prisma, id);
      if (status === 'PROCESSING') {
        await prisma.cv.update({
          where: { id },
          data: { generationStatus: 'PROCESSING', generationAttempts: 1, processingStartedAt: new Date() },
        });
      }

      const response = await remove(user.cookie, id);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ statusCode: 409, code: 'CV_GENERATION_ACTIVE' });
      const row = await prisma.cv.findUnique({ where: { id }, select: { generationStatus: true } });
      expect(row?.generationStatus).toBe(status);
      expect(await prisma.clarificationQuestion.count({ where: { cvId: id } })).toBe(1);
    },
  );

  it("answers another user's CV exactly like a missing one and deletes nothing", async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const id = await createCvFromText(app, owner.cookie);
    await seedCompleted(prisma, id);

    const foreign = await remove(other.cookie, id);
    const missing = await remove(other.cookie, 'cnonexistentidxxxxxxxxxxx');

    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({ statusCode: 404, code: 'CV_NOT_FOUND', message: 'CV not found' });
    expect(foreign.body).toBe(missing.body);
    expect(foreign.statusCode).toBe(missing.statusCode);
    expect(await prisma.cv.count({ where: { id } })).toBe(1);
  });

  it('is refused without a session', async () => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, id);

    const response = await remove(undefined, id);

    expect(response.statusCode).toBe(401);
    expect(await prisma.cv.count({ where: { id } })).toBe(1);
  });

  it('answers 404 on a second delete of the same CV', async () => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, id);

    expect((await remove(user.cookie, id)).statusCode).toBe(204);
    expect((await remove(user.cookie, id)).statusCode).toBe(404);
  });

  it('stays consistent when a delete races a retry of the same FAILED CV', async () => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedFailed(prisma, id);

    const [deleted, retried] = await Promise.all([
      remove(user.cookie, id),
      app.inject({ method: 'POST', url: `/api/cvs/${id}/retry`, headers: { cookie: user.cookie } }),
    ]);

    const row = await prisma.cv.findUnique({ where: { id }, select: { generationStatus: true } });
    if (deleted.statusCode === 204) {
      expect(row).toBeNull();
      expect([404, 409]).toContain(retried.statusCode);
    } else {
      expect(deleted.statusCode).toBe(409);
      expect(retried.statusCode).toBe(202);
      expect(row?.generationStatus).toBe('PENDING');
    }
  });
});
