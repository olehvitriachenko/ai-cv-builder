import { describe, expect, it } from 'vitest';
import { apiKeyFromEnv } from './api-key.js';

describe('apiKeyFromEnv', () => {
  it('returns the key without surrounding whitespace', () => {
    expect(apiKeyFromEnv('  sk-test-key \n')).toBe('sk-test-key');
  });

  it('treats an absent, empty or blank value as no key', () => {
    expect(apiKeyFromEnv(undefined)).toBeUndefined();
    expect(apiKeyFromEnv('')).toBeUndefined();
    expect(apiKeyFromEnv('   ')).toBeUndefined();
  });
});
