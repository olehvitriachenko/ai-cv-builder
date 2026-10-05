import { Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/http/api-error.js';
import type { QuestionSection, QuestionStatus } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../infrastructure/index.js';
import { UNRESOLVED_STATUSES, type AnswerBody } from '../clarification/question-state.js';
import { CvService } from './cv.service.js';

/** A clarification question as the client sees it. The internal `field` target is never exposed. */
export interface QuestionResponse {
  id: string;
  section: QuestionSection;
  itemId: string | null;
  missing: string;
  question: string;
  status: QuestionStatus;
  answer: string | null;
}

const QUESTION_SELECT = {
  id: true,
  section: true,
  itemId: true,
  missing: true,
  question: true,
  status: true,
  answer: true,
} as const;

/**
 * Answering and dismissing change only a question, never the CV content, so they do not use or
 * advance the CV revision (a person typing an answer must not conflict with their own autosave).
 * They are guarded by the question's own state instead.
 */
@Injectable()
export class ClarificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cvs: CvService,
  ) {}

  /** Stores the answer and marks the question ANSWERED. Replaces a previous answer. */
  answer(userId: string, cvId: string, questionId: string, input: AnswerBody): Promise<QuestionResponse> {
    return this.writeQuestion(userId, cvId, questionId, { status: 'ANSWERED', answer: input.answer });
  }

  /** Closes an unresolved question without changing the CV. Only on an explicit request. */
  dismiss(userId: string, cvId: string, questionId: string): Promise<QuestionResponse> {
    return this.writeQuestion(userId, cvId, questionId, { status: 'DISMISSED' });
  }

  /**
   * One conditional UPDATE: the question must be in this CV, the CV must belong to the caller and
   * be COMPLETED, and the question must still be unresolved. The CV's `updatedAt` moves in the same
   * transaction so the list order reflects the activity. When nothing matches, nothing was written
   * and the cause is explained below.
   */
  private async writeQuestion(
    userId: string,
    cvId: string,
    questionId: string,
    data: { status: 'ANSWERED' | 'DISMISSED'; answer?: string },
  ): Promise<QuestionResponse> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [question] = await tx.clarificationQuestion.updateManyAndReturn({
        where: {
          id: questionId,
          status: { in: [...UNRESOLVED_STATUSES] },
          cv: { id: cvId, userId, generationStatus: 'COMPLETED' },
        },
        data,
        select: QUESTION_SELECT,
      });
      if (question) {
        await tx.cv.updateMany({ where: { id: cvId, userId }, data: { updatedAt: new Date() } });
      }
      return question;
    });
    if (updated) {
      return updated;
    }

    // Foreign or missing CV: the usual 404. Not COMPLETED: no editable draft.
    const cv = await this.cvs.findOwnedOrThrow(userId, cvId);
    if (cv.status !== 'COMPLETED') {
      throw new ApiError(409, 'CV_NOT_EDITABLE', 'Only a completed CV can be edited');
    }
    const existing = await this.prisma.clarificationQuestion.findFirst({
      where: { id: questionId, cvId },
      select: { id: true },
    });
    if (!existing) {
      throw new ApiError(404, 'QUESTION_NOT_FOUND', 'Question not found');
    }
    throw new ApiError(
      409,
      'QUESTION_STATE_CONFLICT',
      'This question has already been applied or dismissed',
    );
  }
}
