const FEEDBACK_TTL_MS = 4_000;
export const FEEDBACK_FADE_MS = 150;

/** A disposable timer, shared by the success notice and resolved question cards. */
export function expireActionFeedback(expire: () => void): () => void {
  const timer = window.setTimeout(expire, FEEDBACK_TTL_MS);
  return () => window.clearTimeout(timer);
}

export const ANSWER_APPLIED_NOTICE = "Answer applied. Your CV was updated.";
