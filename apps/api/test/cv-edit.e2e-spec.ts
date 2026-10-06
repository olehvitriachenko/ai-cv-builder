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
    return response.json<{ revision: number; targetRole: string; draft: CvDraft }>();
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
      value.skillCategories = [
        { id: 'cat-1', name: 'Languages', skills: ['Go'] },
        { id: 'cat-2', name: 'Databases', skills: ['PostgreSQL'] },
      ];
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

  describe('skill categories', () => {
    it('rejects the old version 1 shape (schemaVersion 1 and a flat skills list) and stores nothing', async () => {
      const { user, id } = await completedCv();
      const { skillCategories: _categories, ...rest } = sampleDraft();

      const response = await save(user.cookie, id, { revision: 0, draft: { ...rest, schemaVersion: 1, skills: ['Go'] } });

      expect(response.statusCode).toBe(400);
      expect(Object.keys(response.json<{ fieldErrors: Record<string, string[]> }>().fieldErrors)).toContain('draft.schemaVersion');
      expect((await readResult(user.cookie, id)).revision).toBe(0);
    });

    it('rejects duplicate category names, repeated skills and an empty category with dotted paths', async () => {
      const { user, id } = await completedCv();

      const response = await save(user.cookie, id, {
        revision: 0,
        draft: edited((value) => {
          value.skillCategories = [
            { id: 'a', name: 'Languages', skills: ['Go', 'Rust'] },
            { id: 'b', name: ' languages ', skills: ['go'] },
            { id: 'c', name: 'Empty', skills: [] },
          ];
        }),
      });

      expect(response.statusCode).toBe(400);
      expect(Object.keys(response.json<{ fieldErrors: Record<string, string[]> }>().fieldErrors)).toEqual(
        expect.arrayContaining([
          'draft.skillCategories.1.name',
          'draft.skillCategories.1.skills.0',
          'draft.skillCategories.2.skills',
        ]),
      );
    });

    it('keeps category and skill order across a save and a read', async () => {
      const { user, id } = await completedCv();
      const draft = edited((value) => {
        value.skillCategories = [
          { id: 'b', name: 'Databases', skills: ['Redis', 'PostgreSQL'] },
          { id: 'a', name: 'Languages', skills: ['Go'] },
        ];
      });

      await save(user.cookie, id, { revision: 0, draft });

      expect((await readResult(user.cookie, id)).draft.skillCategories).toEqual(draft.skillCategories);
    });
  });

  describe('optional sections', () => {
    const sections = {
      languages: [
        { id: 'lang-1', name: 'English', level: 'C1' as const },
        { id: 'lang-2', name: 'German', level: null },
      ],
      certifications: [
        { id: 'cert-1', name: 'AWS SAA', issuer: 'Amazon', date: 'Jun 2024', link: 'https://aws.amazon.com/verify' },
      ],
      portfolio: [{ id: 'proj-1', name: 'CV Builder', link: 'example.com/cv', description: 'A CV tool' }],
      hobbies: ['Chess', 'Climbing'],
      customSections: [{ id: 'cus-1', title: 'Volunteering', content: 'Food bank\nMentoring' }],
    };

    it('saves the sections and reads them back unchanged and in order', async () => {
      const { user, id } = await completedCv();

      const response = await save(user.cookie, id, {
        revision: 0,
        draft: edited((value) => Object.assign(value, sections)),
      });

      expect(response.statusCode).toBe(200);
      const result = await readResult(user.cookie, id);
      expect(result.draft.languages).toEqual(sections.languages);
      expect(result.draft.certifications).toEqual(sections.certifications);
      expect(result.draft.portfolio).toEqual(sections.portfolio);
      expect(result.draft.hobbies).toEqual(['Chess', 'Climbing']);
      expect(result.draft.customSections).toEqual(sections.customSections);
    });

    it('reads a CV stored before the sections existed as having none', async () => {
      const user = await registerUser(app);
      const id = await createCvFromText(app, user.cookie);
      const { languages: _l, certifications: _c, portfolio: _p, hobbies: _h, customSections: _s, ...legacy } = sampleDraft();
      await seedCompleted(prisma, id, legacy);

      const result = await readResult(user.cookie, id);

      expect(result.draft.languages).toEqual([]);
      expect(result.draft.certifications).toEqual([]);
      expect(result.draft.portfolio).toEqual([]);
      expect(result.draft.hobbies).toEqual([]);
      expect(result.draft.customSections).toEqual([]);
    });

    it('accepts a body that leaves the sections out, as an older client sends it', async () => {
      const { user, id } = await completedCv();
      const { languages: _l, certifications: _c, portfolio: _p, hobbies: _h, customSections: _s, ...legacy } = sampleDraft();

      const response = await save(user.cookie, id, { revision: 0, draft: legacy });

      expect(response.statusCode).toBe(200);
    });

    it('rejects a repeated language and a bad link with dotted paths and stores nothing', async () => {
      const { user, id } = await completedCv();
      const draft = edited((value) => {
        value.languages = [
          { id: 'lang-1', name: 'English', level: null },
          { id: 'lang-2', name: 'ENGLISH', level: 'A2' },
        ];
        value.portfolio = [{ id: 'proj-1', name: 'X', link: 'javascript:alert(1)', description: null }];
      });

      const response = await save(user.cookie, id, { revision: 0, draft });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ fieldErrors: Record<string, string[]> }>();
      expect(Object.keys(body.fieldErrors)).toEqual(
        expect.arrayContaining(['draft.languages.1.name', 'draft.portfolio.0.link']),
      );
      const stored = await readResult(user.cookie, id);
      expect(stored.revision).toBe(0);
      expect(stored.draft.languages).toEqual([]);
    });

    it("cannot be saved into another user's CV (the same 404 as a missing CV)", async () => {
      const owner = await completedCv();
      const intruder = await registerUser(app);

      const response = await save(intruder.cookie, owner.id, {
        revision: 0,
        draft: edited((value) => Object.assign(value, sections)),
      });

      expect(response.statusCode).toBe(404);
      expect((await readResult(owner.user.cookie, owner.id)).draft.languages).toEqual([]);
    });
  });

  describe('target role', () => {
    it('is part of the result', async () => {
      const { user, id } = await completedCv();

      expect((await readResult(user.cookie, id)).targetRole).toBe('Backend Engineer');
    });

    it('is updated with the draft in one write and one revision step, and shows in the list', async () => {
      const { user, id } = await completedCv();

      const response = await save(user.cookie, id, {
        revision: 0,
        draft: edited((value) => {
          value.summary = 'New summary';
        }),
        targetRole: '  Staff Engineer ',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<SaveResult>().revision).toBe(1);
      const result = await readResult(user.cookie, id);
      expect(result.targetRole).toBe('Staff Engineer');
      expect(result.draft.summary).toBe('New summary');
      const list = await app.inject({ method: 'GET', url: '/api/cvs', headers: { cookie: user.cookie } });
      expect(list.json<{ items: { id: string; targetRole: string }[] }>().items.find((item) => item.id === id)?.targetRole).toBe('Staff Engineer');
    });

    it('stays unchanged when the body has no targetRole', async () => {
      const { user, id } = await completedCv();

      await save(user.cookie, id, { revision: 0, draft: sampleDraft() });

      expect((await readResult(user.cookie, id)).targetRole).toBe('Backend Engineer');
    });

    it('is not stored when the revision is stale (the draft and the role change together or not at all)', async () => {
      const { user, id } = await completedCv();
      await save(user.cookie, id, { revision: 0, draft: sampleDraft() });

      const stale = await save(user.cookie, id, { revision: 0, draft: sampleDraft(), targetRole: 'Stale Role' });

      expect(stale.statusCode).toBe(409);
      expect((await readResult(user.cookie, id)).targetRole).toBe('Backend Engineer');
    });

    it.each([['blank', '   '], ['too long', 'r'.repeat(201)]])('rejects a %s role with a targetRole field error and stores nothing', async (_label, targetRole) => {
      const { user, id } = await completedCv();

      const response = await save(user.cookie, id, { revision: 0, draft: sampleDraft(), targetRole });

      expect(response.statusCode).toBe(400);
      expect(Object.keys(response.json<{ fieldErrors: Record<string, string[]> }>().fieldErrors)).toContain('targetRole');
      const result = await readResult(user.cookie, id);
      expect(result.targetRole).toBe('Backend Engineer');
      expect(result.revision).toBe(0);
    });

    it("cannot change another user's CV role (the same 404 as a missing CV)", async () => {
      const { id } = await completedCv();
      const other = await registerUser(app);

      const response = await save(other.cookie, id, { revision: 0, draft: sampleDraft(), targetRole: 'Hijacked' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'CV_NOT_FOUND' });
      const row = await prisma.cv.findUnique({ where: { id }, select: { targetRole: true, revision: true } });
      expect(row).toEqual({ targetRole: 'Backend Engineer', revision: 0 });
    });
  });
});
