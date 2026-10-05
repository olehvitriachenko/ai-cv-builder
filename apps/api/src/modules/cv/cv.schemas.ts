import { z } from 'zod';

export const createCvSchema = z.object({
  targetRole: z
    .string({ error: 'Target role must be text' })
    .trim()
    .min(1, 'Target role must not be blank')
    .max(200, 'Target role must be at most 200 characters')
    .optional(),
});

export type CreateCvInput = z.output<typeof createCvSchema>;

/** Route parameter: Prisma generates cuid ids. */
export const cvIdSchema = z.cuid({ error: 'Invalid CV id' });
