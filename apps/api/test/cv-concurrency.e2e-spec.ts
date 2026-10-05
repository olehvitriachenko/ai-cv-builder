import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import type { CvDraft } from '../src/modules/cv/generation/draft.schema.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createCvFromText } from './helpers/cvs.js';
import { sampleDraft, seedCompleted, seedQuestion } from './helpers/seed.js';
import { registerUser } from './helpers/users.js';

function draftWithoutEmail(): CvDraft {
  const draft = sampleDraft();
  draft.contact.email = null;
  return draft;
}

describe('stale and failed writes never destroy work', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function setUp() {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, id, draftWithoutEmail());
    return { user, id };
  }

  function apply(cookie: string, cvId: string, questionId: string, revision: number) {
    return app.inject({
      method: 'POST',
      url: `/api/cvs/${cvId}/questions/${questionId}/apply`,
      headers: { cookie },
      payload: { revision },
    });
  }

  it('rolls the draft change back when a failure happens between the two writes of an apply', async () => {
    const { user, id } = await setUp();
    const questionId = await seedQuestion(prisma, id, {
      section: 'CONTACT',
      field: 'CONTACT_EMAIL',
      status: 'ANSWERED',
      answer: 'ada@example.com',
    });
    // A real failure inside the transaction: the draft UPDATE has already run when the question
    // UPDATE to APPLIED raises. Trigger names embed the (cuid) id, so parallel tests never clash.
    const fn = `fail_apply_${questionId}`;
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION "${fn}"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced failure between the two writes'; END; $$ LANGUAGE plpgsql`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER "${fn}" BEFORE UPDATE ON "ClarificationQuestion" FOR EACH ROW WHEN (NEW.id = '${questionId}' AND NEW.status = 'APPLIED') EXECUTE FUNCTION "${fn}"()`,
    );

    try {
      const response = await apply(user.cookie, id, questionId, 0);

      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain('forced failure');
      const cv = await prisma.cv.findUniqueOrThrow({ where: { id }, select: { draft: true, revision: true } });
      const question = await prisma.clarificationQuestion.findUniqueOrThrow({ where: { id: questionId } });
      expect(cv.revision).toBe(0);
      expect(cv.draft).toEqual(draftWithoutEmail());
      expect(question.status).toBe('ANSWERED');
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER "${fn}" ON "ClarificationQuestion"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION "${fn}"()`);
    }

    // Nothing was left half done: the same apply now succeeds as one unit.
    const retry = await apply(user.cookie, id, questionId, 0);
    expect(retry.statusCode).toBe(200);
    const cv = await prisma.cv.findUniqueOrThrow({ where: { id }, select: { revision: true } });
    expect(cv.revision).toBe(1);
  });

  it('lets exactly one win when a manual save and an apply start on the same revision', async () => {
    const { user, id } = await setUp();
    const questionId = await seedQuestion(prisma, id, {
      section: 'CONTACT',
      field: 'CONTACT_EMAIL',
      status: 'ANSWERED',
      answer: 'ada@example.com',
    });
    const edited = draftWithoutEmail();
    edited.summary = 'Typed at the same moment';

    const [applied, saved] = await Promise.all([
      apply(user.cookie, id, questionId, 0),
      app.inject({
        method: 'PUT',
        url: `/api/cvs/${id}/draft`,
        headers: { cookie: user.cookie },
        payload: { revision: 0, draft: edited },
      }),
    ]);

    expect([applied.statusCode, saved.statusCode].sort((x, y) => x - y)).toEqual([200, 409]);
    const cv = await prisma.cv.findUniqueOrThrow({ where: { id }, select: { revision: true, draft: true } });
    expect(cv.revision).toBe(1);
    const question = await prisma.clarificationQuestion.findUniqueOrThrow({ where: { id: questionId } });
    // The question is APPLIED exactly when the apply won, and then the email is in the draft.
    expect(question.status).toBe(applied.statusCode === 200 ? 'APPLIED' : 'ANSWERED');
    expect(JSON.stringify(cv.draft).includes('ada@example.com')).toBe(applied.statusCode === 200);
  });

  it('never loses a newer manual edit to a stale save, even after several saves', async () => {
    const { user, id } = await setUp();
    const save = (revision: number, summary: string) =>
      app.inject({
        method: 'PUT',
        url: `/api/cvs/${id}/draft`,
        headers: { cookie: user.cookie },
        payload: { revision, draft: { ...draftWithoutEmail(), summary } },
      });

    expect((await save(0, 'one')).statusCode).toBe(200);
    expect((await save(1, 'two')).statusCode).toBe(200);
    const stale = await save(0, 'stale from an old tab');
    const alsoStale = await save(1, 'stale again');

    expect(stale.statusCode).toBe(409);
    expect(alsoStale.statusCode).toBe(409);
    const cv = await prisma.cv.findUniqueOrThrow({ where: { id }, select: { revision: true, draft: true } });
    expect(cv.revision).toBe(2);
    expect(JSON.stringify(cv.draft)).toContain('"two"');
  });

  it('answering and dismissing never make a pending manual save stale', async () => {
    const { user, id } = await setUp();
    const q1 = await seedQuestion(prisma, id, { section: 'SKILLS' });
    const q2 = await seedQuestion(prisma, id, { section: 'SKILLS' });

    await app.inject({ method: 'PUT', url: `/api/cvs/${id}/questions/${q1}/answer`, headers: { cookie: user.cookie }, payload: { answer: 'Go' } });
    await app.inject({ method: 'POST', url: `/api/cvs/${id}/questions/${q2}/dismiss`, headers: { cookie: user.cookie } });
    const save = await app.inject({
      method: 'PUT',
      url: `/api/cvs/${id}/draft`,
      headers: { cookie: user.cookie },
      payload: { revision: 0, draft: draftWithoutEmail() },
    });

    expect(save.statusCode).toBe(200);
  });
});
