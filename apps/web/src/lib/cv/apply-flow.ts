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

/** What the person can do next after a failed apply (Figma "Apply failed · four causes"). */
export type ApplyAction =
  | "retry_later"
  | "edit_manually"
  | "re_answer"
  | "review_section"
  | "dismiss"
  | "review_latest"
  | "retry_after_review";

export const APPLY_ACTION_LABELS: Record<ApplyAction, string> = {
  retry_later: "Retry later",
  edit_manually: "Edit manually",
  re_answer: "Re-answer",
  review_section: "Review section",
  dismiss: "Dismiss",
  review_latest: "Review latest",
  retry_after_review: "Retry after review",
};

export type ApplyFailureKind =
  | "ai_unavailable"
  | "output_invalid"
  | "target_stale"
  | "revision_conflict"
  | "answer_invalid"
  | "question_changed"
  | "not_editable"
  | "gone"
  | "other";

export interface ApplyFailure {
  kind: ApplyFailureKind;
  /** What to tell the person; never server text. */
  message: string;
  /** The CV or the question changed elsewhere in a way only a reload explains: load the latest version. */
  reload: boolean;
  /** The recovery actions to offer, in order. The answer and the CV draft are always retained. */
  actions: ApplyAction[];
}

/** The failure of an apply as the card shows it (thrown to it by the editor's apply flow). */
export class ApplyFailureError extends Error {
  constructor(readonly failure: ApplyFailure) {
    super(failure.message);
    this.name = "ApplyFailureError";
  }
}

/** Maps an apply error to its message and recovery actions; `target` names the section for a stale target. */
export function applyErrorOutcome(error: unknown, target: string | null = null): ApplyFailure {
  if (isApiError(error, 409)) {
    if (error.code === "TARGET_NOT_APPLICABLE") {
      return {
        kind: "target_stale",
        message: `The ${target ?? "target"} section changed since this question was created. Review the current section before deciding.`,
        reload: false,
        actions: ["review_section", "dismiss"],
      };
    }
    if (error.code === "REVISION_CONFLICT") {
      return {
        kind: "revision_conflict",
        message: "A newer saved CV revision is available. Compare it with your draft before retrying.",
        reload: false,
        actions: ["review_latest", "retry_after_review"],
      };
    }
    if (error.code === "QUESTION_STATE_CONFLICT") {
      return {
        kind: "question_changed",
        message: "This question changed somewhere else, so the answer wasn’t applied. We loaded the latest version; apply it again if it still fits.",
        reload: true,
        actions: [],
      };
    }
    if (error.code === "CV_NOT_EDITABLE") {
      return { kind: "not_editable", message: "This CV can’t be edited any more, so the answer wasn’t applied.", reload: false, actions: [] };
    }
  }
  if (isApiError(error, 422) && error.code === "ANSWER_INVALID_FOR_FIELD") {
    return {
      kind: "answer_invalid",
      message: "That answer doesn’t fit this field. Edit your answer, or dismiss the question and edit the CV by hand. Nothing was changed.",
      reload: false,
      actions: ["re_answer", "dismiss"],
    };
  }
  if (isApiError(error, 422) && error.code === "APPLY_OUTPUT_INVALID") {
    return {
      kind: "output_invalid",
      message: "The output could not be validated. No unconfirmed wording was applied.",
      reload: false,
      actions: ["re_answer", "edit_manually"],
    };
  }
  if (isApiError(error, 503)) {
    return {
      kind: "ai_unavailable",
      message: "The AI service is unavailable. Your answer and CV draft are retained.",
      reload: false,
      actions: ["retry_later", "edit_manually"],
    };
  }
  if (isApiError(error, 404)) {
    return { kind: "gone", message: "This question no longer exists.", reload: true, actions: [] };
  }
  return {
    kind: "other",
    message: "We couldn’t apply that answer. Nothing was changed; try again.",
    reload: false,
    actions: [],
  };
}
