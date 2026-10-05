import { HttpException } from '@nestjs/common';

export type FieldErrors = Record<string, string[]>;

/**
 * The one exception type thrown by services, pipes and guards. The exception filter
 * serializes it as `{ statusCode, code, message, fieldErrors? }`.
 */
export class ApiError extends HttpException {
  readonly code: string;
  readonly fieldErrors?: FieldErrors;

  constructor(statusCode: number, code: string, message: string, fieldErrors?: FieldErrors) {
    super({ statusCode, code, message }, statusCode);
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
