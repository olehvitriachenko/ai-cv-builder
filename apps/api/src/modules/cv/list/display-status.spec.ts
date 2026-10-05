import { toDisplayStatus } from './display-status.js';

describe('toDisplayStatus', () => {
  it.each([
    ['PENDING', 0, 'PROCESSING'],
    ['PENDING', 3, 'PROCESSING'],
    ['PROCESSING', 0, 'PROCESSING'],
    ['PROCESSING', 2, 'PROCESSING'],
    ['FAILED', 0, 'FAILED'],
    ['FAILED', 4, 'FAILED'],
    ['COMPLETED', 1, 'DRAFT'],
    ['COMPLETED', 5, 'DRAFT'],
    ['COMPLETED', 0, 'COMPLETED'],
  ] as const)('%s with %i unresolved question(s) -> %s', (status, unresolved, expected) => {
    expect(toDisplayStatus(status, unresolved)).toBe(expected);
  });
});
