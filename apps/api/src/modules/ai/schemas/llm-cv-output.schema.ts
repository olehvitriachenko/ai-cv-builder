import { z } from 'zod';

/**
 * What the model is asked to return. It is deliberately looser than the persisted `CvDraft`:
 * no ids (the server assigns them, so the model cannot invent or collide ids) and no size caps
 * (structured output supports only a subset of JSON Schema). Caps and invariants are enforced by
 * our own draft schema and domain validation afterwards.
 *
 * Every fact-bearing field is nullable: `null` means "the source does not say".
 */
export const QUESTION_SECTIONS = [
  'CONTACT',
  'SUMMARY',
  'EXPERIENCE',
  'EDUCATION',
  'SKILLS',
] as const;

/**
 * The single plain value a question's answer fills, when there is exactly one. A field lets the
 * answer be applied deterministically (no AI call). Values are prefixed by the question section.
 * Mirrors the Prisma `QuestionField` enum (a compile-time check in the mapper keeps them in step).
 */
export const QUESTION_FIELDS = [
  'CONTACT_FULL_NAME',
  'CONTACT_EMAIL',
  'CONTACT_PHONE',
  'CONTACT_LOCATION',
  'CONTACT_LINK',
  'EXPERIENCE_EMPLOYER',
  'EXPERIENCE_TITLE',
  'EXPERIENCE_LOCATION',
  'EXPERIENCE_START_DATE',
  'EXPERIENCE_END_DATE',
  'EDUCATION_INSTITUTION',
  'EDUCATION_QUALIFICATION',
  'EDUCATION_START_DATE',
  'EDUCATION_END_DATE',
] as const;

export const llmCvOutputSchema = z.object({
  contact: z.object({
    fullName: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    links: z.array(z.string()),
  }),
  summary: z.string().nullable(),
  experience: z.array(
    z.object({
      employer: z.string().nullable(),
      title: z.string().nullable(),
      location: z.string().nullable(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string().nullable(),
      qualification: z.string().nullable(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      details: z.string().nullable(),
    }),
  ),
  skills: z.array(z.string()),
  questions: z.array(
    z.object({
      section: z.enum(QUESTION_SECTIONS),
      // Zero-based position of the entry inside its section; null for section-level questions.
      itemIndex: z.number().int().nullable(),
      // The one plain value the answer fills (see QUESTION_FIELDS); null when the answer is not a
      // single value for exactly one field. Always present: structured output returns every key.
      field: z.enum(QUESTION_FIELDS).nullable(),
      missing: z.string(),
      question: z.string(),
    }),
  ),
});

export type LlmCvOutput = z.output<typeof llmCvOutputSchema>;
export type QuestionSectionName = (typeof QUESTION_SECTIONS)[number];
export type QuestionFieldName = (typeof QUESTION_FIELDS)[number];
