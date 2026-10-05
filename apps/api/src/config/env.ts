import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

/** Validates the raw environment at startup so the app fails fast on bad configuration. */
export function validateEnv(raw: Record<string, unknown>): Env {
  return envSchema.parse(raw);
}
