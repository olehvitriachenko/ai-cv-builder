import type { CvListItem } from "@/entities/cv/schemas";

/** Candidate name from the list, or the placeholder; the client never reads the draft itself. */
export function cardName(item: Pick<CvListItem, "candidateName">): string {
  return item.candidateName ?? "Untitled CV";
}

/** The state message under the role, copied from the Figma "02 · My CVs" cards. */
export function cardMessage(item: Pick<CvListItem, "displayStatus" | "openQuestionsCount">): string {
  switch (item.displayStatus) {
    case "PROCESSING":
      return "Structuring your experience…";
    case "FAILED":
      return "Generation stopped. Your source is safe.";
    case "DRAFT":
      return `${item.openQuestionsCount} ${item.openQuestionsCount === 1 ? "question" : "questions"} to strengthen your CV`;
    case "COMPLETED":
      return "Reviewed and ready to share";
  }
}

export interface CardActions {
  /** The main action: where the user goes next. */
  primary: "open" | "progress" | "retry" | "none";
  delete: "enabled" | "disabled";
}

/**
 * Which actions a card offers. Retry availability is the server's decision (`canRetry`), never
 * assumed from the status here. Generating CVs cannot be deleted. Download PDF is on every card of
 * the Figma design; whether it is available is decided in `download-flow.ts`, so it is not decided here.
 */
export function cardActions(item: Pick<CvListItem, "status" | "displayStatus" | "canRetry">): CardActions {
  const generating = item.status === "PENDING" || item.status === "PROCESSING";
  if (generating) {
    return { primary: "progress", delete: "disabled" };
  }
  if (item.displayStatus === "FAILED") {
    return { primary: item.canRetry ? "retry" : "none", delete: "enabled" };
  }
  return { primary: "open", delete: "enabled" };
}

/** "5 Oct 2026, 10:42". Empty for an unparseable date rather than "Invalid Date". */
export function formatUpdated(iso: string, locale = "en-GB", timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}
