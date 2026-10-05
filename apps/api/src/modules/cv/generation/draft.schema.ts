import { z } from 'zod';

/**
 * The persisted CV draft (`Cv.draft`). It is written only after validation and parsed again
 * with this schema on read, because database JSON is an external boundary.
 *
 * `null` means "the source did not support this fact" (FR-027). Empty strings are not allowed.
 */
const text = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => text(max).nullable();

export const experienceEntrySchema = z
  .object({
    id: z.string().min(1),
    employer: nullableText(200),
    title: nullableText(200),
    location: nullableText(120),
    startDate: nullableText(40),
    endDate: nullableText(40),
    bullets: z.array(text(300)).max(12),
  })
  .refine((entry) => entry.employer !== null || entry.title !== null, {
    message: 'An experience entry needs an employer or a title',
  });

export const educationEntrySchema = z
  .object({
    id: z.string().min(1),
    institution: nullableText(200),
    qualification: nullableText(200),
    startDate: nullableText(40),
    endDate: nullableText(40),
    details: nullableText(300),
  })
  .refine((entry) => entry.institution !== null || entry.qualification !== null, {
    message: 'An education entry needs an institution or a qualification',
  });

export const cvDraftSchema = z.object({
  schemaVersion: z.literal(1),
  contact: z.object({
    fullName: nullableText(120),
    email: nullableText(254),
    phone: nullableText(40),
    location: nullableText(120),
    links: z.array(text(200)).max(5),
  }),
  summary: nullableText(1200),
  experience: z.array(experienceEntrySchema).max(30),
  education: z.array(educationEntrySchema).max(10),
  skills: z.array(text(60)).max(60),
});

export type ExperienceEntry = z.output<typeof experienceEntrySchema>;
export type EducationEntry = z.output<typeof educationEntrySchema>;
export type CvDraft = z.output<typeof cvDraftSchema>;

/** At most this many clarification questions are stored per CV. */
export const MAX_QUESTIONS = 10;
export const MAX_QUESTION_TEXT = 300;
