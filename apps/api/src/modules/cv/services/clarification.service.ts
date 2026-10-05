import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../../../common/http/api-error.js';
import type {
  QuestionField,
  QuestionSection,
  QuestionStatus,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../infrastructure/index.js';
import { CvAnswerApplier } from '../../ai/cv-answer-applier.js';
import { ProviderError } from '../../ai/cv-generator.js';
import type { ScopeContent } from '../../ai/prompts/answer-patch.prompt.js';
import { answerPatchSchemas } from '../../ai/schemas/answer-patch.schema.js';
import { APPLY_OPTIONS, type ApplyOptions } from '../clarification/apply.options.js';
import { applyAnswerPatch, type PatchIssue } from '../clarification/answer-patch.js';
import { applyFieldAnswer, checkTarget } from '../clarification/question-target.js';
import { UNRESOLVED_STATUSES, canApply, type AnswerBody } from '../clarification/question-state.js';
import { cvDraftSchema, type CvDraft } from '../generation/draft.schema.js';
import { CvService, type CvResultResponse } from './cv.service.js';

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
interface ApplyContext {
  targetRole: string;
  draft: CvDraft;
  question: {
    id: string;
    section: QuestionSection;
    itemId: string | null;
    field: QuestionField | null;
    text: string;
    answer: string;
  };
}

/** Which way an answer reached the draft, for the log (never any content). */
type ApplyPath = 'deterministic' | 'ai';

const MAX_AI_ATTEMPTS = 2;

@Injectable()
export class ClarificationService {
  private readonly logger = new Logger(ClarificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cvs: CvService,
    private readonly applier: CvAnswerApplier,
    @Inject(APPLY_OPTIONS) private readonly options: ApplyOptions,
  ) {}

  /** Stores the answer and marks the question ANSWERED. Replaces a previous answer. */
  answer(
    userId: string,
    cvId: string,
    questionId: string,
    input: AnswerBody,
  ): Promise<QuestionResponse> {
    return this.writeQuestion(userId, cvId, questionId, {
      status: 'ANSWERED',
      answer: input.answer,
    });
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

  /**
   * Applies an ANSWERED question to the part of the CV it concerns and marks it APPLIED, atomically.
   *
   * 1. Preconditions: owner, COMPLETED, question in this CV and ANSWERED, the caller's revision is
   *    current, and the target still accepts the answer. Nothing has been written yet.
   * 2. The new draft: placed deterministically when the question has a `field`, otherwise through a
   *    narrow, validated AI patch. Either way the result passes the draft schema first.
   * 3. One transaction: the draft write (compare-and-set on revision) and the APPLIED marking
   *    commit together or not at all.
   */
  async apply(
    userId: string,
    cvId: string,
    questionId: string,
    input: { revision: number },
  ): Promise<CvResultResponse> {
    const context = await this.loadApplyContext(userId, cvId, questionId, input.revision);
    const path: ApplyPath = context.question.field === null ? 'ai' : 'deterministic';
    const draft =
      path === 'deterministic'
        ? this.computeDeterministicDraft(context)
        : await this.computeAiDraft(context);

    await this.commitApply(userId, cvId, context, draft, input.revision);

    this.logger.log(`event=question_applied cvId=${cvId} questionId=${questionId} path=${path}`);
    return this.cvs.getResult(userId, cvId);
  }

  /** Steps 1-4 of the apply: everything that can be refused before any work or write. */
  private async loadApplyContext(
    userId: string,
    cvId: string,
    questionId: string,
    expectedRevision: number,
  ): Promise<ApplyContext> {
    // Same ownership rule as every CV read: the owner is part of the query (foreign == missing).
    const cv = await this.prisma.cv.findFirst({
      where: { id: cvId, userId },
      select: { targetRole: true, generationStatus: true, revision: true, draft: true },
    });
    if (!cv) {
      throw new ApiError(404, 'CV_NOT_FOUND', 'CV not found');
    }
    if (cv.generationStatus !== 'COMPLETED') {
      throw new ApiError(409, 'CV_NOT_EDITABLE', 'Only a completed CV can be edited');
    }

    const question = await this.prisma.clarificationQuestion.findFirst({
      where: { id: questionId, cvId },
      select: {
        id: true,
        section: true,
        itemId: true,
        field: true,
        question: true,
        status: true,
        answer: true,
      },
    });
    if (!question) {
      throw new ApiError(404, 'QUESTION_NOT_FOUND', 'Question not found');
    }
    if (!canApply(question.status) || question.answer === null) {
      throw new ApiError(
        409,
        'QUESTION_STATE_CONFLICT',
        'Only an answered question can be applied',
      );
    }
    if (cv.revision !== expectedRevision) {
      throw new ApiError(
        409,
        'REVISION_CONFLICT',
        'The CV changed since you loaded it. Reload to see the latest version.',
      );
    }

    // Database JSON is an external boundary: parse it again.
    const draft = cvDraftSchema.parse(cv.draft);

    if (question.field === null) {
      const problem = checkTarget(draft, question);
      if (problem !== null) {
        throw targetNotApplicable();
      }
    }

    return {
      targetRole: cv.targetRole,
      draft,
      question: {
        id: question.id,
        section: question.section,
        itemId: question.itemId,
        field: question.field,
        text: question.question,
        answer: question.answer,
      },
    };
  }

  /** A single plain value goes straight into its field: no AI, no rewording. */
  private computeDeterministicDraft({ draft, question }: ApplyContext): CvDraft {
    if (question.field === null) {
      throw new Error('computeDeterministicDraft needs a question with a field');
    }
    const result = applyFieldAnswer(draft, question.field, question.itemId, question.answer);
    if (!result.ok) {
      if (result.reason === 'INVALID_VALUE') {
        throw new ApiError(
          422,
          'ANSWER_INVALID_FOR_FIELD',
          'The answer does not fit this field. Edit your answer, or dismiss the question and edit the CV by hand.',
        );
      }
      throw targetNotApplicable();
    }
    const parsed = cvDraftSchema.safeParse(result.draft);
    if (!parsed.success) {
      throw new ApiError(422, 'ANSWER_INVALID_FOR_FIELD', 'The answer does not fit this field.');
    }
    return parsed.data;
  }

  /**
   * Wording an answer needs: ask the model for a patch limited to this section or entry, validate it
   * (schema, then the additive and fact-support rules), and retry once with rule ids only. The
   * model never sees other sections and never names a path.
   */
  private async computeAiDraft({ draft, targetRole, question }: ApplyContext): Promise<CvDraft> {
    const scope = scopeOf(draft, question);
    let feedback: string[] | undefined;

    for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt += 1) {
      const last = attempt === MAX_AI_ATTEMPTS;

      let output: unknown;
      try {
        output = await this.applier.apply({
          scope,
          question: question.text,
          answer: question.answer,
          targetRole,
          feedback,
          signal: AbortSignal.timeout(this.options.timeoutMs),
        });
      } catch (error) {
        if (error instanceof ProviderError) {
          if (error.kind === 'TRANSIENT' && !last) {
            this.logger.warn(`event=apply_retry cvId=n/a kind=${error.kind} attempt=${attempt}`);
            await new Promise((resolve) => setTimeout(resolve, this.options.transientRetryDelayMs));
            continue;
          }
          if (error.kind === 'REFUSED') {
            throw outputInvalid();
          }
          throw aiUnavailable();
        }
        if (
          error instanceof DOMException &&
          (error.name === 'TimeoutError' || error.name === 'AbortError')
        ) {
          throw aiUnavailable();
        }
        throw error;
      }

      const parsed = answerPatchSchemas[question.section].safeParse(output);
      let issues: PatchIssue[];
      if (!parsed.success) {
        issues = parsed.error.issues.map((issue) => ({
          rule: `patch_${issue.code}`,
          path: issue.path.join('.') || 'patch',
        }));
      } else {
        const applied = applyAnswerPatch(draft, question, parsed.data, question.answer);
        if (applied.ok) {
          return applied.draft;
        }
        issues = applied.issues;
      }

      if (last) {
        this.logger.warn(
          `event=apply_output_invalid questionId=${question.id} rules=${issues.map((issue) => issue.rule).join(',')}`,
        );
        throw outputInvalid();
      }
      // Rule ids and paths only: never the answer, the draft or the model's text.
      feedback = issues.map((issue) => `${issue.path}: ${issue.rule}`);
    }

    throw outputInvalid();
  }

  /**
   * The one place an apply writes: the draft (only if the revision is still the one the apply was
   * based on) and the question's APPLIED state (only if it is still ANSWERED with the same answer).
   * Throwing inside the transaction rolls both back.
   */
  private async commitApply(
    userId: string,
    cvId: string,
    { question }: ApplyContext,
    draft: CvDraft,
    expectedRevision: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.cv.updateMany({
        where: { id: cvId, userId, generationStatus: 'COMPLETED', revision: expectedRevision },
        data: { draft, revision: { increment: 1 } },
      });
      if (changed.count !== 1) {
        throw new ApiError(
          409,
          'REVISION_CONFLICT',
          'The CV changed since you loaded it. Reload to see the latest version.',
        );
      }

      const marked = await tx.clarificationQuestion.updateMany({
        // The answer used for the apply must still be the stored one.
        where: { id: question.id, cvId, status: 'ANSWERED', answer: question.answer },
        data: { status: 'APPLIED' },
      });
      if (marked.count !== 1) {
        throw new ApiError(
          409,
          'QUESTION_STATE_CONFLICT',
          'This question changed while it was being applied',
        );
      }
    });
  }
}

const targetNotApplicable = () =>
  new ApiError(
    409,
    'TARGET_NOT_APPLICABLE',
    'This answer can no longer be applied because that part of the CV was changed or removed. Edit the CV yourself, or dismiss the question.',
  );

const aiUnavailable = () =>
  new ApiError(
    503,
    'AI_UNAVAILABLE',
    'The AI assistant is unavailable right now. Try again in a moment.',
  );

const outputInvalid = () =>
  new ApiError(
    422,
    'APPLY_OUTPUT_INVALID',
    'The AI could not turn this answer into a safe change. Try again, edit your answer, or edit the CV by hand.',
  );

/** Only the targeted section or entry (no ids, no other sections) goes to the model. */
function scopeOf(draft: CvDraft, question: ApplyContext['question']): ScopeContent {
  switch (question.section) {
    case 'CONTACT':
      return { section: 'CONTACT', contact: draft.contact };
    case 'SUMMARY':
      return { section: 'SUMMARY' };
    case 'SKILLS':
      return {
        section: 'SKILLS',
        categories: draft.skillCategories.map(({ name, skills }) => ({ name, skills })),
      };
    case 'EXPERIENCE': {
      // The target was verified when the apply was loaded; the ids stay on the server.
      const entry = draft.experience.find((item) => item.id === question.itemId);
      return {
        section: 'EXPERIENCE',
        entry: {
          employer: entry?.employer ?? null,
          title: entry?.title ?? null,
          location: entry?.location ?? null,
          startDate: entry?.startDate ?? null,
          endDate: entry?.endDate ?? null,
          bullets: entry?.bullets ?? [],
        },
      };
    }
    case 'EDUCATION': {
      const entry = draft.education.find((item) => item.id === question.itemId);
      return {
        section: 'EDUCATION',
        entry: {
          institution: entry?.institution ?? null,
          qualification: entry?.qualification ?? null,
          startDate: entry?.startDate ?? null,
          endDate: entry?.endDate ?? null,
          details: entry?.details ?? null,
        },
      };
    }
  }
}
