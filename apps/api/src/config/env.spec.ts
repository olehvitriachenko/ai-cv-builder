import { validateEnv } from './env.js';

const base = { DATABASE_URL: 'postgresql://localhost/db' };

describe('validateEnv', () => {
  it('applies the generation and provider defaults', () => {
    const env = validateEnv(base);

    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_MODEL).toBe('claude-sonnet-5-5');
    expect(env.ANTHROPIC_TIMEOUT_MS).toBe(120_000);
    expect(env.ANSWER_APPLY_TIMEOUT_MS).toBe(20_000);
    expect(env.GENERATION_TIMEOUT_MS).toBe(300_000);
    expect(env.GENERATION_CONCURRENCY).toBe(2);
    expect(env.GENERATION_AUTORUN).toBe(true);
  });

  it('treats an empty or blank API key as absent', () => {
    expect(validateEnv({ ...base, ANTHROPIC_API_KEY: '' }).ANTHROPIC_API_KEY).toBeUndefined();
    expect(validateEnv({ ...base, ANTHROPIC_API_KEY: '   ' }).ANTHROPIC_API_KEY).toBeUndefined();
    expect(validateEnv({ ...base, ANTHROPIC_API_KEY: 'sk-test' }).ANTHROPIC_API_KEY).toBe(
      'sk-test',
    );
  });

  it('coerces numeric values from strings', () => {
    const env = validateEnv({
      ...base,
      GENERATION_TIMEOUT_MS: '60000',
      ANSWER_APPLY_TIMEOUT_MS: '5000',
      GENERATION_CONCURRENCY: '4',
    });

    expect(env.GENERATION_TIMEOUT_MS).toBe(60_000);
    expect(env.ANSWER_APPLY_TIMEOUT_MS).toBe(5_000);
    expect(env.GENERATION_CONCURRENCY).toBe(4);
  });

  it('rejects a non-positive timeout', () => {
    expect(() => validateEnv({ ...base, GENERATION_TIMEOUT_MS: '0' })).toThrow();
    expect(() => validateEnv({ ...base, GENERATION_TIMEOUT_MS: '-5' })).toThrow();
    expect(() => validateEnv({ ...base, ANTHROPIC_TIMEOUT_MS: '0' })).toThrow();
    expect(() => validateEnv({ ...base, ANSWER_APPLY_TIMEOUT_MS: '0' })).toThrow();
    expect(() => validateEnv({ ...base, ANSWER_APPLY_TIMEOUT_MS: '-1' })).toThrow();
  });

  it('rejects concurrency outside 1..10', () => {
    expect(() => validateEnv({ ...base, GENERATION_CONCURRENCY: '0' })).toThrow();
    expect(() => validateEnv({ ...base, GENERATION_CONCURRENCY: '11' })).toThrow();
  });

  it('accepts only true or false for autorun', () => {
    expect(validateEnv({ ...base, GENERATION_AUTORUN: 'false' }).GENERATION_AUTORUN).toBe(false);
    expect(validateEnv({ ...base, GENERATION_AUTORUN: 'true' }).GENERATION_AUTORUN).toBe(true);
    expect(() => validateEnv({ ...base, GENERATION_AUTORUN: 'yes' })).toThrow();
  });
});
