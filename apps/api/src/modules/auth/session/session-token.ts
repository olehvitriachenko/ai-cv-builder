import { createHash, randomBytes } from 'node:crypto';

/** 256 bits from the OS CSPRNG, base64url (43 characters). Exists only in the cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 hex digest stored in `Session.tokenHash`. A fast hash is appropriate because the
 * input is a high-entropy random token, not a human-chosen secret.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
