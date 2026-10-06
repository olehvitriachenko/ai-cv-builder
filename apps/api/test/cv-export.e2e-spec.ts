import { ConsoleLogger, Logger, type LoggerService } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { extractText, getDocumentProxy } from 'unpdf';
import { PrismaService } from '../src/infrastructure/index.js';
import type { CvDraft } from '../src/modules/cv/generation/draft.schema.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createCvFromText, VALID_TARGET_ROLE } from './helpers/cvs.js';
import {
  sampleDraft,
  seedCompleted,
  seedFailed,
  seedProcessing,
  seedQuestion,
} from './helpers/seed.js';
import { registerUser } from './helpers/users.js';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

async function readPdf(bytes: Buffer): Promise<{ text: string; pages: number; widths: number[] }> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const widths: number[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const viewport = (await pdf.getPage(number)).getViewport({ scale: 1 });
    widths.push(Math.round(viewport.width * 100) / 100);
    expect(Math.round(viewport.height * 100) / 100).toBe(A4_HEIGHT);
  }
  const { text } = await extractText(pdf, { mergePages: true });
  return { text: String(text), pages: pdf.numPages, widths };
}

describe('GET /api/cvs/:id/pdf', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  function exportPdf(cookie: string | null, id: string, query = '') {
    return app.inject({
      method: 'GET',
      url: `/api/cvs/${id}/pdf${query}`,
      headers: cookie ? { cookie } : {},
    });
  }

  async function completedCv(draft: CvDraft = sampleDraft()) {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, id, draft);
    return { user, id };
  }

  it('returns the owner an A4 PDF with the right headers', async () => {
    const { user, id } = await completedCv();

    const response = await exportPdf(user.cookie, id);

    expect(response.statusCode).toBe(200);
    const bytes = response.rawPayload;
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="Ada-Lovelace-Backend-Engineer.pdf"; filename*=UTF-8''Ada-Lovelace-Backend-Engineer.pdf`,
    );
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(Number(response.headers['content-length'])).toBe(bytes.length);

    const { text, pages, widths } = await readPdf(bytes);
    expect(pages).toBeGreaterThanOrEqual(1);
    for (const width of widths) {
      expect(width).toBe(A4_WIDTH);
    }
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('ada@example.com');
    expect(text).toContain('Built REST APIs');
    expect(text).toContain('BSc Computer Science');
  });

  it('keeps a Cyrillic name in filename* and gives a plain ASCII fallback', async () => {
    const draft = sampleDraft();
    draft.contact.fullName = 'Олена Іваненко';
    const { user, id } = await completedCv(draft);

    const response = await exportPdf(user.cookie, id);

    expect(response.statusCode).toBe(200);
    const disposition = String(response.headers['content-disposition']);
    expect(disposition).toMatch(/^[\x20-\x7e]+$/);
    expect(disposition).toContain(`filename="Backend-Engineer.pdf"`);
    expect(disposition).toContain(
      `filename*=UTF-8''${encodeURIComponent(`Олена-Іваненко-${VALID_TARGET_ROLE.replace(' ', '-')}.pdf`)}`,
    );
    expect((await readPdf(response.rawPayload)).text).toContain('Олена Іваненко');
  });

  it('exports a partial draft and an empty draft as valid one-page documents', async () => {
    const partial = sampleDraft();
    partial.contact.email = null;
    partial.summary = null;
    partial.experience = [];
    const { user: partialUser, id: partialId } = await completedCv(partial);
    const emptyDraft: CvDraft = {
      schemaVersion: 2,
      contact: { fullName: null, email: null, phone: null, location: null, links: [] },
      summary: null,
      experience: [],
      education: [],
      skillCategories: [],
    };
    const { user: emptyUser, id: emptyId } = await completedCv(emptyDraft);

    const partialResponse = await exportPdf(partialUser.cookie, partialId);
    const emptyResponse = await exportPdf(emptyUser.cookie, emptyId);

    expect(partialResponse.statusCode).toBe(200);
    expect(emptyResponse.statusCode).toBe(200);
    const partialPdf = await readPdf(partialResponse.rawPayload);
    expect(partialPdf.text).toContain('Ada Lovelace');
    expect(partialPdf.text.toLowerCase()).not.toMatch(/null|undefined/);
    const emptyPdf = await readPdf(emptyResponse.rawPayload);
    expect(emptyPdf.pages).toBe(1);
    expect(emptyPdf.text.trim().toUpperCase()).toBe(VALID_TARGET_ROLE.toUpperCase());
    expect(emptyResponse.headers['content-disposition']).toContain(
      'filename="Backend-Engineer.pdf"',
    );
  });

  it('spreads a long CV over several A4 pages', async () => {
    const draft = sampleDraft();
    draft.experience = Array.from({ length: 12 }, (_, entry) => ({
      id: `exp-${entry}`,
      employer: `Company ${entry}`,
      title: `Engineer ${entry}`,
      location: null,
      startDate: '2010',
      endDate: '2020',
      bullets: Array.from(
        { length: 8 },
        (_, bullet) =>
          `Result ${entry}-${bullet}: designed, built and operated a production service with strict reliability goals.`,
      ),
    }));
    const { user, id } = await completedCv(draft);

    const response = await exportPdf(user.cookie, id);

    expect(response.statusCode).toBe(200);
    const { pages, text, widths } = await readPdf(response.rawPayload);
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(widths.every((width) => width === A4_WIDTH)).toBe(true);
    expect(text).toContain('Result 11-7');
  });

  it('lets the browser app read the file name (Content-Disposition is exposed through CORS)', async () => {
    const { user, id } = await completedCv();

    const response = await app.inject({
      method: 'GET',
      url: `/api/cvs/${id}/pdf`,
      headers: { cookie: user.cookie, origin: 'http://localhost:3000' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    const exposed = String(response.headers['access-control-expose-headers'])
      .split(',')
      .map((header) => header.trim().toLowerCase());
    expect(exposed).toContain('content-disposition');
  });

  describe('ownership', () => {
    it('answers another user exactly like a missing CV', async () => {
      const owner = await completedCv();
      const other = await registerUser(app);

      const foreign = await exportPdf(other.cookie, owner.id);
      const missing = await exportPdf(other.cookie, 'cnonexistentidxxxxxxxxxxx');

      expect(foreign.statusCode).toBe(404);
      expect(missing.statusCode).toBe(404);
      expect(foreign.json()).toEqual(missing.json());
      expect(foreign.json()).toMatchObject({ code: 'CV_NOT_FOUND' });
      expect(foreign.headers['content-type']).toContain('application/json');
      expect(foreign.headers['content-disposition']).toBeUndefined();
      expect(foreign.rawPayload.subarray(0, 4).toString('latin1')).not.toBe('%PDF');
    });

    it('ignores a user id supplied by the client', async () => {
      const owner = await completedCv();
      const other = await registerUser(app);
      const { userId } = await prisma.cv.findUniqueOrThrow({
        where: { id: owner.id },
        select: { userId: true },
      });

      const viaQuery = await exportPdf(other.cookie, owner.id, `?userId=${userId}`);
      const viaHeader = await app.inject({
        method: 'GET',
        url: `/api/cvs/${owner.id}/pdf`,
        headers: { cookie: other.cookie, 'x-user-id': userId },
      });

      expect(viaQuery.statusCode).toBe(404);
      expect(viaHeader.statusCode).toBe(404);
    });

    it('requires a session', async () => {
      const owner = await completedCv();

      const response = await exportPdf(null, owner.id);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('rejects a malformed id as invalid input', async () => {
      const user = await registerUser(app);

      const response = await exportPdf(user.cookie, 'not a valid id');

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('exportable states', () => {
    it.each([
      ['pending', async () => undefined],
      ['processing', (id: string) => seedProcessing(prisma, id)],
      ['failed', (id: string) => seedFailed(prisma, id, 'PROVIDER_UNAVAILABLE')],
    ])('refuses a %s CV with GENERATION_NOT_READY', async (_label, prepare) => {
      const user = await registerUser(app);
      const id = await createCvFromText(app, user.cookie);
      await prepare(id);

      const response = await exportPdf(user.cookie, id);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'GENERATION_NOT_READY' });
      expect(response.headers['content-disposition']).toBeUndefined();
    });
  });

  describe('clarification questions', () => {
    it('is not blocked by open questions and never contains any answer or question text', async () => {
      const draft = sampleDraft();
      draft.contact.location = 'Lisbon, Portugal';
      const { user, id } = await completedCv(draft);
      await seedQuestion(prisma, id, {
        status: 'UNANSWERED',
        question: 'QUESTION-TEXT-UNANSWERED?',
        missing: 'MISSING-TEXT-UNANSWERED',
      });
      await seedQuestion(prisma, id, {
        status: 'ANSWERED',
        answer: 'ANSWER-TEXT-NOT-APPLIED',
        question: 'QUESTION-TEXT-ANSWERED?',
      });
      await seedQuestion(prisma, id, {
        status: 'DISMISSED',
        answer: 'ANSWER-TEXT-DISMISSED',
        question: 'QUESTION-TEXT-DISMISSED?',
      });
      await seedQuestion(prisma, id, {
        status: 'APPLIED',
        answer: 'ANSWER-TEXT-ALREADY-APPLIED',
        question: 'QUESTION-TEXT-APPLIED?',
      });

      const response = await exportPdf(user.cookie, id);

      expect(response.statusCode).toBe(200);
      const { text } = await readPdf(response.rawPayload);
      // Applied changes are part of the draft and appear like any other content.
      expect(text).toContain('Lisbon, Portugal');
      // Nothing from the clarification flow does.
      expect(text).not.toMatch(/ANSWER-TEXT|QUESTION-TEXT|MISSING-TEXT/);
      // The raw bytes (uncompressed parts, metadata) do not carry it either.
      expect(response.rawPayload.toString('latin1')).not.toMatch(/ANSWER-TEXT|QUESTION-TEXT/);
    });
  });

  describe('latest saved state', () => {
    it('contains an edit saved just before the request, and not an earlier version', async () => {
      const { user, id } = await completedCv();
      const first = await exportPdf(user.cookie, id);
      expect((await readPdf(first.rawPayload)).text).toContain('Backend engineer.');

      const edited = sampleDraft();
      edited.summary = 'Edited summary that was saved afterwards.';
      const save = await app.inject({
        method: 'PUT',
        url: `/api/cvs/${id}/draft`,
        headers: { cookie: user.cookie },
        payload: { revision: 0, draft: edited },
      });
      expect(save.statusCode).toBe(200);

      const second = await exportPdf(user.cookie, id);
      const text = (await readPdf(second.rawPayload)).text;
      expect(text).toContain('Edited summary that was saved afterwards.');
      expect(text).not.toContain('Backend engineer.');
    });

    it('does not write anything: revision, updatedAt and the draft stay as they were', async () => {
      const { user, id } = await completedCv();
      const before = await prisma.cv.findUniqueOrThrow({ where: { id } });

      await exportPdf(user.cookie, id);
      await exportPdf(user.cookie, id);

      const after = await prisma.cv.findUniqueOrThrow({ where: { id } });
      expect(after.revision).toBe(before.revision);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
      expect(after.draft).toEqual(before.draft);
    });
  });

  it('serves concurrent exports of different CVs without mixing their content', async () => {
    const owners = await Promise.all(
      ['Олена Іваненко', 'Ada Lovelace', 'Тарас Шевченко', 'Grace Hopper'].map(async (name) => {
        const draft = sampleDraft();
        draft.contact.fullName = name;
        return { name, ...(await completedCv(draft)) };
      }),
    );

    const responses = await Promise.all(
      owners.map((owner) => exportPdf(owner.user.cookie, owner.id)),
    );

    for (const [index, response] of responses.entries()) {
      expect(response.statusCode).toBe(200);
      const { text } = await readPdf(response.rawPayload);
      expect(text).toContain(owners[index]?.name ?? '');
      expect(text).toContain('ada@example.com');
    }
  });
});

describe('PDF export logging', () => {
  const lines: string[] = [];
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
    app = await createTestApp();
    prisma = app.get(PrismaService);
    Logger.overrideLogger(capture);
  });

  afterAll(async () => {
    await app.close();
    Logger.overrideLogger(new ConsoleLogger());
  });

  it('records the outcome without the CV content, the role or the file name', async () => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    const draft = sampleDraft();
    draft.contact.fullName = 'Zebulon Quixote-Unique';
    draft.summary = 'Summary-text-that-must-not-be-logged';
    await seedCompleted(prisma, id, draft);

    const response = await app.inject({
      method: 'GET',
      url: `/api/cvs/${id}/pdf`,
      headers: { cookie: user.cookie },
    });

    expect(response.statusCode).toBe(200);
    const logged = lines.join('\n');
    expect(logged).toContain(id);
    for (const secret of [
      'Zebulon',
      'Quixote',
      'Summary-text-that-must-not-be-logged',
      'ada@example.com',
      VALID_TARGET_ROLE,
      '.pdf',
    ]) {
      expect(logged, `log must not contain ${secret}`).not.toContain(secret);
    }
  });
});
