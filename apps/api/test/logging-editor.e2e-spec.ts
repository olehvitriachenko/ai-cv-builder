import { ConsoleLogger, Logger, type LoggerService } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { ProviderError } from '../src/modules/ai/cv-generator.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createCvFromText } from './helpers/cvs.js';
import { FakeCvAnswerApplier } from './helpers/fake-answer-applier.js';
import { sampleDraft, seedCompleted, seedFailed, seedQuestion } from './helpers/seed.js';
import { registerUser } from './helpers/users.js';

const DRAFT_TEXT = 'SENTINEL-DRAFT-TEXT-91f3';
const ANSWER_TEXT = 'SENTINEL-ANSWER-TEXT-52ad';
const QUESTION_TEXT = 'SENTINEL-QUESTION-TEXT-77be';
const MODEL_TEXT = 'SENTINEL-MODEL-OUTPUT-3c0e';
const PROVIDER_DETAIL = 'SENTINEL-PROVIDER-DETAIL-a8d1';

describe('logging hygiene for list, edit, answer, dismiss, apply and delete', () => {
  const lines: string[] = [];
  const applier = new FakeCvAnswerApplier();
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  const capture: LoggerService = {
    log: (message: unknown, ...rest: unknown[]) => lines.push(render(message, rest)),
    warn: (message: unknown, ...rest: unknown[]) => lines.push(render(message, rest)),
    error: (message: unknown, ...rest: unknown[]) => lines.push(render(message, rest)),
    debug: (message: unknown, ...rest: unknown[]) => lines.push(render(message, rest)),
    verbose: (message: unknown, ...rest: unknown[]) => lines.push(render(message, rest)),
  };

  function render(message: unknown, rest: unknown[]): string {
    return [message, ...rest].map((part) => JSON.stringify(part)).join(' ');
  }

  beforeAll(async () => {
    app = await createTestApp({ answerApplier: applier });
    prisma = app.get(PrismaService);
    Logger.overrideLogger(capture);
  });

  afterAll(async () => {
    await app.close();
    Logger.overrideLogger(new ConsoleLogger());
  });

  it('never logs draft text, answers, question text, model output, provider detail or the cookie', async () => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    const draft = sampleDraft();
    draft.summary = DRAFT_TEXT;
    draft.contact.phone = null;
    await seedCompleted(prisma, id, draft);
    const phone = await seedQuestion(prisma, id, { section: 'CONTACT', field: 'CONTACT_PHONE', status: 'ANSWERED', answer: `+44 20 7946 0000 ${ANSWER_TEXT}`, question: QUESTION_TEXT });
    const skills = await seedQuestion(prisma, id, { section: 'SKILLS', status: 'ANSWERED', answer: ANSWER_TEXT, question: QUESTION_TEXT });
    const toDismiss = await seedQuestion(prisma, id, { section: 'SUMMARY', question: QUESTION_TEXT });
    const headers = { cookie: user.cookie };
    const call = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: object) =>
      app.inject({ method, url, headers, payload });

    await call('GET', '/api/cvs');
    await call('PUT', `/api/cvs/${id}/draft`, { revision: 0, draft: { ...draft, summary: `${DRAFT_TEXT} edited` } });
    // A stale save and an invalid one go through the error paths.
    await call('PUT', `/api/cvs/${id}/draft`, { revision: 0, draft });
    await call('PUT', `/api/cvs/${id}/draft`, { revision: 1, draft: { ...draft, contact: { ...draft.contact, email: 'nope' } } });
    await call('PUT', `/api/cvs/${id}/questions/${skills}/answer`, { answer: ANSWER_TEXT });
    await call('POST', `/api/cvs/${id}/questions/${toDismiss}/dismiss`);
    await call('POST', `/api/cvs/${id}/questions/${phone}/apply`, { revision: 1 });
    // AI path: invalid output (retry), then provider failure.
    applier.enqueueOutput({ wrong: MODEL_TEXT }).enqueueOutput({ wrong: MODEL_TEXT });
    await call('POST', `/api/cvs/${id}/questions/${skills}/apply`, { revision: 2 });
    applier.enqueueError(new ProviderError('BAD_REQUEST', PROVIDER_DETAIL));
    await call('POST', `/api/cvs/${id}/questions/${skills}/apply`, { revision: 2 });
    const failed = await createCvFromText(app, user.cookie);
    await seedFailed(prisma, failed);
    await call('DELETE', `/api/cvs/${failed}`);
    await call('DELETE', `/api/cvs/${id}`);

    const output = lines.join('\n');
    expect(output.length).toBeGreaterThan(0);
    for (const secret of [DRAFT_TEXT, ANSWER_TEXT, QUESTION_TEXT, MODEL_TEXT, PROVIDER_DETAIL, user.cookie, user.cookie.slice('sid='.length), 'ada@example.com']) {
      expect(output).not.toContain(secret);
    }
  });
});
