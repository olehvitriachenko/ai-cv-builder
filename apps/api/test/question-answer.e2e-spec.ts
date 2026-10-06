import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createCvFromText } from './helpers/cvs.js';
import { sampleDraft, seedCompleted, seedFailed, seedQuestion } from './helpers/seed.js';
import { registerUser } from './helpers/users.js';

interface QuestionBody {
  id: string;
  section: string;
  itemId: string | null;
  missing: string;
  question: string;
  status: string;
  answer: string | null;
}

describe('answering and dismissing clarification questions', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function completedCv() {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, id);
    return { user, id };
  }

  function answer(cookie: string | undefined, cvId: string, questionId: string, body: object) {
    return app.inject({
      method: 'PUT',
      url: `/api/cvs/${cvId}/questions/${questionId}/answer`,
      headers: cookie ? { cookie } : {},
      payload: body,
    });
  }

  function dismiss(cookie: string | undefined, cvId: string, questionId: string) {
    return app.inject({
      method: 'POST',
      url: `/api/cvs/${cvId}/questions/${questionId}/dismiss`,
      headers: cookie ? { cookie } : {},
    });
  }

  async function cvRow(id: string) {
    return prisma.cv.findUniqueOrThrow({ where: { id }, select: { draft: true, revision: true, updatedAt: true } });
  }

  describe('answer', () => {
    it('saves the answer, marks the question ANSWERED and leaves the CV content and revision alone', async () => {
      const { user, id } = await completedCv();
      const questionId = await seedQuestion(prisma, id, { section: 'CONTACT', question: 'Your phone?' });
      const before = await cvRow(id);

      const response = await answer(user.cookie, id, questionId, { answer: '  +44 20 7946 0000  ' });

      expect(response.statusCode).toBe(200);
      const body = response.json<QuestionBody>();
      expect(body).toMatchObject({
        id: questionId,
        section: 'CONTACT',
        question: 'Your phone?',
        status: 'ANSWERED',
        answer: '+44 20 7946 0000',
      });
      expect(Object.keys(body).sort((x, y) => x.localeCompare(y))).toEqual([
        'answer',
        'field',
        'id',
        'itemId',
        'missing',
        'question',
        'section',
        'status',
      ]);
      const after = await cvRow(id);
      expect(after.draft).toEqual(before.draft);
      expect(after.revision).toBe(before.revision);
      expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    });

    it('moves the CV updatedAt (list order) but not its revision', async () => {
      const { user, id } = await completedCv();
      const questionId = await seedQuestion(prisma, id);
      const before = await cvRow(id);
      await new Promise((resolve) => setTimeout(resolve, 15));

      await answer(user.cookie, id, questionId, { answer: 'something' });

      const after = await cvRow(id);
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
      expect(after.revision).toBe(0);
    });

    it('replaces the answer while the question is ANSWERED', async () => {
      const { user, id } = await completedCv();
      const questionId = await seedQuestion(prisma, id);

      await answer(user.cookie, id, questionId, { answer: 'first' });
      const second = await answer(user.cookie, id, questionId, { answer: 'second' });

      expect(second.statusCode).toBe(200);
      expect(second.json<QuestionBody>()).toMatchObject({ status: 'ANSWERED', answer: 'second' });
    });

    it('does not conflict with the editor: an edit followed by an answer needs no revision', async () => {
      const { user, id } = await completedCv();
      const questionId = await seedQuestion(prisma, id);
      const save = await app.inject({
        method: 'PUT',
        url: `/api/cvs/${id}/draft`,
        headers: { cookie: user.cookie },
        payload: { revision: 0, draft: sampleDraft() },
      });
      expect(save.statusCode).toBe(200);

      const response = await answer(user.cookie, id, questionId, { answer: 'still fine' });

      expect(response.statusCode).toBe(200);
      expect((await cvRow(id)).revision).toBe(1);
    });

    it.each([
      ['blank', '   '],
      ['empty', ''],
      ['over-long', 'x'.repeat(1001)],
    ])('rejects a %s answer with a field error and stores nothing', async (_label, text) => {
      const { user, id } = await completedCv();
      const questionId = await seedQuestion(prisma, id);

      const response = await answer(user.cookie, id, questionId, { answer: text });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR', fieldErrors: { answer: expect.any(Array) } });
      const row = await prisma.clarificationQuestion.findUniqueOrThrow({ where: { id: questionId } });
      expect(row).toMatchObject({ status: 'UNANSWERED', answer: null });
    });

    it.each(['APPLIED', 'DISMISSED'] as const)('refuses to answer an %s question', async (status) => {
      const { user, id } = await completedCv();
      const questionId = await seedQuestion(prisma, id, { status, answer: 'kept' });

      const response = await answer(user.cookie, id, questionId, { answer: 'changed' });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'QUESTION_STATE_CONFLICT' });
      const row = await prisma.clarificationQuestion.findUniqueOrThrow({ where: { id: questionId } });
      expect(row).toMatchObject({ status, answer: 'kept' });
    });

    it('refuses when the CV is not COMPLETED', async () => {
      const user = await registerUser(app);
      const id = await createCvFromText(app, user.cookie);
      await seedFailed(prisma, id);
      const questionId = await seedQuestion(prisma, id);

      const response = await answer(user.cookie, id, questionId, { answer: 'x' });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'CV_NOT_EDITABLE' });
    });

    it('answers 404 QUESTION_NOT_FOUND for a question of another CV of the same user', async () => {
      const { user, id } = await completedCv();
      const otherId = await createCvFromText(app, user.cookie);
      await seedCompleted(prisma, otherId);
      const foreignQuestion = await seedQuestion(prisma, otherId);

      const response = await answer(user.cookie, id, foreignQuestion, { answer: 'x' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'QUESTION_NOT_FOUND' });
      const row = await prisma.clarificationQuestion.findUniqueOrThrow({ where: { id: foreignQuestion } });
      expect(row.status).toBe('UNANSWERED');
    });

    it('ignores a client-supplied status or userId in the body', async () => {
      const { user, id } = await completedCv();
      const questionId = await seedQuestion(prisma, id);

      const response = await answer(user.cookie, id, questionId, { answer: 'a', status: 'APPLIED', userId: 'x' });

      expect(response.statusCode).toBe(200);
      expect(response.json<QuestionBody>().status).toBe('ANSWERED');
    });

    it('is refused without a session', async () => {
      const { id } = await completedCv();
      const questionId = await seedQuestion(prisma, id);

      expect((await answer(undefined, id, questionId, { answer: 'x' })).statusCode).toBe(401);
    });
  });

  describe('dismiss', () => {
    it.each(['UNANSWERED', 'ANSWERED'] as const)(
      'dismisses an %s question without touching the CV content or revision',
      async (status) => {
        const { user, id } = await completedCv();
        const questionId = await seedQuestion(prisma, id, { status });
        const before = await cvRow(id);

        const response = await dismiss(user.cookie, id, questionId);

        expect(response.statusCode).toBe(200);
        expect(response.json<QuestionBody>()).toMatchObject({
          id: questionId,
          status: 'DISMISSED',
          answer: status === 'ANSWERED' ? 'seeded answer' : null,
        });
        const after = await cvRow(id);
        expect(after.draft).toEqual(before.draft);
        expect(after.revision).toBe(before.revision);
      },
    );

    it('removes the question from the unresolved count and completes a CV whose last one it was', async () => {
      const { user, id } = await completedCv();
      const only = await seedQuestion(prisma, id, { status: 'ANSWERED' });
      const listBefore = await app.inject({ method: 'GET', url: '/api/cvs', headers: { cookie: user.cookie } });
      expect(listBefore.json<{ items: { id: string; displayStatus: string; openQuestionsCount: number }[] }>().items[0])
        .toMatchObject({ id, displayStatus: 'DRAFT', openQuestionsCount: 1 });

      await dismiss(user.cookie, id, only);

      const listAfter = await app.inject({ method: 'GET', url: '/api/cvs', headers: { cookie: user.cookie } });
      expect(listAfter.json<{ items: { id: string; displayStatus: string; openQuestionsCount: number }[] }>().items[0])
        .toMatchObject({ id, displayStatus: 'COMPLETED', openQuestionsCount: 0 });
    });

    it('persists: a dismissed question stays dismissed in the result', async () => {
      const { user, id } = await completedCv();
      const questionId = await seedQuestion(prisma, id);

      await dismiss(user.cookie, id, questionId);

      const result = await app.inject({ method: 'GET', url: `/api/cvs/${id}/result`, headers: { cookie: user.cookie } });
      expect(result.json<{ questions: QuestionBody[] }>().questions[0]).toMatchObject({ status: 'DISMISSED' });
    });

    it.each(['APPLIED', 'DISMISSED'] as const)('refuses to dismiss an %s question', async (status) => {
      const { user, id } = await completedCv();
      const questionId = await seedQuestion(prisma, id, { status });

      const response = await dismiss(user.cookie, id, questionId);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'QUESTION_STATE_CONFLICT' });
    });

    it('never dismisses automatically: filling the target by hand leaves the question as it was', async () => {
      const { user, id } = await completedCv();
      const questionId = await seedQuestion(prisma, id, { section: 'CONTACT', status: 'ANSWERED' });
      const draft = sampleDraft();
      draft.contact.phone = '+44 1';

      await app.inject({
        method: 'PUT',
        url: `/api/cvs/${id}/draft`,
        headers: { cookie: user.cookie },
        payload: { revision: 0, draft },
      });

      const row = await prisma.clarificationQuestion.findUniqueOrThrow({ where: { id: questionId } });
      expect(row.status).toBe('ANSWERED');
    });

    it('refuses when the CV is not COMPLETED and for a question of another CV', async () => {
      const user = await registerUser(app);
      const failed = await createCvFromText(app, user.cookie);
      await seedFailed(prisma, failed);
      const failedQuestion = await seedQuestion(prisma, failed);
      const { id } = await (async () => {
        const id = await createCvFromText(app, user.cookie);
        await seedCompleted(prisma, id);
        return { id };
      })();

      const notEditable = await dismiss(user.cookie, failed, failedQuestion);
      const wrongCv = await dismiss(user.cookie, id, failedQuestion);

      expect(notEditable.statusCode).toBe(409);
      expect(notEditable.json()).toMatchObject({ code: 'CV_NOT_EDITABLE' });
      expect(wrongCv.statusCode).toBe(404);
      expect(wrongCv.json()).toMatchObject({ code: 'QUESTION_NOT_FOUND' });
    });

    it('is refused without a session', async () => {
      const { id } = await completedCv();
      const questionId = await seedQuestion(prisma, id);

      expect((await dismiss(undefined, id, questionId)).statusCode).toBe(401);
    });
  });
});
