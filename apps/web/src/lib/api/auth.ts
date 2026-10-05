import { z } from 'zod';
import { apiFetch } from './fetcher';

export const userSchema = z.object({ id: z.string(), email: z.string() });

export type User = z.infer<typeof userSchema>;

export interface Credentials {
  email: string;
  password: string;
}

export function registerAccount(credentials: Credentials): Promise<User> {
  return apiFetch('/auth/register', { method: 'POST', body: credentials, schema: userSchema });
}

export function signIn(credentials: Credentials): Promise<User> {
  return apiFetch('/auth/login', { method: 'POST', body: credentials, schema: userSchema });
}

export function signOut(): Promise<void> {
  return apiFetch('/auth/logout', { method: 'POST' });
}
