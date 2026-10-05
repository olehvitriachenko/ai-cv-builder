import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createCvFromText } from './helpers/cvs.js';
import { sampleDraft, seedCompleted, seedFailed, seedQuestion } from './helpers/seed.js';
import { registerUser } from './helpers/users.js';

const MISSING_CV = 'cnonexistentidxxxxxxxxxxx';
const MISSING_QUESTION = 'cnonexistentquestionxxxx';

describe('CV editor ownership', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  /** One operation per new endpoint, with valid bodies so only ownership can decide the response. */
  const operations = [
    {
      name: 'save draft',
      request: (cvId: string, _q: string) => ({
        method: 'PUT' as const,
        url: `/api/cvs/${cvId}/draft`,
        payload: { revision: 0, draft: sampleDraft() },
      }),
    },
    {
      name: 'answer a question',
      request: (cvId: string, q: string) => ({
        method: 'PUT' as const,
        url: `/api/cvs/${cvId}/questions/${q}/answer`,
        payload: { answer: 'hijacked' },
      }),
    },
    {
      name: 'dismiss a question',
      request: (cvId: string, q: string) => ({ method: 'POST' as const, url: `/api/cvs/${cvId}/questions/${q}/dismiss` }),
    },
    {
      name: 'apply a question',
      request: (cvId: string, q: string) => ({
        method: 'POST' as const,
        url: `/api/cvs/${cvId}/questions/${q}/apply`,
        payload: { revision: 0 },
      }),
    },
    {
      name: 'retry',
      request: (cvId: string, _q: string) => ({ method: 'POST' as const, url: `/api/cvs/${cvId}/retry` }),
    },
    {
      name: 'delete',
      request: (cvId: string, _q: string) => ({ method: 'DELETE' as const, url: `/api/cvs/${cvId}` }),
    },
  ];

  async function setUpOwner() {
    const owner = await registerUser(app);
    const id = await createCvFromText(app, owner.cookie);
    await seedCompleted(prisma, id);
    const questionId = await seedQuestion(prisma, id, { section: 'CONTACT', field: 'CONTACT_PHONE', status: 'ANSWERED', answer: '+44 20 7946 0000' });
    return { owner, id, questionId };
  }

  type Spec = ReturnType<(typeof operations)[number]['request']>;

  function payloadOf(spec: Spec): object | undefined {
    return 'payload' in spec ? spec.payload : undefined;
  }

  function send(cookie: string | undefined, spec: Spec) {
    return app.inject({
      method: spec.method,
      url: spec.url,
      headers: cookie ? { cookie } : {},
      payload: payloadOf(spec),
    });
  }

  function operation(name: string) {
    const found = operations.find((entry) => entry.name === name);
    if (!found) {
      throw new Error(`unknown operation ${name}`);
    }
    return found;
  }

  describe.each(operations)('$name', ({ request }) => {
    it('answers another user’s CV exactly like a CV that does not exist, and changes nothing', async () => {
      const { id, questionId } = await setUpOwner();
      const intruder = await registerUser(app);
      const cvBefore = await prisma.cv.findUniqueOrThrow({ where: { id } });
      const questionBefore = await prisma.clarificationQuestion.findUniqueOrThrow({ where: { id: questionId } });

      const foreign = await send(intruder.cookie, request(id, questionId));
      const missing = await send(intruder.cookie, request(MISSING_CV, MISSING_QUESTION));

      expect(foreign.statusCode).toBe(404);
      expect(foreign.json()).toEqual({ statusCode: 404, code: 'CV_NOT_FOUND', message: 'CV not found' });
      expect(foreign.statusCode).toBe(missing.statusCode);
      expect(foreign.body).toBe(missing.body);
      expect(await prisma.cv.findUniqueOrThrow({ where: { id } })).toEqual(cvBefore);
      expect(await prisma.clarificationQuestion.findUniqueOrThrow({ where: { id: questionId } })).toEqual(questionBefore);
    });

    it('is refused without a session and with an invalid one, identically', async () => {
      const { id, questionId } = await setUpOwner();

      const spec = request(id, questionId);
      const none = await send(undefined, spec);
      const bad = await app.inject({
        method: spec.method,
        url: spec.url,
        headers: { cookie: 'sid=not-a-real-session' },
        payload: payloadOf(spec),
      });

      expect(none.statusCode).toBe(401);
      expect(bad.statusCode).toBe(401);
      expect(none.body).toBe(bad.body);
    });
  });

  it('GET /cvs never contains another user’s CV, whatever user id the request claims', async () => {
    const { owner, id } = await setUpOwner();
    const intruder = await registerUser(app);

    const response = await app.inject({
      method: 'GET',
      url: `/api/cvs?userId=${owner.user.id}`,
      headers: { cookie: intruder.cookie, 'x-user-id': owner.user.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ items: { id: string }[] }>().items.map((item) => item.id)).not.toContain(id);
    expect((await app.inject({ method: 'GET', url: '/api/cvs' })).statusCode).toBe(401);
  });

  it('ignores a userId in the body, query or headers on every operation', async () => {
    const { owner, id, questionId } = await setUpOwner();
    const intruder = await registerUser(app);

    for (const operation of operations.filter((entry) => entry.name !== 'retry' && entry.name !== 'delete')) {
      const spec = operation.request(id, questionId);
      const response = await app.inject({
        method: spec.method,
        url: `${spec.url}?userId=${owner.user.id}`,
        headers: { cookie: intruder.cookie, 'x-user-id': owner.user.id },
        payload: { ...payloadOf(spec), userId: owner.user.id },
      });

      expect(response.statusCode).toBe(404);
    }
    expect((await prisma.clarificationQuestion.findUniqueOrThrow({ where: { id: questionId } })).status).toBe('ANSWERED');
  });

  it('treats a question of another CV, even the owner’s own other CV, as QUESTION_NOT_FOUND', async () => {
    const { owner, id } = await setUpOwner();
    const otherCv = await createCvFromText(app, owner.cookie);
    await seedCompleted(prisma, otherCv);
    const otherQuestion = await seedQuestion(prisma, otherCv, { status: 'ANSWERED', answer: 'x' });

    for (const operation of operations.filter((entry) => ['answer a question', 'dismiss a question', 'apply a question'].includes(entry.name))) {
      const response = await send(owner.cookie, operation.request(id, otherQuestion));

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'QUESTION_NOT_FOUND' });
    }
    expect((await prisma.clarificationQuestion.findUniqueOrThrow({ where: { id: otherQuestion } })).status).toBe('ANSWERED');
  });

  it('lets the owner use every operation on their own CV', async () => {
    const { owner, id, questionId } = await setUpOwner();

    const save = await send(owner.cookie, operation('save draft').request(id, questionId));
    expect(save.statusCode).toBe(200);
    const another = await seedQuestion(prisma, id, { section: 'SUMMARY' });
    expect((await send(owner.cookie, operation('answer a question').request(id, another))).statusCode).toBe(200);
    expect((await send(owner.cookie, operation('dismiss a question').request(id, another))).statusCode).toBe(200);
    // The save moved the revision to 1, so the apply is based on it.
    const apply = await app.inject({
      method: 'POST',
      url: `/api/cvs/${id}/questions/${questionId}/apply`,
      headers: { cookie: owner.cookie },
      payload: { revision: save.json<{ revision: number }>().revision },
    });
    expect(apply.statusCode).toBe(200);

    const failed = await createCvFromText(app, owner.cookie);
    await seedFailed(prisma, failed);
    expect((await send(owner.cookie, operation('retry').request(failed, questionId))).statusCode).toBe(202);
    const doomed = await createCvFromText(app, owner.cookie);
    await seedCompleted(prisma, doomed);
    expect((await send(owner.cookie, operation('delete').request(doomed, questionId))).statusCode).toBe(204);
  });
});
