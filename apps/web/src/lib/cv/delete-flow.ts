import type { CvListItem } from "@/lib/api/cvs";
import { isApiError } from "@/shared/api/fetcher";
import { cardName } from "./card-copy";

/** Only finished CVs can be deleted; a generating CV would race with the generation. */
export function canDelete(item: Pick<CvListItem, "status">): boolean {
  return item.status === "COMPLETED" || item.status === "FAILED";
}

/** "Alex Morgan · Senior Frontend Engineer": what the Figma confirmation dialog names. */
export function deleteSubject(item: Pick<CvListItem, "candidateName" | "targetRole">): string {
  return `${cardName(item)} · ${item.targetRole}`;
}

export type DeleteOutcome =
  /** The CV is already gone (404): treat as success and refresh the list. */
  | { kind: "gone" }
  /** The CV started generating again (409): keep it, explain, refresh the list. */
  | { kind: "active"; message: string }
  | { kind: "failed"; message: string };

export function deleteOutcome(error: unknown): DeleteOutcome {
  if (isApiError(error, 404)) {
    return { kind: "gone" };
  }
  if (isApiError(error, 409)) {
    return {
      kind: "active",
      message: "This CV is still being generated, so it can’t be deleted yet.",
    };
  }
  return { kind: "failed", message: "We couldn’t delete this CV. Nothing was removed; try again." };
}
