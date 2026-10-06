import { z } from 'zod';
import { FALLBACK_SKILL_CATEGORY, SKILL_CATEGORY_NAMES } from '../catalogue/skill-categories.js';

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

/** The optional sections the model may return, as the `section` of an item. */
export const OPTIONAL_ITEM_SECTIONS = ['language', 'certification', 'portfolio', 'hobby', 'custom'] as const;
export type OptionalItemSection = (typeof OPTIONAL_ITEM_SECTIONS)[number];

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
  // Skills grouped under the closed set of predefined categories; `Skills` is the fallback for
  // anything that fits none. The model never invents category names or ids.
  skillCategories: z.array(
    z.strictObject({
      category: z.enum([...SKILL_CATEGORY_NAMES, FALLBACK_SKILL_CATEGORY]),
      skills: z.array(z.string()),
    }),
  ),
  // Optional sections (feature 007) as ONE list of items. Five arrays of their own did not fit the
  // provider's compiled-grammar limit ("The compiled grammar is too large"), one list does. Every
  // value is a plain string, "" meaning "the source does not say" (nullable fields would also
  // exceed the provider's 16 union parameters). The mapper sorts the items into their sections:
  //   language       name = the language,      detail = its level (A1..C2 or "Native speaker")
  //   certification  name,                     detail = the issuer,      date, link
  //   portfolio      name = the project,       detail = its description, link
  //   hobby          name
  //   custom         name = the section title, detail = its text
  optionalItems: z
    .array(
      z.object({
        section: z.enum(OPTIONAL_ITEM_SECTIONS),
        name: z.string(),
        detail: z.string(),
        date: z.string(),
        link: z.string(),
      }),
    )
    .optional(),
  questions: z.array(
    z.object({
      section: z.enum(QUESTION_SECTIONS),
      // Zero-based position of the entry inside its section; null for section-level questions.
      itemIndex: z.number().int().nullable(),
      // Omit when there is no single-value target. Optional rather than nullable keeps the
      // provider schema within its 16-union limit; persistence still represents absence as null.
      field: z.enum(QUESTION_FIELDS).optional(),
      missing: z.string(),
      question: z.string(),
    }),
  ),
});

export type LlmCvOutput = z.output<typeof llmCvOutputSchema>;
export type QuestionSectionName = (typeof QUESTION_SECTIONS)[number];
export type QuestionFieldName = (typeof QUESTION_FIELDS)[number];
