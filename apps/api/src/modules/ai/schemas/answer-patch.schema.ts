import { z } from 'zod';
import type { QuestionSectionName } from './llm-cv-output.schema.js';

/**
 * What the model returns when it turns one clarification answer into CV wording. It is deliberately
 * small and additive: one object per section, no paths, no ids, no operations, so the model can
 * only offer values for fields the server already chose. `null` or an empty list means "nothing to
 * add here". The server decides what is allowed to land (see `applyAnswerPatch`): a scalar fills an
 * empty field only, lists are appended to.
 *
 * Strict objects: an unknown key (for example a path or an id) fails validation instead of being
 * ignored. Every key is required because structured output returns every property.
 */
const text = z.string().nullable();

export const contactPatchSchema = z.strictObject({
  fullName: text,
  email: text,
  phone: text,
  location: text,
  links: z.array(z.string()),
});

export const summaryPatchSchema = z.strictObject({ summary: text });

export const experiencePatchSchema = z.strictObject({
  employer: text,
  title: text,
  location: text,
  startDate: text,
  endDate: text,
  bullets: z.array(z.string()),
});

export const educationPatchSchema = z.strictObject({
  institution: text,
  qualification: text,
  startDate: text,
  endDate: text,
  details: text,
});

/**
 * Skills to add, per category. `category` is free text on purpose: it may name an existing custom
 * category of the person; whether a new category name is allowed is decided when the patch is applied.
 */
export const skillsPatchSchema = z.strictObject({
  additions: z.array(z.strictObject({ category: z.string(), skills: z.array(z.string()) })),
});

export const answerPatchSchemas = {
  CONTACT: contactPatchSchema,
  SUMMARY: summaryPatchSchema,
  EXPERIENCE: experiencePatchSchema,
  EDUCATION: educationPatchSchema,
  SKILLS: skillsPatchSchema,
} as const satisfies Record<QuestionSectionName, z.ZodType>;

export type AnswerPatch =
  | z.output<typeof contactPatchSchema>
  | z.output<typeof summaryPatchSchema>
  | z.output<typeof experiencePatchSchema>
  | z.output<typeof educationPatchSchema>
  | z.output<typeof skillsPatchSchema>;
