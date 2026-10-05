import { z } from 'zod';

/**
 * The only place email normalisation happens. Registration and login both build on it so an
 * address is trimmed and lower-cased identically everywhere (and uniqueness is case-insensitive).
 */
export const normalizedEmail = z.string({ error: 'Email is required' }).trim().toLowerCase();

export const registerSchema = z.object({
  email: normalizedEmail
    .max(254, 'Email must be at most 254 characters')
    .pipe(z.email({ error: 'Enter a valid email address' })),
  password: z
    .string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

export type RegisterInput = z.output<typeof registerSchema>;

export const loginSchema = z.object({
  email: normalizedEmail
    .min(1, 'Email is required')
    .max(254, 'Email must be at most 254 characters'),
  password: z
    .string({ error: 'Password is required' })
    .min(1, 'Password is required')
    .max(128, 'Password must be at most 128 characters'),
});

export type LoginInput = z.output<typeof loginSchema>;
