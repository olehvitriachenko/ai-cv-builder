import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),

  // Optional on purpose: without a key the app still starts and generations end FAILED with
  // PROVIDER_NOT_CONFIGURED. An empty value (e.g. `ANTHROPIC_API_KEY=` in .env) counts as absent.
  ANTHROPIC_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  ANTHROPIC_MODEL: z.string().trim().min(1).default('claude-sonnet-5-5'),
  // Per-request SDK timeout. Two attempts (one retry) must fit inside GENERATION_TIMEOUT_MS.
  ANTHROPIC_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),

  GENERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  GENERATION_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  // Disables the runner's timers, the startup sweep and the post-create kick. Tests set it false.
  GENERATION_AUTORUN: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

/** Validates the raw environment at startup so the app fails fast on bad configuration. */
export function validateEnv(raw: Record<string, unknown>): Env {
  return envSchema.parse(raw);
}
