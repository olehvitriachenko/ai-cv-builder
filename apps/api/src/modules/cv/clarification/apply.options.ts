import { ConfigService } from '@nestjs/config';

export const APPLY_OPTIONS = Symbol('APPLY_OPTIONS');

export interface ApplyOptions {
  /** Per-attempt limit of an AI-assisted apply (at most two attempts). */
  timeoutMs: number;
  /** Pause before the single retry after a transient provider error. */
  transientRetryDelayMs: number;
}

export function applyOptionsFactory(config: ConfigService): ApplyOptions {
  return {
    timeoutMs: config.getOrThrow<number>('ANSWER_APPLY_TIMEOUT_MS'),
    transientRetryDelayMs: 1000,
  };
}
