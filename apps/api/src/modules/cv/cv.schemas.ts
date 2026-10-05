import { z } from 'zod';
import {
  MAX_SOURCE_CHARS,
  MAX_TARGET_ROLE_CHARS,
  MIN_SOURCE_CHARS,
} from '../../common/source-limits.js';

function requiredText(label: string) {
  return z.string({
    error: (issue) =>
      issue.input === undefined ? `${label} is required` : `${label} must be text`,
  });
}

export const targetRoleSchema = requiredText('Target role')
  .trim()
  .min(1, 'Target role must not be blank')
  .max(MAX_TARGET_ROLE_CHARS, `Target role must be at most ${MAX_TARGET_ROLE_CHARS} characters`);

// NUL cannot be stored in a PostgreSQL text column, so it is removed before measuring.
export const sourceTextSchema = requiredText('Source text')
  .transform((value) => value.replaceAll('\u0000', ''))
  .pipe(
    z
      .string()
      .trim()
      .min(MIN_SOURCE_CHARS, `Source text must be at least ${MIN_SOURCE_CHARS} characters`)
      .max(MAX_SOURCE_CHARS, `Source text must be at most ${MAX_SOURCE_CHARS} characters`),
  );

/** Start a generation from free text. Unknown keys (such as a client `userId`) are stripped. */
export const createCvSchema = z.object({
  targetRole: targetRoleSchema,
  sourceText: sourceTextSchema,
});

export type CreateCvInput = z.output<typeof createCvSchema>;

/** Route parameter: Prisma generates cuid ids. */
export const cvIdSchema = z.cuid({ error: 'Invalid CV id' });
