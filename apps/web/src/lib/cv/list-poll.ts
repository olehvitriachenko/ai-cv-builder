import type { CvListItem } from "@/lib/api/cvs";

/** About every 5 seconds, only while at least one listed CV is generating. */
export const LIST_POLL_INTERVAL_MS = 5000;

/**
 * Value for TanStack Query's `refetchInterval` on the My CVs list. Polls while any item is
 * `PENDING` or `PROCESSING` and stops once none is active (a `COMPLETED` or `FAILED` item is final
 * until the user acts on it).
 */
export function listPollInterval(items: readonly Pick<CvListItem, "status">[] | undefined): number | false {
  const active = items?.some((item) => item.status === "PENDING" || item.status === "PROCESSING");
  return active ? LIST_POLL_INTERVAL_MS : false;
}
