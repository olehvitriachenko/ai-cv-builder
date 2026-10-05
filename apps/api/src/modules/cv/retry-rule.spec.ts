import { canRetryGeneration } from './retry-rule.js';

describe('canRetryGeneration', () => {
  it.each([
    ['PENDING', false],
    ['PROCESSING', false],
    ['COMPLETED', false],
    ['FAILED', true],
  ] as const)('%s -> %s', (status, expected) => {
    expect(canRetryGeneration(status)).toBe(expected);
  });
});
