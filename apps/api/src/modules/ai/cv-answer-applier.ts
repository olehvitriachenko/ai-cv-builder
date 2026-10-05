import type { ScopeContent } from './prompts/answer-patch.prompt.js';

/**
 * The port the clarification apply depends on, beside `CvGenerator`. It knows nothing about any
 * provider SDK: the only implementation is `AnthropicAnswerApplier`, and tests replace this token
 * with a scripted fake. It is only used when an answer needs professional wording; a single plain
 * value (a question with a `field`) never reaches it.
 */
export interface AnswerPatchRequest {
  /** The targeted section or entry (current content only; see `ScopeContent`). */
  scope: ScopeContent;
  question: string;
  answer: string;
  targetRole: string;
  /** Rule ids and JSON paths of a previous invalid attempt; never answer or draft values. */
  feedback?: string[];
  signal?: AbortSignal;
}

export abstract class CvAnswerApplier {
  /** The model that produces the output. */
  abstract readonly modelId: string;
  /** Version of the prompt that produces the output. */
  abstract readonly promptVersion: string;

  /**
   * Returns the model's structured output as `unknown` on purpose: the caller must validate it
   * (patch schema, then `applyAnswerPatch`) before anything is persisted. May throw `ProviderError`.
   */
  abstract apply(request: AnswerPatchRequest): Promise<unknown>;
}
