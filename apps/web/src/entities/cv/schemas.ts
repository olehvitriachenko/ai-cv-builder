import { z } from "zod";

// Mirrors specs/002-cv-ai-generation/contracts/cv-generation-api.md. Every response is parsed
// with these schemas, so nothing from the network is trusted by type alone.

export const generationStatusSchema = z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]);
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const failureReasonSchema = z.enum([
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_NOT_CONFIGURED",
  "INVALID_OUTPUT",
  "TIMED_OUT",
  "INTERRUPTED",
  "UNKNOWN",
]);
export type FailureReason = z.infer<typeof failureReasonSchema>;

export const cvStatusSchema = z.object({
  id: z.string(),
  targetRole: z.string(),
  sourceType: z.enum(["FREE_TEXT", "PDF"]),
  status: generationStatusSchema,
  failureReason: failureReasonSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type CvStatus = z.infer<typeof cvStatusSchema>;

const experienceEntrySchema = z.object({
  id: z.string(),
  employer: z.string().nullable(),
  title: z.string().nullable(),
  location: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  bullets: z.array(z.string()),
});

const educationEntrySchema = z.object({
  id: z.string(),
  institution: z.string().nullable(),
  qualification: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  details: z.string().nullable(),
});

export const skillCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  skills: z.array(z.string()),
});

export const cvDraftSchema = z.object({
  schemaVersion: z.literal(2),
  contact: z.object({
    fullName: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    links: z.array(z.string()),
  }),
  summary: z.string().nullable(),
  experience: z.array(experienceEntrySchema),
  education: z.array(educationEntrySchema),
  skillCategories: z.array(skillCategorySchema),
});
export type CvDraft = z.infer<typeof cvDraftSchema>;
export type SkillCategory = z.infer<typeof skillCategorySchema>;
export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;
export type EducationEntry = z.infer<typeof educationEntrySchema>;

export const clarificationQuestionSchema = z.object({
  id: z.string(),
  section: z.enum(["CONTACT", "SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS"]),
  itemId: z.string().nullable(),
  field: z.enum([
    "CONTACT_FULL_NAME", "CONTACT_EMAIL", "CONTACT_PHONE", "CONTACT_LOCATION", "CONTACT_LINK",
    "EXPERIENCE_EMPLOYER", "EXPERIENCE_TITLE", "EXPERIENCE_LOCATION", "EXPERIENCE_START_DATE", "EXPERIENCE_END_DATE",
    "EDUCATION_INSTITUTION", "EDUCATION_QUALIFICATION", "EDUCATION_START_DATE", "EDUCATION_END_DATE",
  ]).nullable().optional(),
  missing: z.string(),
  question: z.string(),
  status: z.enum(["UNANSWERED", "ANSWERED", "APPLIED", "DISMISSED"]),
  answer: z.string().nullable(),
});
export type ClarificationQuestion = z.infer<typeof clarificationQuestionSchema>;

export const cvResultSchema = z.object({
  id: z.string(),
  status: z.literal("COMPLETED"),
  revision: z.number().int().nonnegative(),
  targetRole: z.string(),
  draft: cvDraftSchema,
  questions: z.array(clarificationQuestionSchema),
});
export type CvResult = z.infer<typeof cvResultSchema>;

export const displayStatusSchema = z.enum(["PROCESSING", "FAILED", "DRAFT", "COMPLETED"]);
export type DisplayStatus = z.infer<typeof displayStatusSchema>;

/** One My CVs card, as the server derives it: the client never inspects drafts or questions. */
export const cvListItemSchema = z.object({
  id: z.string(),
  targetRole: z.string(),
  status: generationStatusSchema,
  displayStatus: displayStatusSchema,
  failureReason: failureReasonSchema.nullable(),
  /** Server-decided: true only when `POST /cvs/:id/retry` would be accepted. */
  canRetry: z.boolean(),
  updatedAt: z.string(),
  candidateName: z.string().nullable(),
  openQuestionsCount: z.number().int().nonnegative(),
});
export type CvListItem = z.infer<typeof cvListItemSchema>;

export const cvListSchema = z.object({ items: z.array(cvListItemSchema) });
export type CvList = z.infer<typeof cvListSchema>;

export const draftSaveSchema = z.object({
  revision: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
