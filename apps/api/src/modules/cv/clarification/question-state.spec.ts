import {
  MAX_ANSWER_CHARS,
  answerBodySchema,
  canAnswer,
  canApply,
  canDismiss,
  isResolved,
  isUnresolved,
} from './question-state.js';

describe('question state rules', () => {
  it.each([
    ['UNANSWERED', true, true, false, false],
    ['ANSWERED', true, true, true, false],
    ['APPLIED', false, false, false, true],
    ['DISMISSED', false, false, false, true],
  ] as const)('%s: answer=%s dismiss=%s apply=%s resolved=%s', (status, answer, dismiss, apply, resolved) => {
    expect(canAnswer(status)).toBe(answer);
    expect(canDismiss(status)).toBe(dismiss);
    expect(canApply(status)).toBe(apply);
    expect(isResolved(status)).toBe(resolved);
    expect(isUnresolved(status)).toBe(!resolved);
  });
});

describe('answerBodySchema', () => {
  it('trims and accepts 1 to 1000 characters', () => {
    expect(answerBodySchema.parse({ answer: '  ada@example.com  ' })).toEqual({ answer: 'ada@example.com' });
    expect(answerBodySchema.safeParse({ answer: 'x'.repeat(MAX_ANSWER_CHARS) }).success).toBe(true);
    expect(MAX_ANSWER_CHARS).toBe(1000);
  });

  it.each(['', '   ', '\n\t', 'x'.repeat(1001)])('rejects %j', (answer) => {
    const result = answerBodySchema.safeParse({ answer });

    expect(result.success).toBe(false);
  });

  it('rejects a missing or non-text answer', () => {
    expect(answerBodySchema.safeParse({}).success).toBe(false);
    expect(answerBodySchema.safeParse({ answer: 5 }).success).toBe(false);
  });

  it('strips unknown keys such as status or a client userId', () => {
    expect(answerBodySchema.parse({ answer: 'a', status: 'APPLIED', userId: 'x' })).toEqual({ answer: 'a' });
  });

  it('removes NUL characters, which PostgreSQL text cannot store', () => {
    expect(answerBodySchema.parse({ answer: 'a\u0000b' })).toEqual({ answer: 'ab' });
  });
});
