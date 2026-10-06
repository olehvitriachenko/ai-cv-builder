import { apiFetch } from "@/shared/api/fetcher";
import { clarificationQuestionSchema, cvResultSchema, type ClarificationQuestion, type CvResult } from "@/entities/cv/schemas";

/** `PUT /api/cvs/:id/questions/:questionId/answer`: saves the answer; the CV content is unchanged. */
export function answerQuestion(cvId: string, questionId: string, answer: string): Promise<ClarificationQuestion> {
  return apiFetch(`/cvs/${encodeURIComponent(cvId)}/questions/${encodeURIComponent(questionId)}/answer`, {
    method: "PUT",
    body: { answer },
    schema: clarificationQuestionSchema,
  });
}

/** `POST /api/cvs/:id/questions/:questionId/dismiss`: closes a question without changing the CV. */
export function dismissQuestion(cvId: string, questionId: string): Promise<ClarificationQuestion> {
  return apiFetch(`/cvs/${encodeURIComponent(cvId)}/questions/${encodeURIComponent(questionId)}/dismiss`, {
    method: "POST",
    schema: clarificationQuestionSchema,
  });
}

/**
 * `POST /api/cvs/:id/questions/:questionId/apply`: writes an answered question into the CV and
 * marks it applied, atomically. `revision` is the one the person is looking at. Returns the new
 * result (draft, revision, questions); the server's reply replaces the client's state.
 */
export function applyQuestion(cvId: string, questionId: string, revision: number): Promise<CvResult> {
  return apiFetch(`/cvs/${encodeURIComponent(cvId)}/questions/${encodeURIComponent(questionId)}/apply`, {
    method: "POST",
    body: { revision },
    schema: cvResultSchema,
  });
}
