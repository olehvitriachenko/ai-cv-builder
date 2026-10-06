import { apiFetch } from "@/shared/api/fetcher";
import { cvStatusSchema, type CvStatus } from "@/entities/cv/schemas";

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

/** `POST /api/cvs/:id/retry`: only for a FAILED CV; 409 `GENERATION_NOT_RETRYABLE` otherwise. */
export function retryCv(id: string): Promise<CvStatus> {
  return apiFetch(`/cvs/${encodeURIComponent(id)}/retry`, { method: "POST", schema: cvStatusSchema });
}
