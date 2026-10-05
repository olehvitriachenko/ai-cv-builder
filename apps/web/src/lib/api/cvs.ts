import { z } from "zod";
import { apiFetch } from "./fetcher";

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

export const cvDraftSchema = z.object({
  schemaVersion: z.literal(1),
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
  skills: z.array(z.string()),
});
export type CvDraft = z.infer<typeof cvDraftSchema>;
export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;
export type EducationEntry = z.infer<typeof educationEntrySchema>;

export const clarificationQuestionSchema = z.object({
  id: z.string(),
  section: z.enum(["CONTACT", "SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS"]),
  itemId: z.string().nullable(),
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
  draft: cvDraftSchema,
  questions: z.array(clarificationQuestionSchema),
});
export type CvResult = z.infer<typeof cvResultSchema>;

/** `POST /api/cvs`: exactly one source, free text. The owner comes from the session cookie. */
export function createCvFromText(input: { targetRole: string; sourceText: string }): Promise<CvStatus> {
  return apiFetch("/cvs", { method: "POST", body: input, schema: cvStatusSchema });
}

/** `POST /api/cvs/upload`: exactly one source, a PDF (multipart). */
export function uploadCvPdf(input: { targetRole: string; file: File }): Promise<CvStatus> {
  const form = new FormData();
  form.append("targetRole", input.targetRole);
  form.append("file", input.file);
  return apiFetch("/cvs/upload", { method: "POST", body: form, schema: cvStatusSchema });
}

/** `GET /api/cvs/:id`: the polling target. `cookie` is only for server-side calls. */
export function getCvStatus(id: string, cookie?: string): Promise<CvStatus> {
  return apiFetch(`/cvs/${encodeURIComponent(id)}`, { schema: cvStatusSchema, cookie });
}

/** `GET /api/cvs/:id/result`: the draft with its clarification questions; 409 until COMPLETED. */
export function getCvResult(id: string): Promise<CvResult> {
  return apiFetch(`/cvs/${encodeURIComponent(id)}/result`, { schema: cvResultSchema });
}

/** `POST /api/cvs/:id/retry`: only for a FAILED CV; 409 `GENERATION_NOT_RETRYABLE` otherwise. */
export function retryCv(id: string): Promise<CvStatus> {
  return apiFetch(`/cvs/${encodeURIComponent(id)}/retry`, { method: "POST", schema: cvStatusSchema });
}

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

/** `GET /api/cvs`: the caller's CVs, newest update first. `cookie` is only for server-side calls. */
export function listCvs(cookie?: string): Promise<CvList> {
  return apiFetch("/cvs", { schema: cvListSchema, cookie });
}

/** `DELETE /api/cvs/:id`: 204. 409 `CV_GENERATION_ACTIVE` while generating; 404 when missing. */
export function deleteCv(id: string): Promise<void> {
  return apiFetch(`/cvs/${encodeURIComponent(id)}`, { method: "DELETE" });
}
