import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/index.js';
import type { AuthUser } from './auth.types.js';
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
  constructor(private readonly prisma: PrismaService) {}

  /** Pure: builds a new session secret and its stored form without touching the database. */
  issue(): IssuedSession {
    const token = generateSessionToken();

    return {
      token,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    };
  }

  /**
   * Resolves a raw cookie value to its user, or `null` when the session is unknown, expired or
   * gone. An expired row found here is deleted. Sessions of deleted users cascade away, so a
   * found session always has a user.
   */
  async validate(rawToken: string): Promise<AuthUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(rawToken) },
      select: { id: true, expiresAt: true, user: { select: { id: true, email: true } } },
    });

    if (!session) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }

    return session.user;
  }
}
