import type { GenerationStatus } from "@/entities/cv/schemas";

export type StageState = "done" | "active" | "waiting" | "failed";

export interface StageStates {
  preparing: StageState;
  structuring: StageState;
  generating: StageState;
}

/**
 * The three stages shown while a CV is generated, derived from the persisted status only. The API
 * reports no finer progress, so the last stage turns done together with the whole generation.
 */
export function stageStates(status: GenerationStatus): StageStates {
  switch (status) {
    case "COMPLETED":
      return { preparing: "done", structuring: "done", generating: "done" };
    case "FAILED":
      return { preparing: "done", structuring: "failed", generating: "waiting" };
    case "PROCESSING":
      return { preparing: "done", structuring: "active", generating: "waiting" };
    default:
      return { preparing: "done", structuring: "waiting", generating: "waiting" };
  }
}

/**
 * How long the finished stages stay on screen before the editor opens, so the person sees the
 * draft complete instead of the page jumping away.
 */
export const COMPLETION_HOLD_MS = 1200;
