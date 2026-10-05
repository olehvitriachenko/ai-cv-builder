import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { GenerationRunner } from '../src/modules/cv/generation/generation-runner.service.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createCvFromText, getStatus, VALID_SOURCE_TEXT } from './helpers/cvs.js';
import { FakeCvGenerator } from './helpers/fake-cv-generator.js';
import { validLlmOutput } from './helpers/llm-output.js';
import { registerUser, type RegisteredUser } from './helpers/users.js';

describe('Generation lifecycle', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let runner: GenerationRunner;
  let user: RegisteredUser;
  const generator = new FakeCvGenerator();

  beforeAll(async () => {
    app = await createTestApp({ generator });
    prisma = app.get(PrismaService);
    runner = app.get(GenerationRunner);
    user = await registerUser(app);
  });

  beforeEach(() => {
    generator.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  const rowOf = (id: string) => prisma.cv.findUniqueOrThrow({ where: { id } });
  const result = (id: string) =>
    app.inject({ method: 'GET', url: `/api/cvs/${id}/result`, headers: { cookie: user.cookie } });

  it('persists the CV as PENDING before any AI work', async () => {
    const id = await createCvFromText(app, user.cookie);

    expect((await rowOf(id)).generationStatus).toBe('PENDING');
    expect(generator.calls).toHaveLength(0);
  });

  it('moves PENDING -> PROCESSING -> COMPLETED and stores the draft; reads see each persisted state', async () => {
    const hold = generator.enqueueHold();
    const id = await createCvFromText(app, user.cookie);

    const running = runner.runCv(id);
    await hold.started;

    // "Reload" while the generation is in flight: the persisted state is what is reported.
    const during = await rowOf(id);
    expect(during.generationStatus).toBe('PROCESSING');
    expect(during.processingStartedAt).not.toBeNull();
    expect(during.generationAttempts).toBe(1);
    expect(during.draft).toBeNull();
    expect((await getStatus(app, user.cookie, id)).json()).toMatchObject({
      status: 'PROCESSING',
      finishedAt: null,
    });
    expect((await result(id)).statusCode).toBe(409);

    hold.release(validLlmOutput());
    await running;

    const done = await rowOf(id);
    expect(done).toMatchObject({
      generationStatus: 'COMPLETED',
      failureReason: null,
      promptVersion: 'fake-prompt-v0',
      aiModel: 'fake-model',
    });
    expect(done.draft).not.toBeNull();
    expect(done.finishedAt).not.toBeNull();

    const status = (await getStatus(app, user.cookie, id)).json();
    expect(status).toMatchObject({ status: 'COMPLETED', failureReason: null });
    expect(status.startedAt).not.toBeNull();
    expect(status.finishedAt).not.toBeNull();

    const final = await result(id);
    expect(final.statusCode).toBe(200);
    expect(final.json().draft.experience[0]).toMatchObject({ employer: 'Acme Corp' });
    expect(final.json().draft.experience[0].id).toEqual(expect.any(String));
    expect(generator.calls).toHaveLength(1);
  });

  it('stores a partial draft and its clarification questions together with COMPLETED', async () => {
    generator.enqueueOutput(
      validLlmOutput({
        contact: { fullName: null, email: null, phone: null, location: null, links: [] },
        summary: null,
        experience: [
          {
            employer: 'Acme Corp',
            title: null,
            location: null,
            startDate: null,
            endDate: null,
            bullets: [],
          },
        ],
        education: [],
        skills: [],
        questions: [
          {
            section: 'CONTACT',
            itemIndex: null,
            missing: 'Email address',
            question: 'What is your email address?',
          },
          {
            section: 'EXPERIENCE',
            itemIndex: 0,
            missing: 'Job title and dates',
            question: 'What was your title at Acme Corp and when?',
          },
        ],
      }),
    );
    const id = await createCvFromText(app, user.cookie);

    await runner.runCv(id);

    expect((await rowOf(id)).generationStatus).toBe('COMPLETED');
    const body = (await result(id)).json();
    expect(body.draft.contact.email).toBeNull();
    expect(body.draft.summary).toBeNull();
    expect(body.questions).toHaveLength(2);
    expect(body.questions[0]).toMatchObject({
      section: 'CONTACT',
      itemId: null,
      missing: 'Email address',
      question: 'What is your email address?',
      status: 'OPEN',
    });
    expect(body.questions[1]).toMatchObject({
      section: 'EXPERIENCE',
      itemId: body.draft.experience[0].id,
      status: 'OPEN',
    });
    const rows = await prisma.clarificationQuestion.findMany({
      where: { cvId: id },
      orderBy: { position: 'asc' },
    });
    expect(rows.map((q) => q.position)).toEqual([0, 1]);
  });

  it('retries invalid output once, sending only rule ids and paths as feedback, then completes', async () => {
    generator.enqueueOutput(
      validLlmOutput({ contact: { ...validLlmOutput().contact, email: 'other@invented.test' } }),
    );
    generator.enqueueOutput(validLlmOutput());
    const id = await createCvFromText(app, user.cookie);

    await runner.runCv(id);

    expect(generator.calls).toHaveLength(2);
    expect(generator.calls[0]!.feedback).toBeUndefined();
    expect(generator.calls[1]!.feedback).toEqual(['contact.email: unsupported_contact']);
    expect(JSON.stringify(generator.calls)).not.toContain('invented.test');
    expect(JSON.stringify(generator.calls)).not.toContain(VALID_SOURCE_TEXT);
    expect((await rowOf(id)).generationStatus).toBe('COMPLETED');
  });

  it('runs a job once when two workers claim the same CV at the same time', async () => {
    const hold = generator.enqueueHold();
    const id = await createCvFromText(app, user.cookie);

    const first = runner.runCv(id);
    await hold.started;
    const second = await runner.runCv(id);

    expect(second).toBe(false);
    hold.release(validLlmOutput());
    expect(await first).toBe(true);
    expect(generator.calls).toHaveLength(1);
    expect((await rowOf(id)).generationAttempts).toBe(1);
  });

  it('does not run a CV that is not PENDING', async () => {
    generator.enqueueOutput(validLlmOutput());
    const id = await createCvFromText(app, user.cookie);
    await runner.runCv(id);

    expect(await runner.runCv(id)).toBe(false);
    expect(generator.calls).toHaveLength(1);
  });
});
