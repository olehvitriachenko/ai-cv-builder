import type { GenerationStatus } from '../../generated/prisma/enums.js';

/**
 * The single rule for "may this generation be retried". The retry operation and the My CVs list
 * both call it, so the list's `canRetry` can never disagree with what `POST /cvs/:id/retry`
 * accepts. Today only a FAILED generation can be retried; no failure reason is excluded.
 */
export function canRetryGeneration(status: GenerationStatus): boolean {
  return status === 'FAILED';
}
