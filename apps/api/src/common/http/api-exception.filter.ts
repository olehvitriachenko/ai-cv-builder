import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { describeError, errorCode } from '../errors.js';
import { ApiError, type FieldErrors } from './api-error.js';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  fieldErrors?: FieldErrors;
}

/**
 * Fastify request-parsing failures (malformed JSON, empty JSON body, ...). Nest's Fastify
 * adapter turns them into a plain `HttpException(message, statusCode)` and drops Fastify's
 * `FST_ERR_*` code, so they are recognised as the exact base class with a 4xx status. The app
 * itself never throws that class (it throws `ApiError`), and Nest's own subclasses such as
 * `NotFoundException` do not match.
 */
function isBodyParseError(error: unknown): boolean {
  if (!(error instanceof HttpException) || error.constructor !== HttpException) {
    return false;
  }
  const status = error.getStatus();
  return status >= 400 && status < 500;
}

/** Safe-to-log description of an unexpected error: never its message, stack or payload. */
function describeUnexpected(error: unknown): string {
  const code = errorCode(error);
  return code === undefined ? describeError(error) : `${describeError(error)} code=${code}`;
}

/**
 * Deliberately narrow: it handles only what this feature needs and is not a generic
 * mapper for Nest HttpException subtypes.
 *  1. ApiError                       -> as given
 *  2. Fastify body-parsing errors     -> 400 VALIDATION_ERROR
 *  3. Unknown-route NotFoundException -> 404 NOT_FOUND
 *  4. Anything else                  -> logged, generic 500 INTERNAL_ERROR
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const body = this.toBody(exception);
    void reply.status(body.statusCode).send(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof ApiError) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        ...(exception.fieldErrors ? { fieldErrors: exception.fieldErrors } : {}),
      };
    }

    if (isBodyParseError(exception)) {
      return { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Invalid request body' };
    }

    if (exception instanceof NotFoundException) {
      return { statusCode: 404, code: 'NOT_FOUND', message: 'Not found' };
    }

    this.logger.error(`Unexpected error: ${describeUnexpected(exception)}`);
    return { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
  }
}
