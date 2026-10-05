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
      missing: z.string(),
      question: z.string(),
    }),
  ),
});

export type LlmCvOutput = z.output<typeof llmCvOutputSchema>;
export type QuestionSectionName = (typeof QUESTION_SECTIONS)[number];
