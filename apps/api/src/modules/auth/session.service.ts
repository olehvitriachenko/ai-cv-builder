import { Injectable } from '@nestjs/common';
import { generateSessionToken, hashSessionToken } from './session-token.js';

/** `createdAt + 7 days`, fixed (no renewal). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface IssuedSession {
  /** The raw token. Only ever sent to the browser in the cookie; never stored. */
  token: string;
  /** `sha256(rawToken)` hex: the only representation that is persisted. */
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class SessionService {
  /** Pure: builds a new session secret and its stored form without touching the database. */
  issue(): IssuedSession {
    const token = generateSessionToken();

    return {
      token,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    };
  }
}
