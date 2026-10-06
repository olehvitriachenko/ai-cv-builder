import { apiFetch } from "@/shared/api/fetcher";

/** `DELETE /api/cvs/:id`: 204. 409 `CV_GENERATION_ACTIVE` while generating; 404 when missing. */
export function deleteCv(id: string): Promise<void> {
  return apiFetch(`/cvs/${encodeURIComponent(id)}`, { method: "DELETE" });
}
