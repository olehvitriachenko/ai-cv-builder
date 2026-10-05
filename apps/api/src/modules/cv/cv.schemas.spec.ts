import { createCvSchema, cvIdSchema } from './cv.schemas.js';

describe('createCvSchema', () => {
  it('accepts a missing targetRole', () => {
    expect(createCvSchema.parse({})).toEqual({});
  });

  it('trims the targetRole', () => {
    expect(createCvSchema.parse({ targetRole: '  Backend Engineer  ' })).toEqual({
      targetRole: 'Backend Engineer',
    });
  });

  it('rejects a blank or whitespace-only targetRole', () => {
    expect(createCvSchema.safeParse({ targetRole: '' }).success).toBe(false);
    expect(createCvSchema.safeParse({ targetRole: '   ' }).success).toBe(false);
  });

  it('accepts 200 characters and rejects 201', () => {
    expect(createCvSchema.safeParse({ targetRole: 'a'.repeat(200) }).success).toBe(true);
    expect(createCvSchema.safeParse({ targetRole: 'a'.repeat(201) }).success).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(createCvSchema.safeParse({ targetRole: 42 }).success).toBe(false);
    expect(createCvSchema.safeParse({ targetRole: null }).success).toBe(false);
  });

  it('strips an unknown userId', () => {
    expect(createCvSchema.parse({ targetRole: 'QA', userId: 'someone-else' })).toEqual({
      targetRole: 'QA',
    });
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
