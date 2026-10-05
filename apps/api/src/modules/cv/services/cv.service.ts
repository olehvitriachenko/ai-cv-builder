import { Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/http/api-error.js';
import { MAX_PDF_PAGES, MAX_SOURCE_CHARS } from '../../../common/source-limits.js';
import type {
  FailureReason,
  GenerationStatus,
  QuestionSection,
  QuestionStatus,
  SourceType,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../infrastructure/index.js';
import {
  PdfExtractionError,
  PdfTextExtractor,
  type PdfExtractionFailure,
} from '../../pdf/pdf-text-extractor.service.js';
import type { CreateCvInput } from '../schemas/cv.schemas.js';
import { listCvsForUser, type CvListItem } from '../list/cv-list.query.js';
import { canRetryGeneration } from '../retry-rule.js';
import { cvDraftSchema, type CvDraft } from '../generation/draft.schema.js';
import { GenerationRunner } from '../generation/generation-runner.service.js';
import type { PdfUploadInput } from '../upload/cv-upload.js';

/**
 * Public status resource of a CV (the polling target). Deliberately has no `userId`,
 * `sourceText` or `failureDetail`.
 */
export interface CvStatusResponse {
  id: string;
  targetRole: string;
  sourceType: SourceType;
  status: GenerationStatus;
  failureReason: FailureReason | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

const STATUS_SELECT = {
  id: true,
  targetRole: true,
  sourceType: true,
  generationStatus: true,
  generationAttempts: true,
  failureReason: true,
  createdAt: true,
  updatedAt: true,
  processingStartedAt: true,
  finishedAt: true,
} as const;

interface StatusRow {
  id: string;
  targetRole: string;
  sourceType: SourceType;
  generationStatus: GenerationStatus;
  failureReason: FailureReason | null;
  createdAt: Date;
  updatedAt: Date;
  processingStartedAt: Date | null;
  finishedAt: Date | null;
}

export function toStatusResponse(row: StatusRow): CvStatusResponse {
  return {
    id: row.id,
    targetRole: row.targetRole,
    sourceType: row.sourceType,
    status: row.generationStatus,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.processingStartedAt,
    finishedAt: row.finishedAt,
  };
}

/** The draft with its clarification questions: the single result resource of a COMPLETED CV. */
export interface CvResultResponse {
  id: string;
  status: 'COMPLETED';
  /** Send back with every draft save and apply (optimistic concurrency). */
  revision: number;
  draft: CvDraft;
  questions: {
    id: string;
    section: QuestionSection;
    itemId: string | null;
    missing: string;
    question: string;
    status: QuestionStatus;
    answer: string | null;
  }[];
}

const EXTRACTION_MESSAGES: Record<PdfExtractionFailure, string> = {
  too_many_pages: `The PDF must have ${MAX_PDF_PAGES} pages or fewer.`,
  unreadable: 'The PDF could not be read. It may be corrupt.',
  encrypted: 'The PDF is password-protected. Upload an unprotected copy.',
  empty:
    'No readable text was found in the PDF. Scanned or image-only PDFs are not supported; upload a text-based PDF.',
  too_long: `The PDF contains more than ${MAX_SOURCE_CHARS.toLocaleString('en-US')} characters of text, which is too long.`,
};

@Injectable()
export class CvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfTextExtractor,
    private readonly runner: GenerationRunner,
  ) {}

  /** The caller's CVs for My CVs, most recently updated first. The owner is the session user. */
  async list(userId: string): Promise<{ items: CvListItem[] }> {
    return { items: await listCvsForUser(this.prisma, userId) };
  }

  /** Start a generation from free text. */
  createFromText(userId: string, input: CreateCvInput): Promise<CvStatusResponse> {
    return this.createPending(userId, input.targetRole, 'FREE_TEXT', input.sourceText);
  }

  /**
   * Start a generation from a PDF. Only the extracted text is kept; the bytes are discarded when
   * the request ends. Text that cannot be used is an ingestion failure (422): nothing is created.
   */
  async createFromPdf(userId: string, input: PdfUploadInput): Promise<CvStatusResponse> {
    let sourceText: string;
    try {
      sourceText = await this.pdf.extract(input.buffer);
    } catch (error) {
      if (error instanceof PdfExtractionError) {
        throw new ApiError(422, 'PDF_EXTRACTION_FAILED', EXTRACTION_MESSAGES[error.kind]);
      }
      throw error;
    }
    return this.createPending(userId, input.targetRole, 'PDF', sourceText);
  }

  /**
   * Persists the CV and its source as PENDING before any AI work. The owner is always the
   * authenticated user passed in, never a value from the request.
   */
  private async createPending(
    userId: string,
    targetRole: string,
    sourceType: SourceType,
    sourceText: string,
  ): Promise<CvStatusResponse> {
    const cv = await this.prisma.cv.create({
      data: { userId, targetRole, sourceType, sourceText, generationStatus: 'PENDING' },
      select: STATUS_SELECT,
    });
    // Persisted first; the response does not wait for the generation.
    this.runner.kick();
    return toStatusResponse(cv);
  }

  /**
   * The single ownership gate for CV reads. The owner is part of the query, so "not found" and
   * "not owned" are the same code path and the same response (no existence leak).
   *
   * All future read, update, delete, generation, clarification and export operations MUST load
   * the CV through this method (FR-031).
   */
  async findOwnedOrThrow(userId: string, cvId: string): Promise<CvStatusResponse> {
    return toStatusResponse(await this.findOwnedRowOrThrow(userId, cvId));
  }

  private async findOwnedRowOrThrow(userId: string, cvId: string) {
    const cv = await this.prisma.cv.findFirst({
      where: { id: cvId, userId },
      select: STATUS_SELECT,
    });

    if (!cv) {
      throw new ApiError(404, 'CV_NOT_FOUND', 'CV not found');
    }
    return cv;
  }

  /**
   * The persisted draft and its clarification questions. Loaded through the ownership gate, so a
   * foreign CV is the same 404 as a missing one; anything not COMPLETED has no draft (409).
   */
  async getResult(userId: string, cvId: string): Promise<CvResultResponse> {
    const status = await this.findOwnedOrThrow(userId, cvId);
    const notReady = new ApiError(
      409,
      'GENERATION_NOT_READY',
      'The CV has not finished generating',
    );
    if (status.status !== 'COMPLETED') {
      throw notReady;
    }

    const cv = await this.prisma.cv.findFirst({
      where: { id: cvId, userId, generationStatus: 'COMPLETED' },
      select: {
        id: true,
        draft: true,
        revision: true,
        questions: {
          orderBy: { position: 'asc' },
          // `field` is internal (how an answer is applied) and is never returned.
          select: {
            id: true,
            section: true,
            itemId: true,
            missing: true,
            question: true,
            status: true,
            answer: true,
          },
        },
      },
    });
    if (!cv) {
      throw notReady;
    }

    // Database JSON is an external boundary: parse it again. A stored draft that no longer
    // matches the schema is a server fault, answered by the generic 500 (nothing is echoed).
    return {
      id: cv.id,
      status: 'COMPLETED',
      revision: cv.revision,
      draft: cvDraftSchema.parse(cv.draft),
      questions: cv.questions,
    };
  }

  /**
   * Re-runs a FAILED generation on the stored source. The ownership gate answers a foreign or
   * missing CV with the usual 404; the update itself is also constrained by owner and status, so
   * two quick retries can only win once. `generationAttempts` is deliberately not reset: it is the
   * fencing token that keeps a stale worker of the previous attempt from touching the new one.
   */
  async retry(userId: string, cvId: string): Promise<CvStatusResponse> {
    const observed = await this.findOwnedRowOrThrow(userId, cvId);
    const notRetryable = new ApiError(
      409,
      'GENERATION_NOT_RETRYABLE',
      'Only the observed failed generation can be retried',
    );
    if (!canRetryGeneration(observed.generationStatus)) {
      throw notRetryable;
    }

    const [retried] = await this.prisma.cv.updateManyAndReturn({
      where: {
        id: cvId,
        userId,
        generationStatus: 'FAILED',
        // Bind this request to the failure it observed, even if another retry already failed.
        generationAttempts: observed.generationAttempts,
      },
      data: {
        generationStatus: 'PENDING',
        failureReason: null,
        failureDetail: null,
        processingStartedAt: null,
        finishedAt: null,
      },
      select: STATUS_SELECT,
    });
    if (!retried) {
      throw notRetryable;
    }

    this.runner.kick();
    return toStatusResponse(retried);
  }
}
