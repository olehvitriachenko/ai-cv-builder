import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createCvFromText, postCv, VALID_SOURCE_TEXT } from './helpers/cvs.js';
import { sampleDraft, seedCompleted, seedFailed, seedQuestion } from './helpers/seed.js';
import { registerUser } from './helpers/users.js';

interface ListItem {
  id: string;
  targetRole: string;
  status: string;
  displayStatus: string;
  failureReason: string | null;
  canRetry: boolean;
  updatedAt: string;
  candidateName: string | null;
  openQuestionsCount: number;
}

describe('GET /api/cvs (My CVs list)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function list(cookie: string | undefined, query = '', headers: Record<string, string> = {}) {
    return app.inject({
      method: 'GET',
      url: `/api/cvs${query}`,
      headers: { ...(cookie ? { cookie } : {}), ...headers },
    });
  }

  async function items(cookie: string): Promise<ListItem[]> {
    const response = await list(cookie);
    expect(response.statusCode).toBe(200);
    return response.json<{ items: ListItem[] }>().items;
  }

  function setUpdatedAt(cvId: string, updatedAt: Date) {
    // Prisma's @updatedAt would overwrite the value on a normal update; raw SQL does not.
    return prisma.$executeRaw`UPDATE "Cv" SET "updatedAt" = ${updatedAt} WHERE id = ${cvId}`;
  }

  it('is refused without a session', async () => {
    const response = await list(undefined);

    expect(response.statusCode).toBe(401);
  });

  it('returns an empty list for a user with no CVs', async () => {
    const user = await registerUser(app);

    const response = await list(user.cookie);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [] });
  });

  it("returns only the caller's CVs", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const aId = await createCvFromText(app, a.cookie);
    const bId = await createCvFromText(app, b.cookie);

    const aIds = (await items(a.cookie)).map((item) => item.id);
    const bIds = (await items(b.cookie)).map((item) => item.id);

    expect(aIds).toEqual([aId]);
    expect(bIds).toEqual([bId]);
  });

  it('orders by updatedAt descending, newest first', async () => {
    const user = await registerUser(app);
    const first = await createCvFromText(app, user.cookie);
    const second = await createCvFromText(app, user.cookie);
    const third = await createCvFromText(app, user.cookie);
    await setUpdatedAt(first, new Date('2026-01-01T00:00:00Z'));
    await setUpdatedAt(second, new Date('2026-03-01T00:00:00Z'));
    await setUpdatedAt(third, new Date('2026-02-01T00:00:00Z'));

    expect((await items(user.cookie)).map((item) => item.id)).toEqual([second, third, first]);

    await setUpdatedAt(first, new Date('2026-06-01T00:00:00Z'));

    expect((await items(user.cookie)).map((item) => item.id)).toEqual([first, second, third]);
  });

  it('breaks updatedAt ties by id, descending', async () => {
    const user = await registerUser(app);
    const one = await createCvFromText(app, user.cookie);
    const two = await createCvFromText(app, user.cookie);
    const same = new Date('2026-05-05T00:00:00Z');
    await setUpdatedAt(one, same);
    await setUpdatedAt(two, same);

    const ids = (await items(user.cookie)).map((item) => item.id);

    expect(ids).toEqual([one, two].sort((x, y) => y.localeCompare(x)));
  });

  it('derives the display status, candidate name and counts for every state', async () => {
    const user = await registerUser(app);
    const pending = await createCvFromText(app, user.cookie, { targetRole: 'Pending role' });
    const processing = await createCvFromText(app, user.cookie, { targetRole: 'Processing role' });
    await prisma.cv.update({
      where: { id: processing },
      data: { generationStatus: 'PROCESSING', generationAttempts: 1, processingStartedAt: new Date() },
    });
    const failed = await createCvFromText(app, user.cookie, { targetRole: 'Failed role' });
    await seedFailed(prisma, failed, 'TIMED_OUT');
    const draftCv = await createCvFromText(app, user.cookie, { targetRole: 'Draft role' });
    await seedCompleted(prisma, draftCv);
    await seedQuestion(prisma, draftCv, { status: 'UNANSWERED' });
    await seedQuestion(prisma, draftCv, { status: 'ANSWERED' });
    await seedQuestion(prisma, draftCv, { status: 'APPLIED' });
    await seedQuestion(prisma, draftCv, { status: 'DISMISSED' });
    const doneCv = await createCvFromText(app, user.cookie, { targetRole: 'Done role' });
    await seedCompleted(prisma, doneCv);
    await seedQuestion(prisma, doneCv, { status: 'APPLIED' });
    await seedQuestion(prisma, doneCv, { status: 'DISMISSED' });

    const byId = new Map((await items(user.cookie)).map((item) => [item.id, item]));

    expect(byId.get(pending)).toMatchObject({
      status: 'PENDING',
      displayStatus: 'PROCESSING',
      candidateName: null,
      openQuestionsCount: 0,
      failureReason: null,
      canRetry: false,
    });
    expect(byId.get(processing)).toMatchObject({
      status: 'PROCESSING',
      displayStatus: 'PROCESSING',
      canRetry: false,
    });
    expect(byId.get(failed)).toMatchObject({
      status: 'FAILED',
      displayStatus: 'FAILED',
      failureReason: 'TIMED_OUT',
      candidateName: null,
      canRetry: true,
    });
    expect(byId.get(draftCv)).toMatchObject({
      status: 'COMPLETED',
      displayStatus: 'DRAFT',
      candidateName: 'Ada Lovelace',
      openQuestionsCount: 2,
      canRetry: false,
    });
    expect(byId.get(doneCv)).toMatchObject({
      status: 'COMPLETED',
      displayStatus: 'COMPLETED',
      candidateName: 'Ada Lovelace',
      openQuestionsCount: 0,
    });
  });

  it('has a null candidateName when the draft name is blank or missing', async () => {
    const user = await registerUser(app);
    const noName = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, noName, {
      ...sampleDraft(),
      contact: { ...sampleDraft().contact, fullName: null },
    });
    const blankName = await createCvFromText(app, user.cookie);
    // The draft schema forbids blank strings, but the list must not trust stored JSON blindly.
    await seedCompleted(prisma, blankName, {
      ...sampleDraft(),
      contact: { ...sampleDraft().contact, fullName: '   ' },
    });

    const result = await items(user.cookie);

    expect(result.find((item) => item.id === noName)?.candidateName).toBeNull();
    expect(result.find((item) => item.id === blankName)?.candidateName).toBeNull();
  });

  it('reports canRetry exactly when POST /retry would be accepted', async () => {
    const user = await registerUser(app);
    const failed = await createCvFromText(app, user.cookie);
    await seedFailed(prisma, failed);
    const completed = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, completed);
    const pending = await createCvFromText(app, user.cookie);

    const byId = new Map((await items(user.cookie)).map((item) => [item.id, item]));

    for (const [id, expected] of [
      [completed, false],
      [pending, false],
      [failed, true],
    ] as const) {
      expect(byId.get(id)?.canRetry).toBe(expected);
      const retry = await app.inject({
        method: 'POST',
        url: `/api/cvs/${id}/retry`,
        headers: { cookie: user.cookie },
      });
      expect(retry.statusCode === 202).toBe(expected);
    }
  });

  it('exposes only the list DTO fields, never the draft, source text or question text', async () => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    await seedCompleted(prisma, id);
    await seedQuestion(prisma, id, { question: 'SECRET-QUESTION-TEXT', status: 'UNANSWERED' });

    const response = await list(user.cookie);
    const [item] = response.json<{ items: ListItem[] }>().items;

    expect(Object.keys(item ?? {}).sort((x, y) => x.localeCompare(y))).toEqual([
      'candidateName',
      'canRetry',
      'displayStatus',
      'failureReason',
      'id',
      'openQuestionsCount',
      'status',
      'targetRole',
      'updatedAt',
    ]);
    expect(response.body).not.toContain('SECRET-QUESTION-TEXT');
    expect(response.body).not.toContain(VALID_SOURCE_TEXT);
    expect(response.body).not.toContain('Built REST APIs');
    expect(response.body).not.toContain('sourceText');
    expect(response.body).not.toContain('userId');
  });

  it('ignores a client-supplied user id in the query, header and body', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    await createCvFromText(app, a.cookie);

    const asB = await list(b.cookie, `?userId=${a.user.id}`, {
      'x-user-id': a.user.id,
      userid: a.user.id,
    });

    expect(asB.statusCode).toBe(200);
    expect(asB.json()).toEqual({ items: [] });
  });

  it('does not change updatedAt when reading', async () => {
    const user = await registerUser(app);
    const id = await createCvFromText(app, user.cookie);
    const before = (await items(user.cookie)).find((item) => item.id === id)?.updatedAt;

    await items(user.cookie);
    await items(user.cookie);

    expect((await items(user.cookie)).find((item) => item.id === id)?.updatedAt).toBe(before);
  });

  it('lists a CV created through the API immediately as processing', async () => {
    const user = await registerUser(app);
    const created = await postCv(app, user.cookie, {
      targetRole: 'Platform Engineer',
      sourceText: VALID_SOURCE_TEXT,
    });

    const [item] = await items(user.cookie);

    expect(created.statusCode).toBe(202);
    expect(item).toMatchObject({ targetRole: 'Platform Engineer', displayStatus: 'PROCESSING' });
  });
});
