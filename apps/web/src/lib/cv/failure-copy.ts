import type { FailureReason } from "@/entities/cv/schemas";

/**
 * What the user reads when a generation failed. Written from the safe failure *category* only:
 * it never repeats provider messages, technical detail or the source text, and always says that
 * nothing was added to the CV.
 */
const FAILURE_COPY: Record<FailureReason, string> = {
  PROVIDER_UNAVAILABLE: "The AI service didn’t respond. Nothing was added to your CV.",
  PROVIDER_NOT_CONFIGURED: "AI generation isn’t available right now. Nothing was added to your CV.",
  INVALID_OUTPUT: "The AI returned something we couldn’t use. Nothing was added to your CV.",
  TIMED_OUT: "Generation took too long and was stopped. Nothing was added to your CV.",
  INTERRUPTED: "Generation was interrupted before it finished. Nothing was added to your CV.",
  UNKNOWN: "Something went wrong. Nothing was added to your CV.",
};

export function failureMessage(reason: FailureReason | null): string {
  return FAILURE_COPY[reason ?? "UNKNOWN"];
}
