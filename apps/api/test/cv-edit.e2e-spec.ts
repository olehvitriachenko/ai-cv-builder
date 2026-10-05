import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import type { CvDraft } from '../src/modules/cv/generation/draft.schema.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createCvFromText } from './helpers/cvs.js';
import { sampleDraft, seedCompleted, seedFailed, seedQuestion } from './helpers/seed.js';
import { registerUser } from './helpers/users.js';

interface SaveResult {
  revision: number;
  updatedAt: string;
}

describe('PUT /api/cvs/:id/draft (manual editing)', () => {
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

  function save(cookie: string | undefined, id: string, body: object) {
    return app.inject({
      method: 'PUT',
      url: `/api/cvs/${id}/draft`,
      headers: cookie ? { cookie } : {},
      payload: body,
    });
  }

  async function readResult(cookie: string, id: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/cvs/${id}/result`,
      headers: { cookie },
    });
    return response.json<{ revision: number; draft: CvDraft }>();
  }

  function edited(change: (draft: CvDraft) => void): CvDraft {
    const draft = sampleDraft();
    change(draft);
    return draft;
  }

  it('saves each section and reads it back', async () => {
    const { user, id } = await completedCv();
    const draft = edited((value) => {
      value.contact = {
        fullName: 'Ada King',
        email: 'ada.king@example.com',
        phone: '+44 20 7946 0000',
        location: 'London',
        links: ['github.com/ada'],
      };
      value.summary = 'Systems engineer.';
      value.experience = [
        {
          id: 'exp-1',
          employer: 'Acme Corp',
          title: 'Staff Engineer',
          location: 'Remote',
          startDate: '2015',
          endDate: 'Present',
          bullets: ['Led the platform team'],
        },
        {
          id: 'exp-2',
          employer: 'Globex',
          title: null,
          location: null,
          startDate: null,
          endDate: null,
          bullets: [],
        },
      ];
      value.education = [
        {
          id: 'edu-1',
          institution: 'State University',
          qualification: 'MSc',
          startDate: '2013',
          endDate: '2015',
          details: 'Distinction',
        },
      ];
      value.skills = ['Go', 'PostgreSQL'];
    });

    const response = await save(user.cookie, id, { revision: 0, draft });

    expect(response.statusCode).toBe(200);
    expect(response.json<SaveResult>().revision).toBe(1);
    const result = await readResult(user.cookie, id);
    expect(result.draft).toEqual(draft);
    expect(result.revision).toBe(1);
  });

  it('supports adding, editing and removing bullets', async () => {
    const { user, id } = await completedCv();

    await save(user.cookie, id, {
      revision: 0,
      draft: edited((value) => {
        value.experience[0]?.bullets.push('Added a bullet');
      }),
    });
    await save(user.cookie, id, {
      revision: 1,
      draft: edited((value) => {
        const entry = value.experience[0];
        if (entry) {
          entry.bullets = ['Edited the first bullet'];
        }
      }),
    });
    let bullets = (await readResult(user.cookie, id)).draft.experience[0]?.bullets;
    expect(bullets).toEqual(['Edited the first bullet']);

    await save(user.cookie, id, {
      revision: 2,
      draft: edited((value) => {
        const entry = value.experience[0];
        if (entry) {
          entry.bullets = [];
        }
      }),
    });
    bullets = (await readResult(user.cookie, id)).draft.experience[0]?.bullets;
    expect(bullets).toEqual([]);
  });

  it('advances the revision by exactly one per accepted save and returns updatedAt', async () => {
    const { user, id } = await completedCv();

    const first = await save(user.cookie, id, { revision: 0, draft: sampleDraft() });
    const second = await save(user.cookie, id, { revision: 1, draft: sampleDraft() });

    expect(first.json<SaveResult>().revision).toBe(1);
    expect(second.json<SaveResult>().revision).toBe(2);
    expect(typeof second.json<SaveResult>().updatedAt).toBe('string');
    expect(Object.keys(second.json<SaveResult>()).sort((x, y) => x.localeCompare(y))).toEqual([
      'revision',
      'updatedAt',
    ]);
  });

  it('rejects an invalid draft with dotted field errors and stores nothing', async () => {
    const { user, id } = await completedCv();
    const before = await readResult(user.cookie, id);

    const response = await save(user.cookie, id, {
      revision: 0,
      draft: edited((value) => {
        value.contact.email = 'not-an-email';
        const entry = value.experience[0];
        if (entry) {
          entry.bullets = ['ok', 'ok', 'x'.repeat(301)];
        }
      }),
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<{ code: string; fieldErrors: Record<string, string[]> }>();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(body.fieldErrors)).toEqual(
      expect.arrayContaining(['draft.contact.email', 'draft.experience.0.bullets.2']),
    );
    const after = await readResult(user.cookie, id);
    expect(after.draft).toEqual(before.draft);
    expect(after.revision).toBe(0);
  });

  it.each(['PENDING', 'PROCESSING', 'FAILED'] as const)(
    'refuses to edit a %s CV',
    async (status) => {
      const user = await registerUser(app);
      const id = await createCvFromText(app, user.cookie);
      if (status === 'FAILED') {
        await seedFailed(prisma, id);
      } else if (status === 'PROCESSING') {
        await prisma.cv.update({
          where: { id },
          data: { generationStatus: 'PROCESSING', generationAttempts: 1, processingStartedAt: new Date() },
        });
      }

      const response = await save(user.cookie, id, { revision: 0, draft: sampleDraft() });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'CV_NOT_EDITABLE' });
      const row = await prisma.cv.findUnique({ where: { id }, select: { draft: true, revision: true } });
      expect(row?.draft).toBeNull();
      expect(row?.revision).toBe(0);
    },
  );

  it('rejects a stale revision with 409 and stores nothing', async () => {
    const { user, id } = await completedCv();
    await save(user.cookie, id, {
      revision: 0,
      draft: edited((value) => {
        value.summary = 'Newer content';
      }),
    });

    const stale = await save(user.cookie, id, {
      revision: 0,
      draft: edited((value) => {
        value.summary = 'Stale content';
      }),
    });

    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ statusCode: 409, code: 'REVISION_CONFLICT' });
    const result = await readResult(user.cookie, id);
    expect(result.draft.summary).toBe('Newer content');
    expect(result.revision).toBe(1);
  });

  it('rejects a revision from the future', async () => {
    const { user, id } = await completedCv();

    const response = await save(user.cookie, id, { revision: 5, draft: sampleDraft() });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'REVISION_CONFLICT' });
  });

  it('lets exactly one of two parallel saves on the same revision win', async () => {
    const { user, id } = await completedCv();

    const [one, two] = await Promise.all([
      save(user.cookie, id, {
        revision: 0,
        draft: edited((value) => {
          value.summary = 'Writer one';
        }),
      }),
      save(user.cookie, id, {
        revision: 0,
        draft: edited((value) => {
          value.summary = 'Writer two';
        }),
      }),
    ]);

    expect([one.statusCode, two.statusCode].sort((x, y) => x - y)).toEqual([200, 409]);
    const result = await readResult(user.cookie, id);
    expect(result.revision).toBe(1);
    expect(['Writer one', 'Writer two']).toContain(result.draft.summary);
  });

  it('moves updatedAt on a save and not on a read', async () => {
    const { user, id } = await completedCv();
    const before = await prisma.cv.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } });
    await new Promise((resolve) => setTimeout(resolve, 15));

    await readResult(user.cookie, id);
    const afterRead = await prisma.cv.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } });
    await save(user.cookie, id, { revision: 0, draft: sampleDraft() });
    const afterSave = await prisma.cv.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } });

    expect(afterRead.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(afterSave.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it('leaves the lifecycle columns and the questions untouched', async () => {
    const { user, id } = await completedCv();
    const question = await seedQuestion(prisma, id, { status: 'ANSWERED', answer: 'my answer' });
    const before = await prisma.cv.findUniqueOrThrow({ where: { id } });

    await save(user.cookie, id, { revision: 0, draft: edited((value) => { value.summary = 'Changed'; }) });

    const after = await prisma.cv.findUniqueOrThrow({ where: { id } });
    expect(after.generationStatus).toBe(before.generationStatus);
    expect(after.generationAttempts).toBe(before.generationAttempts);
    expect(after.promptVersion).toBe(before.promptVersion);
    expect(after.sourceText).toBe(before.sourceText);
    const row = await prisma.clarificationQuestion.findUniqueOrThrow({ where: { id: question } });
    expect(row).toMatchObject({ status: 'ANSWERED', answer: 'my answer' });
  });

  it('ignores a client-supplied userId and unknown draft keys', async () => {
    const { user, id } = await completedCv();

    const response = await save(user.cookie, id, {
      revision: 0,
      userId: 'someone-else',
      draft: { ...sampleDraft(), injected: 'x' },
    });

    expect(response.statusCode).toBe(200);
    const row = await prisma.cv.findUniqueOrThrow({ where: { id }, select: { userId: true, draft: true } });
    expect(row.userId).toBe(user.user.id);
    expect(JSON.stringify(row.draft)).not.toContain('injected');
  });

  it('is refused without a session', async () => {
    const { id } = await completedCv();

    const response = await save(undefined, id, { revision: 0, draft: sampleDraft() });

    expect(response.statusCode).toBe(401);
  });
});
