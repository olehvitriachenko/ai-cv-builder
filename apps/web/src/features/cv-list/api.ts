import { apiFetch } from "@/shared/api/fetcher";
import { cvListSchema, type CvList } from "@/entities/cv/schemas";

/** `GET /api/cvs`: the caller's CVs, newest update first. `cookie` is only for server-side calls. */
export function listCvs(cookie?: string): Promise<CvList> {
  return apiFetch("/cvs", { schema: cvListSchema, cookie });
}
