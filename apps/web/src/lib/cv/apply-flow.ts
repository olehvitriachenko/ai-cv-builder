import type { CvResult } from "@/lib/api/cvs";
import { isApiError } from "@/lib/api/fetcher";
import type { SaveState } from "./autosave";

/** The apply was not attempted (the form has errors, or the last save did not succeed). */
export class ApplyBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplyBlockedError";
  }
}

export interface ApplyDeps {
  /** Why applying is impossible right now (for example an invalid form), or null. */
  blockedReason: string | null;
  /** Sends any pending edit and resolves with the autosaver's final state. */
  flush: () => Promise<SaveState>;
  /** The apply request, based on the revision the flush left us on. */
  apply: (revision: number) => Promise<CvResult>;
}

/**
 * Apply an answer on top of what the person sees: their pending edits are saved first so the apply
 * runs on the latest revision and the server can never apply over text it has not seen. Nothing is
 * sent when the edits could not be saved.
 */
export async function applyAnswer({ blockedReason, flush, apply }: ApplyDeps): Promise<CvResult> {
  if (blockedReason !== null) {
    throw new ApplyBlockedError(blockedReason);
  }
  const final = await flush();
  if (final.status === "error") {
    throw new ApplyBlockedError("Your latest edits couldn’t be saved yet, so the answer wasn’t applied. Try saving again first.");
  }
  if (final.status === "conflict") {
    throw new ApplyBlockedError(
      final.failure === "gone"
        ? "This CV can’t be edited any more, so the answer wasn’t applied."
        : "This CV changed somewhere else. Resolve that first (load the latest version), then apply the answer.",
    );
  }
  return apply(final.revision);
}

export interface ApplyFailure {
  /** What to tell the person; never server text. */
  message: string;
  /** The CV or the question changed elsewhere: load the latest version. */
  reload: boolean;
}

export function applyErrorOutcome(error: unknown): ApplyFailure {
  if (isApiError(error, 409)) {
    if (error.code === "TARGET_NOT_APPLICABLE") {
      return {
        message: "That part of the CV was changed or removed, so the answer can’t be applied. Edit the CV yourself, or dismiss this question.",
        reload: false,
      };
    }
    if (error.code === "REVISION_CONFLICT" || error.code === "QUESTION_STATE_CONFLICT") {
      return {
        message: "This CV changed somewhere else, so the answer wasn’t applied. We loaded the latest version; apply it again if it still fits.",
        reload: true,
      };
    }
    if (error.code === "CV_NOT_EDITABLE") {
      return { message: "This CV can’t be edited any more, so the answer wasn’t applied.", reload: false };
    }
  }
  if (isApiError(error, 422) && error.code === "ANSWER_INVALID_FOR_FIELD") {
    return {
      message: "That answer doesn’t fit this field. Edit your answer, or dismiss the question and edit the CV by hand. Nothing was changed.",
      reload: false,
    };
  }
  if (isApiError(error, 422) && error.code === "APPLY_OUTPUT_INVALID") {
    return {
      message: "The AI couldn’t turn this answer into a safe change. Nothing was changed. Try again, edit your answer, or edit the CV by hand.",
      reload: false,
    };
  }
  if (isApiError(error, 503)) {
    return { message: "The AI assistant is unavailable right now. Nothing was changed; try again in a moment.", reload: false };
  }
  if (isApiError(error, 404)) {
    return { message: "This question no longer exists.", reload: true };
  }
  return { message: "We couldn’t apply that answer. Nothing was changed; try again.", reload: false };
}
