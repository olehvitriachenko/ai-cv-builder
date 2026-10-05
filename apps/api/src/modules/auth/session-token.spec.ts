import { generateSessionToken, hashSessionToken } from './session-token.js';

describe('session token', () => {
  it('generates a 43-character URL-safe token', () => {
    expect(generateSessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('generates a different token every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()));
    expect(tokens.size).toBe(50);
  });

  it('hashes to a deterministic 64-character hex digest that is not the token', () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(hash);
    expect(hash).not.toBe(token);
  });

  it('hashes different tokens to different digests', () => {
    expect(hashSessionToken(generateSessionToken())).not.toBe(
      hashSessionToken(generateSessionToken()),
    );
  });
});
