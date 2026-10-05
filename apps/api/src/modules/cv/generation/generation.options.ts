import { ConfigService } from '@nestjs/config';

export const GENERATION_OPTIONS = Symbol('GENERATION_OPTIONS');

export interface GenerationOptions {
  /** Maximum time a generation may stay PROCESSING. */
  timeoutMs: number;
  /** Jobs processed at once. */
  concurrency: number;
  /** When false: no timers, no startup sweep, no post-create kick. Tests drive the runner directly. */
  autorun: boolean;
  /** Pause before the single retry after a transient provider error. */
  transientRetryDelayMs: number;
}

export function generationOptionsFactory(config: ConfigService): GenerationOptions {
  return {
    timeoutMs: config.getOrThrow<number>('GENERATION_TIMEOUT_MS'),
    concurrency: config.getOrThrow<number>('GENERATION_CONCURRENCY'),
    autorun: config.getOrThrow<boolean>('GENERATION_AUTORUN'),
    transientRetryDelayMs: 2000,
  };
}
