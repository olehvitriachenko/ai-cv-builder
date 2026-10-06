import type { Prisma } from '../../src/generated/prisma/client.js';
import type { PrismaService } from '../../src/infrastructure/index.js';
import type { CvDraft } from '../../src/modules/cv/generation/draft.schema.js';

/** A valid persisted draft with one experience and one education entry. */
export function sampleDraft(): CvDraft {
  return {
    schemaVersion: 2,
    contact: {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      location: null,
      links: [],
    },
    summary: 'Backend engineer.',
    experience: [
      {
        id: 'exp-1',
        employer: 'Acme Corp',
        title: 'Engineer',
        location: null,
        startDate: '2016',
        endDate: '2023',
        bullets: ['Built REST APIs'],
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'State University',
        qualification: 'BSc Computer Science',
        startDate: null,
        endDate: '2015',
        details: null,
      },
    ],
    languages: [], certifications: [], portfolio: [], hobbies: [], customSections: [],
    skillCategories: [{ id: 'cat-1', name: 'Backend', skills: ['Node.js'] }],
  };
}

/** Moves a CV (created through the API) to COMPLETED with a draft, like a finished generation. */
export async function seedCompleted(
  prisma: PrismaService,
  cvId: string,
  draft: Prisma.InputJsonValue = sampleDraft(),
): Promise<void> {
  await prisma.cv.update({
    where: { id: cvId },
    data: {
      generationStatus: 'COMPLETED',
      generationAttempts: 1,
      processingStartedAt: new Date(),
      finishedAt: new Date(),
      draft,
      promptVersion: 'seed',
      aiModel: 'seed-model',
    },
  });
}

export async function seedFailed(
  prisma: PrismaService,
  cvId: string,
  failureReason:
    'PROVIDER_UNAVAILABLE' | 'INVALID_OUTPUT' | 'TIMED_OUT' | 'INTERRUPTED' | 'UNKNOWN' = 'UNKNOWN',
): Promise<void> {
  await prisma.cv.update({
    where: { id: cvId },
    data: {
      generationStatus: 'FAILED',
      generationAttempts: 1,
      failureReason,
      failureDetail: 'seeded',
      processingStartedAt: new Date(),
      finishedAt: new Date(),
    },
  });
}

export async function seedProcessing(
  prisma: PrismaService,
  cvId: string,
  startedAt: Date = new Date(),
): Promise<void> {
  await prisma.cv.update({
    where: { id: cvId },
    data: { generationStatus: 'PROCESSING', generationAttempts: 1, processingStartedAt: startedAt },
  });
}

export interface SeedQuestion {
  section?: 'CONTACT' | 'SUMMARY' | 'EXPERIENCE' | 'EDUCATION' | 'SKILLS';
  itemId?: string | null;
  field?:
    | 'CONTACT_FULL_NAME'
    | 'CONTACT_EMAIL'
    | 'CONTACT_PHONE'
    | 'CONTACT_LOCATION'
    | 'CONTACT_LINK'
    | 'EXPERIENCE_EMPLOYER'
    | 'EXPERIENCE_TITLE'
    | 'EXPERIENCE_LOCATION'
    | 'EXPERIENCE_START_DATE'
    | 'EXPERIENCE_END_DATE'
    | 'EDUCATION_INSTITUTION'
    | 'EDUCATION_QUALIFICATION'
    | 'EDUCATION_START_DATE'
    | 'EDUCATION_END_DATE'
    | null;
  status?: 'UNANSWERED' | 'ANSWERED' | 'APPLIED' | 'DISMISSED';
  answer?: string | null;
  missing?: string;
  question?: string;
}

/** Inserts one clarification question for a CV and returns its id. */
export async function seedQuestion(
  prisma: PrismaService,
  cvId: string,
  overrides: SeedQuestion = {},
): Promise<string> {
  const position = await prisma.clarificationQuestion.count({ where: { cvId } });
  const status = overrides.status ?? 'UNANSWERED';
  const answer =
    overrides.answer !== undefined
      ? overrides.answer
      : status === 'ANSWERED' || status === 'APPLIED'
        ? 'seeded answer'
        : null;
  const created = await prisma.clarificationQuestion.create({
    data: {
      cvId,
      position,
      section: overrides.section ?? 'SUMMARY',
      itemId: overrides.itemId ?? null,
      field: overrides.field ?? null,
      status,
      answer,
      missing: overrides.missing ?? 'Something is missing',
      question: overrides.question ?? 'What is missing?',
    },
    select: { id: true },
  });
  return created.id;
}

/** A COMPLETED CV with the given questions; returns the question ids in order. */
export async function seedCompletedWithQuestions(
  prisma: PrismaService,
  cvId: string,
  questions: SeedQuestion[],
  draft: Prisma.InputJsonValue = sampleDraft(),
): Promise<string[]> {
  await seedCompleted(prisma, cvId, draft);
  const ids: string[] = [];
  for (const question of questions) {
    ids.push(await seedQuestion(prisma, cvId, question));
  }
  return ids;
}
