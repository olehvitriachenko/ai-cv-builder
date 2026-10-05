import { flushSync } from "react-dom";

const FEEDBACK_TTL_MS = 4_000;

/** A disposable timer, shared by the success notice and resolved question cards. */
export function expireActionFeedback(expire: () => void): () => void {
  const timer = window.setTimeout(expire, FEEDBACK_TTL_MS);
  return () => window.clearTimeout(timer);
}

export const ANSWER_APPLIED_NOTICE = "Answer applied. Your CV was updated.";

/** Supported browsers animate the assistant without waiting for the animation to finish. */
export function withAssistantTransition(update: () => void): void {
  if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  const transition = document.startViewTransition(() => flushSync(update));
  // A newer action can skip an in-flight visual transition without failing the server action.
  void transition.ready.catch(() => undefined);
}
