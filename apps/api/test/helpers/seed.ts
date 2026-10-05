import type { Prisma } from '../../src/generated/prisma/client.js';
import type { PrismaService } from '../../src/infrastructure/index.js';
import type { CvDraft } from '../../src/modules/cv/generation/draft.schema.js';

/** A valid persisted draft with one experience and one education entry. */
export function sampleDraft(): CvDraft {
  return {
    schemaVersion: 1,
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
    skills: ['Node.js'],
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
