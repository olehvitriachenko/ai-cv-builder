import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { LightMyRequestResponse } from 'fastify';
import { z } from 'zod';
import { findSetCookie, toCookieHeader } from './cookies.js';

const SESSION_COOKIE_NAME = 'sid';

export const VALID_PASSWORD = 'correct horse battery';

const userResponseSchema = z.object({ id: z.string(), email: z.string() });

export interface TestUser {
  id: string;
  email: string;
}

/** Unique per call, so tests stay isolated and order-independent without truncating tables. */
export function uniqueEmail(label = 'user'): string {
  return `${label}-${randomUUID()}@example.test`;
}

export interface RegisteredUser {
  email: string;
  password: string;
  user: TestUser;
  /** Value for a request `cookie` header, e.g. `sid=<token>`. */
  cookie: string;
  response: LightMyRequestResponse;
}

/** Registers a new user through the HTTP API and fails loudly if that does not return 201. */
export async function registerUser(
  app: NestFastifyApplication,
  overrides: { email?: string; password?: string } = {},
): Promise<RegisteredUser> {
  const email = overrides.email ?? uniqueEmail();
  const password = overrides.password ?? VALID_PASSWORD;

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password },
  });

  if (response.statusCode !== 201) {
    throw new Error(`registerUser expected 201 but got ${response.statusCode}: ${response.body}`);
  }

  const sessionCookie = findSetCookie(response.headers['set-cookie'], SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    throw new Error('registerUser expected a session cookie on the response');
  }

  return {
    email,
    password,
    user: userResponseSchema.parse(response.json()),
    cookie: toCookieHeader(sessionCookie),
    response,
  };
}

export interface LoginResult {
  response: LightMyRequestResponse;
  /** Present only when the response set a session cookie. */
  cookie: string | undefined;
}

/** Logs in through the HTTP API without asserting the outcome, so failures can be tested too. */
export async function loginUser(
  app: NestFastifyApplication,
  credentials: { email: string; password: string },
): Promise<LoginResult> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: credentials,
  });

  const sessionCookie = findSetCookie(response.headers['set-cookie'], SESSION_COOKIE_NAME);

  return {
    response,
    cookie: sessionCookie ? toCookieHeader(sessionCookie) : undefined,
  };
}
