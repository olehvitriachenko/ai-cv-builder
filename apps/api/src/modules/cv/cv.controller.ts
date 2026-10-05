import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { createCvSchema, cvIdSchema, type CreateCvInput } from './schemas/cv.schemas.js';
import { cvDraftEditBodySchema, type CvDraftEditBody } from './schemas/draft-edit.schema.js';
import { answerBodySchema, applyBodySchema, questionIdSchema, type AnswerBody, type ApplyBody } from './clarification/question-state.js';
import { readPdfUpload } from './upload/cv-upload.js';
import type { CvListItem } from './list/cv-list.query.js';
import { ClarificationService, type QuestionResponse } from './services/clarification.service.js';
import { CvEditorService, type DraftSaveResponse } from './services/cv-editor.service.js';
import { CvService, type CvResultResponse, type CvStatusResponse } from './services/cv.service.js';

/**
 * Protected by the global auth guard. Caller identity comes only from `@CurrentUser()`; no
 * handler reads a user id from the body, query, route or headers.
 */
@Controller('cvs')
export class CvController {
  constructor(
    private readonly cvs: CvService,
    private readonly editor: CvEditorService,
    private readonly clarifications: ClarificationService,
  ) {}

  /** My CVs: the caller's CVs only, newest update first. No paging, no query parameters. */
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<{ items: CvListItem[] }> {
    return this.cvs.list(user.id);
  }

  /** Start a generation from free text. 202: accepted, not completed. */
  @Post()
  @HttpCode(202)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCvSchema)) body: CreateCvInput,
  ): Promise<CvStatusResponse> {
    return this.cvs.createFromText(user.id, body);
  }

  /**
   * Start a generation from a PDF (multipart). Authenticated by the global guard before the body
   * is read; the multipart body is parsed and validated by `readPdfUpload`, not a body pipe.
   */
  @Post('upload')
  @HttpCode(202)
  async upload(
    @CurrentUser() user: AuthUser,
    @Req() request: FastifyRequest,
  ): Promise<CvStatusResponse> {
    return this.cvs.createFromPdf(user.id, await readPdfUpload(request));
  }

  @Get(':id')
  getStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(cvIdSchema)) id: string,
  ): Promise<CvStatusResponse> {
    return this.cvs.findOwnedOrThrow(user.id, id);
  }

  /** The draft and its clarification questions; 409 until the CV is COMPLETED. */
  @Get(':id/result')
  getResult(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(cvIdSchema)) id: string,
  ): Promise<CvResultResponse> {
    return this.cvs.getResult(user.id, id);
  }

  /**
   * Replace the draft of a COMPLETED CV. `revision` is the one the edit is based on; a stale one is
   * a 409 and nothing is stored.
   */
  @Put(':id/draft')
  saveDraft(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(cvIdSchema)) id: string,
    @Body(new ZodValidationPipe(cvDraftEditBodySchema)) body: CvDraftEditBody,
  ): Promise<DraftSaveResponse> {
    return this.editor.updateDraft(user.id, id, body);
  }

  /** Answer a clarification question. The CV content and its revision do not change. */
  @Put(':id/questions/:questionId/answer')
  answerQuestion(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(cvIdSchema)) id: string,
    @Param('questionId', new ZodValidationPipe(questionIdSchema)) questionId: string,
    @Body(new ZodValidationPipe(answerBodySchema)) body: AnswerBody,
  ): Promise<QuestionResponse> {
    return this.clarifications.answer(user.id, id, questionId, body);
  }

  /** Close a question without applying it. Explicit user action only. */
  @Post(':id/questions/:questionId/dismiss')
  @HttpCode(200)
  dismissQuestion(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(cvIdSchema)) id: string,
    @Param('questionId', new ZodValidationPipe(questionIdSchema)) questionId: string,
  ): Promise<QuestionResponse> {
    return this.clarifications.dismiss(user.id, id, questionId);
  }

  /**
   * Apply an answered question to the part of the CV it concerns. `revision` is the one the person
   * is looking at; a stale one is a 409. The draft change and APPLIED commit together.
   */
  @Post(':id/questions/:questionId/apply')
  @HttpCode(200)
  applyQuestion(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(cvIdSchema)) id: string,
    @Param('questionId', new ZodValidationPipe(questionIdSchema)) questionId: string,
    @Body(new ZodValidationPipe(applyBodySchema)) body: ApplyBody,
  ): Promise<CvResultResponse> {
    return this.clarifications.apply(user.id, id, questionId, body);
  }

  /** Delete a COMPLETED or FAILED CV and its questions; 409 while it is generating. */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(cvIdSchema)) id: string,
  ): Promise<void> {
    return this.cvs.remove(user.id, id);
  }

  /** Re-run a FAILED generation. 202: accepted, PENDING again. */
  @Post(':id/retry')
  @HttpCode(202)
  retry(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(cvIdSchema)) id: string,
  ): Promise<CvStatusResponse> {
    return this.cvs.retry(user.id, id);
  }
}
