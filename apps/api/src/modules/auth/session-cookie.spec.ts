import { buildSessionCookieOptions } from './session-cookie.js';

describe('session cookie options', () => {
  const expiresAt = new Date('2030-01-01T00:00:00Z');

  it('is Secure in production', () => {
    expect(buildSessionCookieOptions(expiresAt, true)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      secure: true,
    });
  });

  it('is not Secure outside production, so plain-HTTP local development works', () => {
    expect(buildSessionCookieOptions(expiresAt, false)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      secure: false,
    });
  });
});
