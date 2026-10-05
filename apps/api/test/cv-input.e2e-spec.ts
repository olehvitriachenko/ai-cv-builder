import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { createTestApp } from './helpers/create-test-app.js';
import { VALID_SOURCE_TEXT, VALID_TARGET_ROLE, getStatus, postCv } from './helpers/cvs.js';
import { FakeCvGenerator } from './helpers/fake-cv-generator.js';
import { buildMultipart, type MultipartFile } from './helpers/multipart.js';
import { buildCorruptPdf, buildEmptyTextPdf, buildTextPdf } from './helpers/pdf.js';
import { registerUser } from './helpers/users.js';

const PDF_LINES = [
  'Jane Doe - Backend Engineer',
  'Acme Corp, 2019-2023: built REST APIs in Node.js and PostgreSQL',
  'BSc Computer Science, State University, 2018',
];

function pdfFile(data: Buffer, overrides: Partial<MultipartFile> = {}): MultipartFile {
  return { filename: 'cv.pdf', contentType: 'application/pdf', data, ...overrides };
}

describe('CV input', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  const generator = new FakeCvGenerator();

  function upload(
    cookie: string | undefined,
    fields: Record<string, string>,
    file?: MultipartFile,
  ) {
    const { payload, headers } = buildMultipart(fields, file);
    return app.inject({
      method: 'POST',
      url: '/api/cvs/upload',
      headers: { ...headers, ...(cookie ? { cookie } : {}) },
      payload,
    });
  }

  beforeAll(async () => {
    app = await createTestApp({ generator });
    prisma = app.get(PrismaService);
  });

  beforeEach(() => {
    generator.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('free text', () => {
    it('accepts free text plus a target role and returns the status resource', async () => {
      const user = await registerUser(app);

      const response = await postCv(app, user.cookie, {
        targetRole: VALID_TARGET_ROLE,
        sourceText: VALID_SOURCE_TEXT,
      });

      expect(response.statusCode).toBe(202);
      const body = response.json();
      expect(Object.keys(body).sort((a, b) => a.localeCompare(b))).toEqual([
        'createdAt',
        'failureReason',
        'finishedAt',
        'id',
        'sourceType',
        'startedAt',
        'status',
        'targetRole',
        'updatedAt',
      ]);
      expect(body).toMatchObject({
        targetRole: VALID_TARGET_ROLE,
        sourceType: 'FREE_TEXT',
        status: 'PENDING',
        failureReason: null,
        startedAt: null,
        finishedAt: null,
      });
      expect(response.body).not.toContain(VALID_SOURCE_TEXT);
    });

    it('persists the CV as PENDING with the trimmed source before any AI work', async () => {
      const user = await registerUser(app);

      const response = await postCv(app, user.cookie, {
        targetRole: `  ${VALID_TARGET_ROLE}  `,
        sourceText: `  ${VALID_SOURCE_TEXT}  `,
      });

      const row = await prisma.cv.findUniqueOrThrow({ where: { id: response.json().id } });
      expect(row).toMatchObject({
        userId: user.user.id,
        generationStatus: 'PENDING',
        sourceType: 'FREE_TEXT',
        sourceText: VALID_SOURCE_TEXT,
        targetRole: VALID_TARGET_ROLE,
        generationAttempts: 0,
      });
      expect(generator.calls).toHaveLength(0);
    });

    it.each([
      ['a missing role', { sourceText: VALID_SOURCE_TEXT }, 'targetRole'],
      ['a blank role', { targetRole: '   ', sourceText: VALID_SOURCE_TEXT }, 'targetRole'],
      [
        'an over-long role',
        { targetRole: 'a'.repeat(201), sourceText: VALID_SOURCE_TEXT },
        'targetRole',
      ],
      ['missing text', { targetRole: VALID_TARGET_ROLE }, 'sourceText'],
      ['too-short text', { targetRole: VALID_TARGET_ROLE, sourceText: 'too short' }, 'sourceText'],
      [
        'whitespace-only text',
        { targetRole: VALID_TARGET_ROLE, sourceText: ' '.repeat(80) },
        'sourceText',
      ],
      [
        'over-long text',
        { targetRole: VALID_TARGET_ROLE, sourceText: 'a'.repeat(20_001) },
        'sourceText',
      ],
      ['wrong types', { targetRole: 42, sourceText: ['x'] }, 'targetRole'],
      ['an empty object', {}, 'targetRole'],
    ])('rejects %s with 400 and creates nothing', async (_name, payload, field) => {
      const user = await registerUser(app);

      const response = await postCv(app, user.cookie, payload);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(response.json().fieldErrors).toHaveProperty(field);
      expect(await prisma.cv.count({ where: { userId: user.user.id } })).toBe(0);
    });

    it('rejects an empty and a malformed JSON body with 400 and creates nothing', async () => {
      const user = await registerUser(app);

      const malformed = await app.inject({
        method: 'POST',
        url: '/api/cvs',
        headers: { cookie: user.cookie, 'content-type': 'application/json' },
        payload: '{"targetRole": ',
      });
      const empty = await app.inject({
        method: 'POST',
        url: '/api/cvs',
        headers: { cookie: user.cookie, 'content-type': 'application/json' },
        payload: '',
      });

      expect(malformed.statusCode).toBe(400);
      expect(empty.statusCode).toBe(400);
      expect(await prisma.cv.count({ where: { userId: user.user.id } })).toBe(0);
    });

    it('refuses an unauthenticated request and creates nothing', async () => {
      const before = await prisma.cv.count();

      const response = await postCv(app, undefined, {
        targetRole: VALID_TARGET_ROLE,
        sourceText: VALID_SOURCE_TEXT,
      });

      expect(response.statusCode).toBe(401);
      expect(await prisma.cv.count()).toBe(before);
    });

    it('ignores a userId in the body', async () => {
      const owner = await registerUser(app);
      const other = await registerUser(app);

      const response = await postCv(app, owner.cookie, {
        targetRole: VALID_TARGET_ROLE,
        sourceText: VALID_SOURCE_TEXT,
        userId: other.user.id,
      });

      expect(response.statusCode).toBe(202);
      expect(await prisma.cv.count({ where: { userId: owner.user.id } })).toBe(1);
      expect(await prisma.cv.count({ where: { userId: other.user.id } })).toBe(0);
    });

    it('returns the same status resource from GET /api/cvs/:id', async () => {
      const user = await registerUser(app);
      const created = (
        await postCv(app, user.cookie, {
          targetRole: VALID_TARGET_ROLE,
          sourceText: VALID_SOURCE_TEXT,
        })
      ).json();

      const response = await getStatus(app, user.cookie, created.id);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(created);
    });
  });

  describe('PDF upload', () => {
    it('accepts a text PDF plus a target role and stores the extracted text', async () => {
      const user = await registerUser(app);

      const response = await upload(
        user.cookie,
        { targetRole: VALID_TARGET_ROLE },
        pdfFile(buildTextPdf(PDF_LINES)),
      );

      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({
        sourceType: 'PDF',
        status: 'PENDING',
        targetRole: VALID_TARGET_ROLE,
      });
      const row = await prisma.cv.findUniqueOrThrow({ where: { id: response.json().id } });
      expect(row.userId).toBe(user.user.id);
      expect(row.generationStatus).toBe('PENDING');
      expect(row.sourceType).toBe('PDF');
      expect(row.sourceText).toContain('Jane Doe - Backend Engineer');
      expect(row.sourceText).toContain('Acme Corp, 2019-2023');
      expect(generator.calls).toHaveLength(0);
    });

    it('does not trust the file name or declared content type', async () => {
      const user = await registerUser(app);

      const response = await upload(
        user.cookie,
        { targetRole: VALID_TARGET_ROLE },
        pdfFile(buildTextPdf(PDF_LINES), { filename: 'cv.txt', contentType: 'text/plain' }),
      );

      expect(response.statusCode).toBe(202);
    });

    it('rejects a text file renamed to .pdf with 400 on file and creates nothing', async () => {
      const user = await registerUser(app);

      const response = await upload(
        user.cookie,
        { targetRole: VALID_TARGET_ROLE },
        pdfFile(Buffer.from(VALID_SOURCE_TEXT), {
          filename: 'cv.pdf',
          contentType: 'application/pdf',
        }),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(response.json().fieldErrors).toHaveProperty('file');
      expect(await prisma.cv.count({ where: { userId: user.user.id } })).toBe(0);
    });

    it('rejects a file over 5 MiB with 400 on file and creates nothing', async () => {
      const user = await registerUser(app);
      const oversize = Buffer.concat([
        Buffer.from('%PDF-1.4\n'),
        Buffer.alloc(5 * 1024 * 1024 + 1),
      ]);

      const response = await upload(
        user.cookie,
        { targetRole: VALID_TARGET_ROLE },
        pdfFile(oversize),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(response.json().fieldErrors.file[0]).toMatch(/5 MB/);
      expect(await prisma.cv.count({ where: { userId: user.user.id } })).toBe(0);
    });

    it('rejects both a file and a sourceText field with the source error and creates nothing', async () => {
      const user = await registerUser(app);

      const response = await upload(
        user.cookie,
        { targetRole: VALID_TARGET_ROLE, sourceText: VALID_SOURCE_TEXT },
        pdfFile(buildTextPdf(PDF_LINES)),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().fieldErrors).toHaveProperty('source');
      expect(await prisma.cv.count({ where: { userId: user.user.id } })).toBe(0);
    });

    it('rejects a request with no file, and one with only sourceText, and creates nothing', async () => {
      const user = await registerUser(app);

      const none = await upload(user.cookie, { targetRole: VALID_TARGET_ROLE });
      const textOnly = await upload(user.cookie, {
        targetRole: VALID_TARGET_ROLE,
        sourceText: VALID_SOURCE_TEXT,
      });

      expect(none.statusCode).toBe(400);
      expect(none.json().fieldErrors).toHaveProperty('file');
      expect(textOnly.statusCode).toBe(400);
      expect(await prisma.cv.count({ where: { userId: user.user.id } })).toBe(0);
    });

    it('rejects a missing or blank target role and creates nothing', async () => {
      const user = await registerUser(app);

      const missing = await upload(user.cookie, {}, pdfFile(buildTextPdf(PDF_LINES)));
      const blank = await upload(
        user.cookie,
        { targetRole: '   ' },
        pdfFile(buildTextPdf(PDF_LINES)),
      );

      for (const response of [missing, blank]) {
        expect(response.statusCode).toBe(400);
        expect(response.json().fieldErrors).toHaveProperty('targetRole');
      }
      expect(await prisma.cv.count({ where: { userId: user.user.id } })).toBe(0);
    });

    it('rejects a second file with 400 and creates nothing', async () => {
      const user = await registerUser(app);
      const first = buildMultipart(
        { targetRole: VALID_TARGET_ROLE },
        pdfFile(buildTextPdf(PDF_LINES)),
      );
      const boundary = /boundary=(.+)$/.exec(first.headers['content-type'])?.[1] ?? '';
      const extra = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="b.pdf"\r\nContent-Type: application/pdf\r\n\r\n${buildTextPdf(PDF_LINES).toString('latin1')}\r\n--${boundary}--\r\n`,
        'latin1',
      );
      // Drop the closing boundary of the first body and append a second file part.
      const closing = Buffer.from(`--${boundary}--\r\n`);
      const payload = Buffer.concat([
        first.payload.subarray(0, first.payload.length - closing.length),
        extra,
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/cvs/upload',
        headers: { ...first.headers, cookie: user.cookie },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(response.json().fieldErrors.file).toEqual(['Exactly one file is allowed']);
      expect(await prisma.cv.count({ where: { userId: user.user.id } })).toBe(0);
    });

    it('rejects a non-multipart request with 400', async () => {
      const user = await registerUser(app);

      const response = await postCv(app, user.cookie, {}, '');
      expect(response.statusCode).toBe(400);

      const json = await app.inject({
        method: 'POST',
        url: '/api/cvs/upload',
        headers: { cookie: user.cookie },
        payload: { targetRole: VALID_TARGET_ROLE },
      });
      expect(json.statusCode).toBe(400);
      expect(json.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it.each([
      ['a corrupt PDF with a valid signature', buildCorruptPdf],
      ['a PDF with no text (image-only)', buildEmptyTextPdf],
      [
        'a PDF whose text is over 20,000 characters',
        () => buildTextPdf(Array.from({ length: 300 }, (_, i) => `Line ${i} ${'x'.repeat(80)}`)),
      ],
    ])('rejects %s with 422 PDF_EXTRACTION_FAILED and creates no CV', async (_name, build) => {
      const user = await registerUser(app);
      const before = await prisma.cv.count();

      const response = await upload(
        user.cookie,
        { targetRole: VALID_TARGET_ROLE },
        pdfFile(build()),
      );

      expect(response.statusCode).toBe(422);
      const body = response.json();
      expect(body).toMatchObject({ statusCode: 422, code: 'PDF_EXTRACTION_FAILED' });
      expect(typeof body.message).toBe('string');
      expect(body).not.toHaveProperty('fieldErrors');
      expect(await prisma.cv.count({ where: { userId: user.user.id } })).toBe(0);
      expect(await prisma.cv.count()).toBe(before);
      expect(generator.calls).toHaveLength(0);
    });

    it('gives each unusable-PDF failure a distinct, safe message', async () => {
      const user = await registerUser(app);

      const corrupt = await upload(user.cookie, { targetRole: 'X' }, pdfFile(buildCorruptPdf()));
      const empty = await upload(user.cookie, { targetRole: 'X' }, pdfFile(buildEmptyTextPdf()));

      expect(corrupt.json().message).not.toBe(empty.json().message);
      expect(empty.json().message).toMatch(/scanned|image/i);
    });

    it('refuses an unauthenticated upload', async () => {
      const before = await prisma.cv.count();

      const response = await upload(
        undefined,
        { targetRole: VALID_TARGET_ROLE },
        pdfFile(buildTextPdf(PDF_LINES)),
      );

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(await prisma.cv.count()).toBe(before);
    });

    it('ignores a userId form field', async () => {
      const owner = await registerUser(app);
      const other = await registerUser(app);

      const response = await upload(
        owner.cookie,
        { targetRole: VALID_TARGET_ROLE, userId: other.user.id },
        pdfFile(buildTextPdf(PDF_LINES)),
      );

      expect(response.statusCode).toBe(202);
      expect(await prisma.cv.count({ where: { userId: owner.user.id } })).toBe(1);
      expect(await prisma.cv.count({ where: { userId: other.user.id } })).toBe(0);
    });
  });
});
