import { cookies } from 'next/headers';
import { userSchema, type User } from '@/lib/api/auth';
import { apiFetch, isApiError } from '@/lib/api/fetcher';

/**
 * Server-side only. Asks the API who the current user is by forwarding the incoming session
 * cookie. Returns `null` when there is no valid session. Redirecting on `null` is a UX
 * convenience; the API remains the authority on every request.
 */
export async function getCurrentUser(): Promise<User | null> {
  // Next.js 16: `cookies()` is async; `toString()` yields a ready-to-forward Cookie header.
  const cookie = (await cookies()).toString();
  if (!cookie) {
    return null;
  }

  try {
    return await apiFetch('/auth/me', { schema: userSchema, cookie });
  } catch (error) {
    if (isApiError(error, 401)) {
      return null;
    }
    throw error;
  }
}
