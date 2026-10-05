import { PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { ApiError, type FieldErrors } from './api-error.js';

/**
 * Parses untrusted input with a Zod schema. Invalid input never reaches business logic;
 * valid input is returned in its parsed form (unknown keys stripped, values normalised).
 */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') {
          (fieldErrors[field] ??= []).push(issue.message);
        }
      }
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', fieldErrors);
    }

    return result.data;
  }
}
