/**
 * The port the generation pipeline depends on. It knows nothing about any provider SDK:
 * the only implementation is `AnthropicCvGenerator`, and tests replace this token with a fake.
 */
export interface CvGeneratorRequest {
  sourceText: string;
  targetRole: string;
  /** Rule ids and JSON paths of a previous invalid attempt; never source or draft values. */
  feedback?: string[];
  signal?: AbortSignal;
}

export type ProviderErrorKind = 'NOT_CONFIGURED' | 'TRANSIENT' | 'REFUSED' | 'BAD_REQUEST';

export class ProviderError extends Error {
  /** Safe debugging token only: an HTTP status or an error class name, never a provider message. */
  readonly detail?: string;

  constructor(
    readonly kind: ProviderErrorKind,
    detail?: string,
  ) {
    super(`Provider error: ${kind}`);
    this.name = 'ProviderError';
    this.detail = detail;
  }
}

export abstract class CvGenerator {
  /** The model that produces the output; stored with the draft. */
  abstract readonly modelId: string;
  /** Version of the prompt that produces the output; stored with the draft. */
  abstract readonly promptVersion: string;

  /**
   * Returns the model's structured output as `unknown` on purpose: the caller must validate it
   * (schema, then domain rules) before anything is persisted. May throw `ProviderError`.
   */
  abstract generate(request: CvGeneratorRequest): Promise<unknown>;
}
