import { createCvSchema, cvIdSchema, sourceTextSchema, targetRoleSchema } from './cv.schemas.js';

const VALID_TEXT = 'Ten years as a backend engineer building REST APIs in Node.js and PostgreSQL.';

describe('targetRoleSchema', () => {
  it('trims the value', () => {
    expect(targetRoleSchema.parse('  Backend Engineer  ')).toBe('Backend Engineer');
  });

  it('rejects blank, whitespace-only and missing values', () => {
    expect(targetRoleSchema.safeParse('').success).toBe(false);
    expect(targetRoleSchema.safeParse('   ').success).toBe(false);
    expect(targetRoleSchema.safeParse(undefined).success).toBe(false);
  });

  it('accepts 200 characters and rejects 201', () => {
    expect(targetRoleSchema.safeParse('a'.repeat(200)).success).toBe(true);
    expect(targetRoleSchema.safeParse('a'.repeat(201)).success).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(targetRoleSchema.safeParse(42).success).toBe(false);
    expect(targetRoleSchema.safeParse(null).success).toBe(false);
  });
});

describe('sourceTextSchema', () => {
  it('trims before measuring', () => {
    const padded = `   ${'a'.repeat(50)}   `;
    expect(sourceTextSchema.parse(padded)).toBe('a'.repeat(50));
  });

  it('accepts 50 characters and rejects 49', () => {
    expect(sourceTextSchema.safeParse('a'.repeat(50)).success).toBe(true);
    expect(sourceTextSchema.safeParse('a'.repeat(49)).success).toBe(false);
  });

  it('accepts 20,000 characters and rejects 20,001', () => {
    expect(sourceTextSchema.safeParse('a'.repeat(20_000)).success).toBe(true);
    expect(sourceTextSchema.safeParse('a'.repeat(20_001)).success).toBe(false);
  });

  it('rejects whitespace-only and non-string values', () => {
    expect(sourceTextSchema.safeParse(' '.repeat(100)).success).toBe(false);
    expect(sourceTextSchema.safeParse(123).success).toBe(false);
    expect(sourceTextSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('createCvSchema', () => {
  it('requires both targetRole and sourceText', () => {
    expect(createCvSchema.safeParse({ sourceText: VALID_TEXT }).success).toBe(false);
    expect(createCvSchema.safeParse({ targetRole: 'QA' }).success).toBe(false);
    expect(createCvSchema.safeParse({}).success).toBe(false);
  });

  it('returns trimmed values', () => {
    expect(createCvSchema.parse({ targetRole: ' QA ', sourceText: ` ${VALID_TEXT} ` })).toEqual({
      targetRole: 'QA',
      sourceText: VALID_TEXT,
    });
  });

  it('strips an unknown userId', () => {
    expect(
      createCvSchema.parse({ targetRole: 'QA', sourceText: VALID_TEXT, userId: 'someone-else' }),
    ).toEqual({ targetRole: 'QA', sourceText: VALID_TEXT });
  });
});

describe('cvIdSchema', () => {
  it('accepts a cuid-shaped id', () => {
    expect(cvIdSchema.safeParse('cmgf0abcd0000xyz1234567890ab').success).toBe(true);
  });

  it('rejects malformed ids', () => {
    expect(cvIdSchema.safeParse('not-an-id').success).toBe(false);
    expect(cvIdSchema.safeParse('').success).toBe(false);
  });
});
