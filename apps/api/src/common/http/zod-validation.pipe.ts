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
        // The full path joined with dots: `targetRole` for a top-level field (as before) and
        // `draft.experience.0.bullets.2` for a nested one. Issues on the root have no key.
        const field = issue.path.map(String).join('.');
        if (field !== '') {
          (fieldErrors[field] ??= []).push(issue.message);
        }
      }
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', fieldErrors);
    }

    return result.data;
  }
}
