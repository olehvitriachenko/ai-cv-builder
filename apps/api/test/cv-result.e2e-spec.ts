import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createCvFromText } from './helpers/cvs.js';
import { sampleDraft, seedCompleted, seedFailed, seedProcessing } from './helpers/seed.js';
import { registerUser } from './helpers/users.js';

describe('GET /api/cvs/:id/result', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  function getResult(cookie: string, id: string) {
    return app.inject({ method: 'GET', url: `/api/cvs/${id}/result`, headers: { cookie } });
  }

  it('returns the draft with its questions ordered by position', async () => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, id);
    await prisma.clarificationQuestion.createMany({
      data: [
        {
          cvId: id,
          section: 'EXPERIENCE',
          itemId: 'exp-1',
          missing: 'Team size',
          question: 'How big was the team?',
          position: 1,
        },
        {
          cvId: id,
          section: 'CONTACT',
          itemId: null,
          missing: 'Phone',
          question: 'What is your phone number?',
          position: 0,
        },
      ],
    });

    const response = await getResult(user.cookie, id);

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ id, status: 'COMPLETED', draft: sampleDraft() });
    expect(body.questions).toHaveLength(2);
    expect(body.questions.map((q: { section: string }) => q.section)).toEqual([
      'CONTACT',
      'EXPERIENCE',
    ]);
    expect(body.questions[1]).toMatchObject({
      section: 'EXPERIENCE',
      itemId: 'exp-1',
      missing: 'Team size',
      question: 'How big was the team?',
      status: 'OPEN',
    });
    expect(typeof body.questions[0].id).toBe('string');
    expect(Object.keys(body.questions[0]).sort((a, b) => a.localeCompare(b))).toEqual([
      'id',
      'itemId',
      'missing',
      'question',
      'section',
      'status',
    ]);
  });

  it('returns an empty question list for a completed CV with no questions', async () => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, id);

    const response = await getResult(user.cookie, id);

    expect(response.statusCode).toBe(200);
    expect(response.json().questions).toEqual([]);
  });

  it('never exposes the source, user id or internal fields', async () => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, id);

    const body = (await getResult(user.cookie, id)).body;

    for (const leaked of ['sourceText', 'userId', 'failureDetail', 'promptVersion', 'aiModel']) {
      expect(body).not.toContain(leaked);
    }
  });

  it.each([
    ['PENDING', async () => undefined],
    ['PROCESSING', (prisma: PrismaService, id: string) => seedProcessing(prisma, id)],
    ['FAILED', (prisma: PrismaService, id: string) => seedFailed(prisma, id)],
  ])('answers 409 GENERATION_NOT_READY for a %s CV, with no draft', async (_status, seed) => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seed(prisma, id);

    const response = await getResult(user.cookie, id);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ statusCode: 409, code: 'GENERATION_NOT_READY' });
    expect(response.body).not.toContain('draft');
  });

  it('answers a generic 500 (and echoes nothing) when the stored JSON is no longer a valid draft', async () => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, id, { schemaVersion: 1, contact: 'Secret stored content' });

    const response = await getResult(user.cookie, id);

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(response.body).not.toContain('Secret stored content');
  });

  it('rejects a malformed id with 400', async () => {
    const user = await registerUser(app);

    const response = await getResult(user.cookie, 'not-an-id');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('is identical when fetched twice (reload-safe)', async () => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, id);

    const first = await getResult(user.cookie, id);
    const second = await getResult(user.cookie, id);

    expect(second.statusCode).toBe(200);
    expect(second.body).toBe(first.body);
  });
});
