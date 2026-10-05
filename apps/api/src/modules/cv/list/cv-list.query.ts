import { z } from 'zod';
import type { FailureReason, GenerationStatus } from '../../../generated/prisma/enums.js';
import type { PrismaService } from '../../../infrastructure/index.js';
import { canRetryGeneration } from '../retry-rule.js';
import { toDisplayStatus, type DisplayStatus } from './display-status.js';

/** One card on My CVs. Deliberately has no draft body, source text, question text or user id. */
export interface CvListItem {
  id: string;
  targetRole: string;
  status: GenerationStatus;
  displayStatus: DisplayStatus;
  failureReason: FailureReason | null;
  canRetry: boolean;
  updatedAt: Date;
  /** The draft's contact full name; null while there is no draft or the name is blank. */
  candidateName: string | null;
  /** Questions that are unanswered or answered (applied and dismissed ones are resolved). */
  openQuestionsCount: number;
}

// Raw SQL rows are an external boundary: parsed, not cast.
const rowSchema = z.object({
  id: z.string(),
  targetRole: z.string(),
  generationStatus: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
  failureReason: z
    .enum([
      'PROVIDER_UNAVAILABLE',
      'PROVIDER_NOT_CONFIGURED',
      'INVALID_OUTPUT',
      'TIMED_OUT',
      'INTERRUPTED',
      'UNKNOWN',
    ])
    .nullable(),
  updatedAt: z.date(),
  candidateName: z.string().nullable(),
  openQuestionsCount: z.number().int().nonnegative(),
});

/**
 * One statement for the whole list: the candidate name is read straight from the draft JSON and
 * the unresolved questions are counted in the same query, so no draft is transferred or parsed and
 * there is no N+1. The owner is a bound parameter taken from the session, never from the request.
 * Most recently updated first; the id breaks ties so the order is stable.
 */
export async function listCvsForUser(
  prisma: Pick<PrismaService, '$queryRaw'>,
  userId: string,
): Promise<CvListItem[]> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT
      c."id",
      c."targetRole",
      c."generationStatus",
      c."failureReason",
      c."updatedAt",
      NULLIF(btrim(c."draft" #>> '{contact,fullName}'), '') AS "candidateName",
      (
        SELECT count(*)::int
        FROM "ClarificationQuestion" q
        WHERE q."cvId" = c."id" AND q."status" IN ('UNANSWERED', 'ANSWERED')
      ) AS "openQuestionsCount"
    FROM "Cv" c
    WHERE c."userId" = ${userId}
    ORDER BY c."updatedAt" DESC, c."id" DESC
  `;

  return z.array(rowSchema).parse(rows).map((row) => ({
    id: row.id,
    targetRole: row.targetRole,
    status: row.generationStatus,
    displayStatus: toDisplayStatus(row.generationStatus, row.openQuestionsCount),
    failureReason: row.failureReason,
    canRetry: canRetryGeneration(row.generationStatus),
    updatedAt: row.updatedAt,
    candidateName: row.candidateName,
    openQuestionsCount: row.openQuestionsCount,
  }));
}
