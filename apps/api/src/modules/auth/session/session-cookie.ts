import type { SerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const SESSION_COOKIE_NAME = 'sid';

function baseOptions(secure: boolean): SerializeOptions {
  return { httpOnly: true, sameSite: 'lax', path: '/', secure };
}

/**
 * `secure` comes from validated application config (`NODE_ENV === 'production'`), read by the
 * caller, so plain-HTTP local development keeps working while production cookies are Secure.
 */
export function buildSessionCookieOptions(expiresAt: Date, secure: boolean): SerializeOptions {
  return { ...baseOptions(secure), expires: expiresAt };
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
  secure: boolean,
): void {
  void reply.setCookie(SESSION_COOKIE_NAME, token, buildSessionCookieOptions(expiresAt, secure));
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  void reply.clearCookie(SESSION_COOKIE_NAME, baseOptions(secure));
}

/** The cookie value is untrusted input; callers must treat it as an arbitrary string. */
export function readSessionCookie(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE_NAME];
}
