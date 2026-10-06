import { deferred } from './helpers/deferred.js';
import { delayPrismaQuery } from './helpers/delay-prisma-query.js';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ProviderError } from '../src/modules/ai/cv-generator.js';
import { PrismaService } from '../src/infrastructure/index.js';
import { GenerationRunner } from '../src/modules/cv/generation/generation-runner.service.js';
import {
  GenerationProcessor,
  DEADLINE_REASON,
  SHUTDOWN_REASON,
} from '../src/modules/cv/generation/generation-processor.service.js';
import { createTestApp } from './helpers/create-test-app.js';
import {
  createCvFromText,
  getStatus,
  VALID_SOURCE_TEXT,
  VALID_TARGET_ROLE,
} from './helpers/cvs.js';
import { FakeCvGenerator } from './helpers/fake-cv-generator.js';
import { validLlmOutput } from './helpers/llm-output.js';
import { seedProcessing } from './helpers/seed.js';
import { registerUser, type RegisteredUser } from './helpers/users.js';

const TIMEOUT_MS = 60_000;

describe('Generation failures, retry and recovery', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let runner: GenerationRunner;
  let user: RegisteredUser;
  const generator = new FakeCvGenerator();

  beforeAll(async () => {
    app = await createTestApp({ generator, generation: { timeoutMs: TIMEOUT_MS } });
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
  const retry = (id: string, cookie = user.cookie) =>
    app.inject({ method: 'POST', url: `/api/cvs/${id}/retry`, headers: { cookie } });
  const backdate = (id: string, ms: number) =>
    prisma.cv.update({ where: { id }, data: { processingStartedAt: new Date(Date.now() - ms) } });

  async function expectFailed(id: string, reason: string, detail?: string) {
    const row = await rowOf(id);
    expect(row).toMatchObject({ generationStatus: 'FAILED', failureReason: reason, draft: null });
    expect(row.finishedAt).not.toBeNull();
    if (detail !== undefined) {
      expect(row.failureDetail).toBe(detail);
    }
    expect(await prisma.clarificationQuestion.count({ where: { cvId: id } })).toBe(0);
    return row;
  }

  describe('invalid output', () => {
    const base = validLlmOutput();
    const cases: [string, unknown][] = [
      ['malformed text instead of the structure', 'this is not json'],
      ['null', null],
      ['wrong types', { ...base, skillCategories: 'Node.js' }],
      ['a category outside the catalogue', { ...base, skillCategories: [{ category: 'Underwater Basket Weaving', skills: ['Node.js'] }] }],
      ['a missing section', { ...base, experience: undefined }],
      [
        'a contact detail absent from the source',
        { ...base, contact: { ...base.contact, email: 'someone@evil.test' } },
      ],
      [
        'an employer with no counterpart in the source',
        {
          ...base,
          experience: [{ ...base.experience[0]!, employer: 'Globex Industries' }],
        },
      ],
    ];

    it.each(cases)(
      'ends FAILED / INVALID_OUTPUT after exactly one retry for %s, storing nothing',
      async (_name, output) => {
        generator.enqueueOutput(output).enqueueOutput(output);
        const id = await createCvFromText(app, user.cookie);
        const before = await rowOf(id);

        await runner.runCv(id);

        expect(generator.calls).toHaveLength(2);
        const row = await expectFailed(id, 'INVALID_OUTPUT');
        // The row is otherwise unchanged: source, role and the AI bookkeeping fields.
        expect(row).toMatchObject({
          sourceText: before.sourceText,
          targetRole: before.targetRole,
          promptVersion: null,
          aiModel: null,
          generationAttempts: 1,
        });
        // The detail holds only rule ids and paths, never source or draft values.
        expect(row.failureDetail).toMatch(/^[\w.() :;-]+$/);
        for (const leaked of ['Acme', 'example.com', 'evil', 'Globex', 'ada@']) {
          expect(row.failureDetail).not.toContain(leaked);
        }
      },
    );

    it('reports the safe reason through the API without the detail', async () => {
      generator.enqueueOutput('nope').enqueueOutput('nope');
      const id = await createCvFromText(app, user.cookie);

      await runner.runCv(id);

      const response = await getStatus(app, user.cookie, id);
      expect(response.json()).toMatchObject({ status: 'FAILED', failureReason: 'INVALID_OUTPUT' });
      expect(response.body).not.toContain('failureDetail');
      expect(response.body).not.toContain('schema_');
    });
  });

  describe('provider errors', () => {
    it('retries a transient error once and completes when the second call succeeds', async () => {
      generator.enqueueError(new ProviderError('TRANSIENT', '503')).enqueueOutput(validLlmOutput());
      const id = await createCvFromText(app, user.cookie);

      await runner.runCv(id);

      expect(generator.calls).toHaveLength(2);
      expect((await rowOf(id)).generationStatus).toBe('COMPLETED');
    });

    it('ends FAILED / PROVIDER_UNAVAILABLE after two transient errors', async () => {
      generator
        .enqueueError(new ProviderError('TRANSIENT', '503'))
        .enqueueError(new ProviderError('TRANSIENT', '503'));
      const id = await createCvFromText(app, user.cookie);

      await runner.runCv(id);

      expect(generator.calls).toHaveLength(2);
      await expectFailed(id, 'PROVIDER_UNAVAILABLE', 'TRANSIENT 503');
    });

    it('ends FAILED / PROVIDER_NOT_CONFIGURED after one call, without retrying', async () => {
      generator.enqueueError(new ProviderError('NOT_CONFIGURED'));
      const id = await createCvFromText(app, user.cookie);

      await runner.runCv(id);

      expect(generator.calls).toHaveLength(1);
      await expectFailed(id, 'PROVIDER_NOT_CONFIGURED');
    });

    it('ends FAILED / INVALID_OUTPUT (refusal) after one call, without retrying', async () => {
      generator.enqueueError(new ProviderError('REFUSED'));
      const id = await createCvFromText(app, user.cookie);

      await runner.runCv(id);

      expect(generator.calls).toHaveLength(1);
      await expectFailed(id, 'INVALID_OUTPUT', 'refusal');
    });

    it('ends FAILED / UNKNOWN for a bad request and for an unexpected error, leaking nothing', async () => {
      generator.enqueueError(new ProviderError('BAD_REQUEST', '400'));
      const bad = await createCvFromText(app, user.cookie);
      await runner.runCv(bad);
      await expectFailed(bad, 'UNKNOWN', 'BAD_REQUEST 400');

      generator.enqueueError(new Error('kaboom secret internal message'));
      const boom = await createCvFromText(app, user.cookie);
      await runner.runCv(boom);
      const row = await expectFailed(boom, 'UNKNOWN', 'Error');
      expect(row.failureDetail).not.toContain('kaboom');

      const body = (await getStatus(app, user.cookie, boom)).body;
      expect(body).not.toContain('kaboom');
      expect(body).not.toContain('secret');
    });

    it('ends FAILED / UNKNOWN when the result cannot be saved, discarding the draft', async () => {
      const hold = generator.enqueueHold();
      const id = await createCvFromText(app, user.cookie);
      const running = runner.runCv(id);
      await hold.started;
      const spy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('db went away'));

      hold.release(validLlmOutput());
      await running;

      spy.mockRestore();
      await expectFailed(id, 'UNKNOWN', 'persist_failed');
    });
  });

  describe('time limit', () => {
    it.each([DEADLINE_REASON, SHUTDOWN_REASON])(
      'discards successful output resolved after %s cancellation',
      async (reason) => {
        const id = await createCvFromText(app, user.cookie);
        await seedProcessing(prisma, id);
        const controller = new AbortController();
        const generate = vi.spyOn(generator, 'generate').mockImplementationOnce(async () => {
          // A non-cooperative provider resolves successfully even though cancellation won.
          controller.abort(reason);
          return validLlmOutput({
            questions: [
              { section: 'SUMMARY', itemIndex: null, field: undefined, missing: 'Focus', question: 'Which focus?' },
            ],
          });
        });
        try {
          await app
            .get(GenerationProcessor)
            .run(
              { id, attempt: 1, sourceText: VALID_SOURCE_TEXT, targetRole: VALID_TARGET_ROLE },
              controller.signal,
            );
          expect((await rowOf(id)).draft).toBeNull();
          expect(await prisma.clarificationQuestion.count({ where: { cvId: id } })).toBe(0);
          if (reason === DEADLINE_REASON) {
            await expectFailed(id, 'TIMED_OUT');
          } else {
            expect((await rowOf(id)).generationStatus).toBe('PROCESSING');
            await runner.failInterrupted();
          }
        } finally {
          generate.mockRestore();
        }
      },
    );
    it('ends FAILED / TIMED_OUT when the provider call outlives the deadline', async () => {
      const tiny = await createTestApp({ generator, generation: { timeoutMs: 40 } });
      try {
        const owner = await registerUser(tiny);
        generator.enqueueHold(); // never released; honours the abort signal
        const id = await createCvFromText(tiny, owner.cookie);

        await tiny.get(GenerationRunner).runCv(id);

        await expectFailed(id, 'TIMED_OUT', 'deadline');
      } finally {
        await tiny.close();
      }
    });

    it('discards a result that arrives after the CV was timed out, and stores no questions', async () => {
      const hold = generator.enqueueHold();
      const id = await createCvFromText(app, user.cookie);
      const running = runner.runCv(id);
      await hold.started;

      await backdate(id, TIMEOUT_MS + 1000);
      expect(await runner.failTimedOut()).toBeGreaterThanOrEqual(1);
      await expectFailed(id, 'TIMED_OUT', 'timeout_sweep');

      hold.release(
        validLlmOutput({
          questions: [
            { section: 'SUMMARY', itemIndex: null, field: undefined, missing: 'Focus', question: 'Which focus?' },
          ],
        }),
      );
      await running;

      await expectFailed(id, 'TIMED_OUT', 'timeout_sweep');
    });

    it('fails only PROCESSING rows older than the timeout and leaves a recent one alone', async () => {
      const stale = await createCvFromText(app, user.cookie);
      const fresh = await createCvFromText(app, user.cookie);
      await seedProcessing(prisma, stale, new Date(Date.now() - TIMEOUT_MS - 1000));
      await seedProcessing(prisma, fresh, new Date());

      await runner.failTimedOut();

      expect((await rowOf(stale)).failureReason).toBe('TIMED_OUT');
      expect((await rowOf(fresh)).generationStatus).toBe('PROCESSING');
      await prisma.cv.update({
        where: { id: fresh },
        data: { generationStatus: 'FAILED', failureReason: 'UNKNOWN', finishedAt: new Date() },
      });
    });
  });

  describe('restart recovery', () => {
    it('marks PROCESSING as FAILED / INTERRUPTED (never PENDING) and leaves PENDING to be processed', async () => {
      const processing = await createCvFromText(app, user.cookie);
      const pending = await createCvFromText(app, user.cookie);
      await seedProcessing(prisma, processing);

      expect(await runner.failInterrupted()).toBeGreaterThanOrEqual(1);

      expect(await rowOf(processing)).toMatchObject({
        generationStatus: 'FAILED',
        failureReason: 'INTERRUPTED',
        draft: null,
      });
      expect((await rowOf(pending)).generationStatus).toBe('PENDING');

      generator.enqueueOutput(validLlmOutput());
      await runner.runCv(pending);
      expect((await rowOf(pending)).generationStatus).toBe('COMPLETED');
    });
  });

  describe('retry', () => {
    it('returns a FAILED CV to PENDING, clears the failure fields, and then completes', async () => {
      generator.enqueueError(new ProviderError('NOT_CONFIGURED')).enqueueOutput(validLlmOutput());
      const id = await createCvFromText(app, user.cookie);
      await runner.runCv(id);
      await expectFailed(id, 'PROVIDER_NOT_CONFIGURED');

      const response = await retry(id);

      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({
        id,
        status: 'PENDING',
        failureReason: null,
        startedAt: null,
        finishedAt: null,
      });
      expect(await rowOf(id)).toMatchObject({
        generationStatus: 'PENDING',
        failureReason: null,
        failureDetail: null,
        processingStartedAt: null,
        finishedAt: null,
      });

      await runner.runCv(id);
      expect((await rowOf(id)).generationStatus).toBe('COMPLETED');
    });

    it('can retry an interrupted generation', async () => {
      const id = await createCvFromText(app, user.cookie);
      await seedProcessing(prisma, id);
      await runner.failInterrupted();

      expect((await retry(id)).statusCode).toBe(202);

      generator.enqueueOutput(validLlmOutput());
      await runner.runCv(id);
      expect((await rowOf(id)).generationStatus).toBe('COMPLETED');
    });

    it('refuses to retry a PENDING, PROCESSING or COMPLETED CV with 409', async () => {
      const pending = await createCvFromText(app, user.cookie);

      const processing = await createCvFromText(app, user.cookie);
      await seedProcessing(prisma, processing);

      generator.enqueueOutput(validLlmOutput());
      const completed = await createCvFromText(app, user.cookie);
      await runner.runCv(completed);

      for (const id of [pending, processing, completed]) {
        const before = await rowOf(id);
        const response = await retry(id);

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
          statusCode: 409,
          code: 'GENERATION_NOT_RETRYABLE',
        });
        expect((await rowOf(id)).generationStatus).toBe(before.generationStatus);
      }
      await prisma.cv.update({
        where: { id: processing },
        data: { generationStatus: 'FAILED', failureReason: 'UNKNOWN', finishedAt: new Date() },
      });
    });

    it('lets only one of two quick retries through', async () => {
      generator.enqueueError(new ProviderError('NOT_CONFIGURED'));
      const id = await createCvFromText(app, user.cookie);
      await runner.runCv(id);

      const responses = await Promise.all([retry(id), retry(id)]);

      expect(responses.map((r) => r.statusCode).sort((a, b) => a - b)).toEqual([202, 409]);
    });

    it('rejects a delayed overlapping retry after another retry starts and fails again', async () => {
      generator.enqueueError(new ProviderError('NOT_CONFIGURED'));
      const id = await createCvFromText(app, user.cookie);
      await runner.runCv(id);
      const firstAttempt = (await rowOf(id)).generationAttempts;

      const entered = deferred<void>();
      const release = deferred<void>();
      const update = prisma.cv.updateManyAndReturn.bind(prisma.cv);
      // Hold the first request AFTER its ownership/version read, before its conditional update.
      const delayedUpdate = vi
        .spyOn(prisma.cv, 'updateManyAndReturn')
        .mockImplementationOnce((args) => {
          entered.resolve();
          return delayPrismaQuery(update(args), release.promise);
        });
      const delayed = retry(id).then((response) => response);
      try {
        await entered.promise;
        expect((await retry(id)).statusCode).toBe(202);
        generator.enqueueError(new ProviderError('NOT_CONFIGURED'));
        await runner.runCv(id);
        expect(await rowOf(id)).toMatchObject({
          generationStatus: 'FAILED',
          generationAttempts: firstAttempt + 1,
        });
        release.resolve();
        expect((await delayed).statusCode).toBe(409);
        expect(await rowOf(id)).toMatchObject({
          generationStatus: 'FAILED',
          generationAttempts: firstAttempt + 1,
        });
      } finally {
        release.resolve();
        await delayed;
        delayedUpdate.mockRestore();
      }
    });

    it('never resets generationAttempts: it is the fencing token', async () => {
      generator.enqueueError(new ProviderError('NOT_CONFIGURED')).enqueueOutput(validLlmOutput());
      const id = await createCvFromText(app, user.cookie);
      await runner.runCv(id);
      expect((await rowOf(id)).generationAttempts).toBe(1);

      await retry(id);
      expect((await rowOf(id)).generationAttempts).toBe(1);
      await runner.runCv(id);

      expect((await rowOf(id)).generationAttempts).toBe(2);
    });

    it('fences a stale worker of an earlier attempt out of a newer attempt (no draft, no questions)', async () => {
      // Attempt 1 hangs and is timed out; the owner retries; attempt 2 is claimed and hangs too.
      const stale = generator.enqueueHold();
      const id = await createCvFromText(app, user.cookie);
      const first = runner.runCv(id);
      await stale.started;
      await backdate(id, TIMEOUT_MS + 1000);
      await runner.failTimedOut();

      expect((await retry(id)).statusCode).toBe(202);
      const current = generator.enqueueHold();
      const second = runner.runCv(id);
      await current.started;
      expect(await rowOf(id)).toMatchObject({
        generationStatus: 'PROCESSING',
        generationAttempts: 2,
      });

      // The stale worker finishes now with a perfectly valid result and questions.
      stale.release(
        validLlmOutput({
          summary: 'STALE RESULT',
          questions: [
            { section: 'SUMMARY', itemIndex: null, field: undefined, missing: 'Stale', question: 'Stale?' },
          ],
        }),
      );
      await first;

      expect(await rowOf(id)).toMatchObject({
        generationStatus: 'PROCESSING',
        generationAttempts: 2,
        draft: null,
      });
      expect(await prisma.clarificationQuestion.count({ where: { cvId: id } })).toBe(0);

      // The current worker is unaffected and completes normally.
      current.release(validLlmOutput({ summary: 'CURRENT RESULT' }));
      await second;

      const row = await rowOf(id);
      expect(row.generationStatus).toBe('COMPLETED');
      expect(JSON.stringify(row.draft)).toContain('CURRENT RESULT');
      expect(JSON.stringify(row.draft)).not.toContain('STALE RESULT');
      expect(await prisma.clarificationQuestion.count({ where: { cvId: id } })).toBe(0);
    });
  });
});
