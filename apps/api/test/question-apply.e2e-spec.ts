import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { ProviderError } from '../src/modules/ai/cv-generator.js';
import type { CvDraft } from '../src/modules/cv/generation/draft.schema.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createCvFromText } from './helpers/cvs.js';
import { FakeCvAnswerApplier } from './helpers/fake-answer-applier.js';
import { sampleDraft, seedCompleted, seedFailed, seedQuestion } from './helpers/seed.js';
import { registerUser } from './helpers/users.js';

interface ApplyBody {
  revision: number;
  draft: CvDraft;
  questions: { id: string; status: string; answer: string | null }[];
}

function sparseDraft(): CvDraft {
  const draft = sampleDraft();
  draft.contact = { fullName: 'Ada Lovelace', email: null, phone: null, location: null, links: [] };
  draft.summary = null;
  draft.experience = [
    { id: 'exp-1', employer: 'Acme Corp', title: 'Engineer', location: null, startDate: '2016', endDate: null, bullets: ['Built REST APIs'] },
    { id: 'exp-2', employer: 'Globex', title: 'Analyst', location: null, startDate: null, endDate: null, bullets: [] },
  ];
  return draft;
}

describe('POST /api/cvs/:id/questions/:questionId/apply', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  const applier = new FakeCvAnswerApplier();

  beforeAll(async () => {
    app = await createTestApp({ answerApplier: applier });
    prisma = app.get(PrismaService);
  });

  beforeEach(() => applier.reset());

  afterAll(async () => {
    await app.close();
  });

  async function setUp(draft: CvDraft = sparseDraft()) {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, id, draft);
    return { user, id };
  }

  function apply(cookie: string | undefined, cvId: string, questionId: string, body: object) {
    return app.inject({
      method: 'POST',
      url: `/api/cvs/${cvId}/questions/${questionId}/apply`,
      headers: cookie ? { cookie } : {},
      payload: body,
    });
  }

  async function snapshot(cvId: string, questionId: string) {
    const cv = await prisma.cv.findUniqueOrThrow({ where: { id: cvId }, select: { draft: true, revision: true } });
    const question = await prisma.clarificationQuestion.findUniqueOrThrow({ where: { id: questionId } });
    return { draft: cv.draft, revision: cv.revision, status: question.status };
  }

  const expPatch = (overrides: object = {}) => ({
    employer: null,
    title: null,
    location: null,
    startDate: null,
    endDate: null,
    bullets: [],
    ...overrides,
  });

  describe('deterministic path (the question has a field)', () => {
    it('fills only the targeted value, marks the question APPLIED and makes no AI call', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, {
        section: 'EXPERIENCE',
        itemId: 'exp-1',
        field: 'EXPERIENCE_END_DATE',
        status: 'ANSWERED',
        answer: '  2023  ',
      });

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.statusCode).toBe(200);
      const body = response.json<ApplyBody>();
      expect(body.revision).toBe(1);
      expect(body.draft.experience[0]?.endDate).toBe('2023');
      expect(body.draft.experience[1]).toEqual(sparseDraft().experience[1]);
      expect(body.draft.contact).toEqual(sparseDraft().contact);
      expect(body.questions.find((question) => question.id === questionId)?.status).toBe('APPLIED');
      expect(applier.calls).toHaveLength(0);
      expect(await snapshot(id, questionId)).toMatchObject({ status: 'APPLIED', revision: 1 });
    });

    it('keeps the user’s other manual edits untouched', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'CONTACT', field: 'CONTACT_EMAIL', status: 'ANSWERED', answer: 'ada@example.com' });
      const edited = sparseDraft();
      edited.summary = 'Hand-written summary';
      const entry = edited.experience[1];
      if (entry) {
        entry.bullets = ['Typed by me'];
      }
      const save = await app.inject({
        method: 'PUT',
        url: `/api/cvs/${id}/draft`,
        headers: { cookie: user.cookie },
        payload: { revision: 0, draft: edited },
      });
      expect(save.statusCode).toBe(200);

      const response = await apply(user.cookie, id, questionId, { revision: 1 });

      const body = response.json<ApplyBody>();
      expect(body.draft.contact.email).toBe('ada@example.com');
      expect(body.draft.summary).toBe('Hand-written summary');
      expect(body.draft.experience[1]?.bullets).toEqual(['Typed by me']);
    });

    it('refuses with TARGET_NOT_APPLICABLE when the value was filled by hand, then the question can be dismissed', async () => {
      const filled = sparseDraft();
      filled.contact.email = 'typed@example.com';
      const { user, id } = await setUp(filled);
      const questionId = await seedQuestion(prisma, id, { section: 'CONTACT', field: 'CONTACT_EMAIL', status: 'ANSWERED', answer: 'ada@example.com' });
      const before = await snapshot(id, questionId);

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'TARGET_NOT_APPLICABLE' });
      expect(await snapshot(id, questionId)).toEqual(before);
      const dismissed = await app.inject({
        method: 'POST',
        url: `/api/cvs/${id}/questions/${questionId}/dismiss`,
        headers: { cookie: user.cookie },
      });
      expect(dismissed.statusCode).toBe(200);
      expect((await snapshot(id, questionId)).status).toBe('DISMISSED');
    });

    it('refuses with TARGET_NOT_APPLICABLE when the entry was removed', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'EXPERIENCE', itemId: 'removed-entry', field: 'EXPERIENCE_END_DATE', status: 'ANSWERED' });

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'TARGET_NOT_APPLICABLE' });
    });

    it('answers 422 when the answer does not fit the field, changing nothing', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'CONTACT', field: 'CONTACT_EMAIL', status: 'ANSWERED', answer: 'call me maybe' });
      const before = await snapshot(id, questionId);

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ code: 'ANSWER_INVALID_FOR_FIELD' });
      expect(await snapshot(id, questionId)).toEqual(before);
    });

    it('still works while the AI provider is down', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'CONTACT', field: 'CONTACT_LOCATION', status: 'ANSWERED', answer: 'London' });
      applier.enqueueError(new ProviderError('NOT_CONFIGURED'));

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.statusCode).toBe(200);
      expect(applier.calls).toHaveLength(0);
    });
  });

  describe('state, revision and validation', () => {
    it.each(['UNANSWERED', 'APPLIED', 'DISMISSED'] as const)('refuses a %s question with QUESTION_STATE_CONFLICT', async (status) => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'CONTACT', field: 'CONTACT_LOCATION', status, answer: status === 'UNANSWERED' ? null : 'London' });
      const before = await snapshot(id, questionId);

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'QUESTION_STATE_CONFLICT' });
      expect(await snapshot(id, questionId)).toEqual(before);
    });

    it('rejects a stale revision before doing any work', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'SKILLS', status: 'ANSWERED', answer: 'Go' });
      await app.inject({
        method: 'PUT',
        url: `/api/cvs/${id}/draft`,
        headers: { cookie: user.cookie },
        payload: { revision: 0, draft: sparseDraft() },
      });
      applier.enqueueOutput({ skills: ['Go'] });

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'REVISION_CONFLICT' });
      expect(applier.calls).toHaveLength(0);
      expect((await snapshot(id, questionId)).status).toBe('ANSWERED');
    });

    it('refuses when the CV is not COMPLETED', async () => {
      const user = await registerUser(app);
      const id = await createCvFromText(app, user.cookie);
      await seedFailed(prisma, id);
      const questionId = await seedQuestion(prisma, id, { status: 'ANSWERED', answer: 'x' });

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'CV_NOT_EDITABLE' });
    });

    it('rejects a missing or malformed revision with a field error', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { status: 'ANSWERED', answer: 'x' });

      for (const body of [{}, { revision: -1 }, { revision: 'one' }]) {
        const response = await apply(user.cookie, id, questionId, body);
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR', fieldErrors: { revision: expect.any(Array) } });
      }
    });

    it('answers 404 QUESTION_NOT_FOUND for a question of another CV', async () => {
      const { user, id } = await setUp();
      const other = await createCvFromText(app, user.cookie);
      await seedCompleted(prisma, other, sparseDraft());
      const foreign = await seedQuestion(prisma, other, { status: 'ANSWERED', answer: 'x' });

      const response = await apply(user.cookie, id, foreign, { revision: 0 });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'QUESTION_NOT_FOUND' });
    });

    it('is refused without a session', async () => {
      const { id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { status: 'ANSWERED', answer: 'x' });

      expect((await apply(undefined, id, questionId, { revision: 0 })).statusCode).toBe(401);
    });
  });

  describe('AI path (the question has no field)', () => {
    it('sends only the targeted entry, the question, the answer and the target role, then applies the patch', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, {
        section: 'EXPERIENCE',
        itemId: 'exp-1',
        status: 'ANSWERED',
        answer: 'I mentored two junior engineers through code reviews',
        question: 'What did mentoring involve?',
      });
      applier.enqueueOutput(expPatch({ bullets: ['Mentored two junior engineers through code reviews'] }));

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.statusCode).toBe(200);
      const body = response.json<ApplyBody>();
      expect(body.draft.experience[0]?.bullets).toEqual(['Built REST APIs', 'Mentored two junior engineers through code reviews']);
      expect(body.draft.experience[1]).toEqual(sparseDraft().experience[1]);
      expect(body.revision).toBe(1);
      expect(applier.calls).toHaveLength(1);
      const sent = applier.calls[0];
      expect(sent?.scope).toEqual({
        section: 'EXPERIENCE',
        entry: { employer: 'Acme Corp', title: 'Engineer', location: null, startDate: '2016', endDate: null, bullets: ['Built REST APIs'] },
      });
      expect(sent).toMatchObject({ question: 'What did mentoring involve?', answer: 'I mentored two junior engineers through code reviews', targetRole: 'Backend Engineer' });
      const serialized = JSON.stringify(sent);
      expect(serialized).not.toContain('exp-1');
      expect(serialized).not.toContain('Globex');
      expect(serialized).not.toContain('Ada Lovelace');
      expect((await snapshot(id, questionId)).status).toBe('APPLIED');
    });

    it('applies a skills answer by appending, never replacing', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'SKILLS', status: 'ANSWERED', answer: 'Go and Rust' });
      applier.enqueueOutput({ skills: ['Go', 'Rust', 'node.js'] });

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.json<ApplyBody>().draft.skills).toEqual(['Node.js', 'Go', 'Rust']);
      expect(applier.calls[0]?.scope).toEqual({ section: 'SKILLS', skills: ['Node.js'] });
    });

    it('writes a summary only into an empty summary; a present one is TARGET_NOT_APPLICABLE and the AI is not called', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'SUMMARY', status: 'ANSWERED', answer: 'APIs for fintech' });
      applier.enqueueOutput({ summary: 'Backend engineer focused on APIs for fintech.' });

      const ok = await apply(user.cookie, id, questionId, { revision: 0 });
      expect(ok.json<ApplyBody>().draft.summary).toBe('Backend engineer focused on APIs for fintech.');
      expect(applier.calls[0]?.scope).toEqual({ section: 'SUMMARY' });

      const second = await setUp({ ...sparseDraft(), summary: 'My own summary' });
      const secondQuestion = await seedQuestion(prisma, second.id, { section: 'SUMMARY', status: 'ANSWERED', answer: 'x' });
      applier.reset();
      const refused = await apply(second.user.cookie, second.id, secondQuestion, { revision: 0 });

      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({ code: 'TARGET_NOT_APPLICABLE' });
      expect(applier.calls).toHaveLength(0);
    });

    it('retries once with rule-id feedback after invalid output, then applies', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'SKILLS', status: 'ANSWERED', answer: 'Go' });
      applier.enqueueOutput({ wrong: 'shape' });
      applier.enqueueOutput({ skills: ['Go'] });

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.statusCode).toBe(200);
      expect(applier.calls).toHaveLength(2);
      expect(applier.calls[0]?.feedback).toBeUndefined();
      expect(applier.calls[1]?.feedback?.length).toBeGreaterThan(0);
      expect(JSON.stringify(applier.calls[1]?.feedback)).not.toContain('Go');
    });

    it.each([
      ['malformed output', null],
      ['wrong types', { skills: 'Go' }],
      ['an unknown key (a path)', { skills: ['Go'], path: 'draft.contact.email' }],
      ['an empty patch (nothing would change)', { skills: [] }],
    ])('answers 422 for %s after the retry and changes nothing', async (_label, output) => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'SKILLS', status: 'ANSWERED', answer: 'Go' });
      applier.enqueueOutput(output).enqueueOutput(output);
      const before = await snapshot(id, questionId);

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ code: 'APPLY_OUTPUT_INVALID' });
      expect(applier.calls).toHaveLength(2);
      expect(await snapshot(id, questionId)).toEqual(before);
    });

    it('rejects an unsupported contact fact, an invented employer and an overwrite, changing nothing', async () => {
      const { user, id } = await setUp();
      const contactQuestion = await seedQuestion(prisma, id, { section: 'CONTACT', status: 'ANSWERED', answer: 'my email is ada@example.com' });
      const employerQuestion = await seedQuestion(prisma, id, { section: 'EXPERIENCE', itemId: 'exp-2', status: 'ANSWERED', answer: 'worked at Globex' });
      const before = await snapshot(id, contactQuestion);

      const contactPatch = { fullName: null, email: 'other@invented.test', phone: null, location: null, links: [] };
      applier.enqueueOutput(contactPatch).enqueueOutput(contactPatch);
      const unsupported = await apply(user.cookie, id, contactQuestion, { revision: 0 });
      const overwrite = expPatch({ title: 'Director' });
      applier.enqueueOutput(overwrite).enqueueOutput(overwrite);
      const overwritten = await apply(user.cookie, id, employerQuestion, { revision: 0 });

      expect(unsupported.statusCode).toBe(422);
      expect(overwritten.statusCode).toBe(422);
      expect(await snapshot(id, contactQuestion)).toEqual(before);
      expect(await snapshot(id, employerQuestion)).toMatchObject({ revision: 0, status: 'ANSWERED' });
    });

    it('retries a transient provider error once, then reports AI_UNAVAILABLE', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'SKILLS', status: 'ANSWERED', answer: 'Go' });
      applier.enqueueError(new ProviderError('TRANSIENT', '503')).enqueueError(new ProviderError('TRANSIENT', '503'));
      const before = await snapshot(id, questionId);

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'AI_UNAVAILABLE' });
      expect(applier.calls).toHaveLength(2);
      expect(await snapshot(id, questionId)).toEqual(before);
    });

    it('recovers when the transient error clears on the second attempt', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'SKILLS', status: 'ANSWERED', answer: 'Go' });
      applier.enqueueError(new ProviderError('TRANSIENT', '503')).enqueueOutput({ skills: ['Go'] });

      expect((await apply(user.cookie, id, questionId, { revision: 0 })).statusCode).toBe(200);
    });

    it.each(['NOT_CONFIGURED', 'BAD_REQUEST'] as const)('answers AI_UNAVAILABLE for %s without retrying and leaks no provider text', async (kind) => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'SKILLS', status: 'ANSWERED', answer: 'Go' });
      applier.enqueueError(new ProviderError(kind, 'secret-provider-detail'));

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'AI_UNAVAILABLE' });
      expect(response.body).not.toContain('secret-provider-detail');
      expect(applier.calls).toHaveLength(1);
    });

    it('answers 422 when the model refuses', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'SKILLS', status: 'ANSWERED', answer: 'Go' });
      applier.enqueueError(new ProviderError('REFUSED'));

      const response = await apply(user.cookie, id, questionId, { revision: 0 });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ code: 'APPLY_OUTPUT_INVALID' });
    });

    it('rejects the apply when the CV changed while the AI was working, storing nothing', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'SKILLS', status: 'ANSWERED', answer: 'Go' });
      const hold = applier.enqueueHold();

      const pending = apply(user.cookie, id, questionId, { revision: 0 });
      await hold.started;
      const edit = await app.inject({
        method: 'PUT',
        url: `/api/cvs/${id}/draft`,
        headers: { cookie: user.cookie },
        payload: { revision: 0, draft: { ...sparseDraft(), summary: 'Edited meanwhile' } },
      });
      expect(edit.statusCode).toBe(200);
      hold.release({ skills: ['Go'] });
      const response = await pending;

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'REVISION_CONFLICT' });
      const state = await snapshot(id, questionId);
      expect(state.status).toBe('ANSWERED');
      expect(state.revision).toBe(1);
      expect(JSON.stringify(state.draft)).toContain('Edited meanwhile');
      expect(JSON.stringify(state.draft)).not.toContain('"Go"');
    });

    it('rejects the apply when the answer was replaced while the AI was working', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'SKILLS', status: 'ANSWERED', answer: 'Go' });
      const hold = applier.enqueueHold();

      const pending = apply(user.cookie, id, questionId, { revision: 0 });
      await hold.started;
      await app.inject({
        method: 'PUT',
        url: `/api/cvs/${id}/questions/${questionId}/answer`,
        headers: { cookie: user.cookie },
        payload: { answer: 'Rust instead' },
      });
      hold.release({ skills: ['Go'] });
      const response = await pending;

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'QUESTION_STATE_CONFLICT' });
      expect(await snapshot(id, questionId)).toMatchObject({ status: 'ANSWERED', revision: 0 });
    });
  });

  describe('at most once', () => {
    it('lets exactly one of two parallel applies of the same question win', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'CONTACT', field: 'CONTACT_LOCATION', status: 'ANSWERED', answer: 'London' });

      const [one, two] = await Promise.all([
        apply(user.cookie, id, questionId, { revision: 0 }),
        apply(user.cookie, id, questionId, { revision: 0 }),
      ]);

      expect([one.statusCode, two.statusCode].sort((x, y) => x - y)).toEqual([200, 409]);
      expect(await snapshot(id, questionId)).toMatchObject({ status: 'APPLIED', revision: 1 });
    });

    it('a second apply of an applied question is refused', async () => {
      const { user, id } = await setUp();
      const questionId = await seedQuestion(prisma, id, { section: 'CONTACT', field: 'CONTACT_LOCATION', status: 'ANSWERED', answer: 'London' });

      expect((await apply(user.cookie, id, questionId, { revision: 0 })).statusCode).toBe(200);
      const again = await apply(user.cookie, id, questionId, { revision: 1 });

      expect(again.statusCode).toBe(409);
      expect(again.json()).toMatchObject({ code: 'QUESTION_STATE_CONFLICT' });
    });

    it('two applies of different questions on one revision: one wins, the other must retry', async () => {
      const { user, id } = await setUp();
      const a = await seedQuestion(prisma, id, { section: 'CONTACT', field: 'CONTACT_LOCATION', status: 'ANSWERED', answer: 'London' });
      const b = await seedQuestion(prisma, id, { section: 'CONTACT', field: 'CONTACT_PHONE', status: 'ANSWERED', answer: '+44 20 7946 0000' });

      const [one, two] = await Promise.all([
        apply(user.cookie, id, a, { revision: 0 }),
        apply(user.cookie, id, b, { revision: 0 }),
      ]);

      expect([one.statusCode, two.statusCode].sort((x, y) => x - y)).toEqual([200, 409]);
      const loser = one.statusCode === 409 ? one : two;
      expect(loser.json()).toMatchObject({ code: 'REVISION_CONFLICT' });
    });
  });
});
