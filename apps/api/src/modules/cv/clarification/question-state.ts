import { z } from 'zod';
import type { QuestionStatus } from '../../../generated/prisma/enums.js';

/**
 * The clarification question lifecycle (data-model.md):
 *
 *   UNANSWERED -> ANSWERED            answer (the answer can be replaced while ANSWERED)
 *   UNANSWERED | ANSWERED -> DISMISSED  explicit user action only, never automatic
 *   ANSWERED -> APPLIED               only together with the draft change (apply)
 *
 * APPLIED and DISMISSED are resolved and read-only. UNANSWERED and ANSWERED are unresolved, which is
 * what `openQuestionsCount` counts. Answering and dismissing never touch the CV content.
 */
export const UNRESOLVED_STATUSES = ['UNANSWERED', 'ANSWERED'] as const satisfies readonly QuestionStatus[];

export function isUnresolved(status: QuestionStatus): boolean {
  return status === 'UNANSWERED' || status === 'ANSWERED';
}

export function isResolved(status: QuestionStatus): boolean {
  return !isUnresolved(status);
}

export const canAnswer = isUnresolved;
export const canDismiss = isUnresolved;

export function canApply(status: QuestionStatus): boolean {
  return status === 'ANSWERED';
}

/** The database CHECK allows 1000 characters; a person's answer is a sentence or two. */
export const MAX_ANSWER_CHARS = 1000;

export const answerBodySchema = z.object({
  // NUL cannot be stored in a PostgreSQL text column, so it is removed before measuring.
  answer: z
    .string({ error: 'Answer is required' })
    .transform((value) => value.replaceAll('\u0000', ''))
    .pipe(
      z
        .string()
        .trim()
        .min(1, 'Answer must not be blank')
        .max(MAX_ANSWER_CHARS, `Answer must be at most ${MAX_ANSWER_CHARS} characters`),
    ),
});

export type AnswerBody = z.output<typeof answerBodySchema>;

/** The revision of the CV the person is looking at when they apply (optimistic concurrency). */
export const applyBodySchema = z.object({
  revision: z.number({ error: 'Revision is required' }).int().nonnegative(),
});

export type ApplyBody = z.output<typeof applyBodySchema>;

/** Route parameter: Prisma generates cuid ids. */
export const questionIdSchema = z.cuid({ error: 'Invalid question id' });
