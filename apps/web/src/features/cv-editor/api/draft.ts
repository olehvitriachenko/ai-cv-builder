import { apiFetch } from "@/shared/api/fetcher";
import { cvResultSchema, draftSaveSchema, type CvResult, type CvDraft } from "@/entities/cv/schemas";

/** `GET /api/cvs/:id/result`: the draft with its clarification questions; 409 until COMPLETED. */
export function getCvResult(id: string, cookie?: string): Promise<CvResult> {
  return apiFetch(`/cvs/${encodeURIComponent(id)}/result`, { schema: cvResultSchema, cookie });
}

/**
 * `PUT /api/cvs/:id/draft`: replaces the draft of a COMPLETED CV. `revision` is the one the edit is
 * based on; a stale one is `409 REVISION_CONFLICT` and nothing is stored. `targetRole`, when given,
 * is saved in the same write.
 */
export function saveDraft(id: string, input: { revision: number; draft: CvDraft; targetRole?: string }): Promise<{ revision: number }> {
  return apiFetch(`/cvs/${encodeURIComponent(id)}/draft`, { method: "PUT", body: input, schema: draftSaveSchema });
}
