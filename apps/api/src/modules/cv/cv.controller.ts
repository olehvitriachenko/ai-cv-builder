import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { createCvSchema, cvIdSchema, type CreateCvInput } from './cv.schemas.js';
import { CvService, type CvResponse } from './cv.service.js';

/**
 * Protected by the global auth guard. Caller identity comes only from `@CurrentUser()`; no
 * handler reads a user id from the body, query, route or headers.
 */
@Controller('cvs')
export class CvController {
  constructor(private readonly cvs: CvService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCvSchema)) body: CreateCvInput,
  ): Promise<CvResponse> {
    return this.cvs.create(user.id, body);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(cvIdSchema)) id: string,
  ): Promise<CvResponse> {
    return this.cvs.findOwnedOrThrow(user.id, id);
  }
}
