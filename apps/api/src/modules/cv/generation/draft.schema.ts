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

/** Caps for skills: at most this many categories and this many skills across all of them. */
export const MAX_SKILL_CATEGORIES = 12;
export const MAX_SKILLS = 60;

/**
 * An ordered group of skills under a name. A stored category can be empty (the editor drops empty
 * ones before saving); uniqueness of names and skills is a rule of the write path (the edit body
 * schema), so reading never fails on data the migration or the model produced.
 */
export const skillCategorySchema = z.object({
  id: z.string().min(1),
  name: text(60),
  skills: z.array(text(60)).max(MAX_SKILLS),
});

/** Optional sections (feature 007). Each stays absent-or-empty until the person adds an entry. */
export const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native speaker'] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];

export const MAX_LANGUAGES = 12;
export const MAX_CERTIFICATIONS = 15;
export const MAX_PORTFOLIO = 8;
export const MAX_HOBBIES = 15;
export const MAX_CUSTOM_SECTIONS = 3;

export const languageEntrySchema = z.object({
  id: z.string().min(1),
  name: text(60),
  level: z.enum(LANGUAGE_LEVELS).nullable(),
});

export const certificationEntrySchema = z.object({
  id: z.string().min(1),
  name: text(120),
  issuer: nullableText(120),
  /** A month and year ("Jun 2024") or a year, like the other dates of the draft. */
  date: nullableText(40),
  link: nullableText(200),
});

export const portfolioEntrySchema = z.object({
  id: z.string().min(1),
  name: text(120),
  link: nullableText(200),
  description: nullableText(300),
});

export const customSectionSchema = z.object({
  id: z.string().min(1),
  title: text(60),
  /** Line breaks are kept; the string is trimmed as a whole. */
  content: text(1200),
});

export const cvDraftSchema = z
  .object({
    schemaVersion: z.literal(2),
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
    skillCategories: z.array(skillCategorySchema).max(MAX_SKILL_CATEGORIES),
    // A draft stored before the optional sections existed has none of these: they read as empty.
    languages: z.array(languageEntrySchema).max(MAX_LANGUAGES).default([]),
    certifications: z.array(certificationEntrySchema).max(MAX_CERTIFICATIONS).default([]),
    portfolio: z.array(portfolioEntrySchema).max(MAX_PORTFOLIO).default([]),
    hobbies: z.array(text(60)).max(MAX_HOBBIES).default([]),
    customSections: z.array(customSectionSchema).max(MAX_CUSTOM_SECTIONS).default([]),
  })
  .refine(
    (draft) =>
      draft.skillCategories.reduce((total, category) => total + category.skills.length, 0) <=
      MAX_SKILLS,
    { message: 'Too many skills in total', path: ['skillCategories'] },
  );

export type SkillCategory = z.output<typeof skillCategorySchema>;
export type ExperienceEntry = z.output<typeof experienceEntrySchema>;
export type EducationEntry = z.output<typeof educationEntrySchema>;
export type LanguageEntry = z.output<typeof languageEntrySchema>;
export type CertificationEntry = z.output<typeof certificationEntrySchema>;
export type PortfolioEntry = z.output<typeof portfolioEntrySchema>;
export type CustomSection = z.output<typeof customSectionSchema>;
export type CvDraft = z.output<typeof cvDraftSchema>;

/** At most this many clarification questions are stored per CV. */
export const MAX_QUESTIONS = 10;
export const MAX_QUESTION_TEXT = 300;
