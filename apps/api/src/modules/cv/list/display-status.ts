import type { GenerationStatus } from '../../../generated/prisma/enums.js';

/** What My CVs shows for a CV. Derived from stored data only; never stored. */
export type DisplayStatus = 'PROCESSING' | 'FAILED' | 'DRAFT' | 'COMPLETED';

/**
 * PENDING and PROCESSING are both "Processing". A COMPLETED CV is a Draft while any clarification
 * question is unresolved (unanswered or answered), and Completed once every question is applied
 * or dismissed (or there were none).
 */
export function toDisplayStatus(
  status: GenerationStatus,
  unresolvedQuestions: number,
): DisplayStatus {
  switch (status) {
    case 'PENDING':
    case 'PROCESSING':
      return 'PROCESSING';
    case 'FAILED':
      return 'FAILED';
    case 'COMPLETED':
      return unresolvedQuestions > 0 ? 'DRAFT' : 'COMPLETED';
  }
}
