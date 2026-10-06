import type { GenerationStatus } from "@/entities/cv/schemas";

/** Gentle on the API: one indexed row read every 2 seconds, only while work is in progress. */
export const POLL_INTERVAL_MS = 2000;

/**
 * Value for TanStack Query's `refetchInterval`. Polls only while the generation is `PENDING` or
 * `PROCESSING` and stops on `COMPLETED` or `FAILED` (the persisted, terminal states).
 */
export function pollInterval(status: GenerationStatus | undefined): number | false {
  return status === "PENDING" || status === "PROCESSING" ? POLL_INTERVAL_MS : false;
}
