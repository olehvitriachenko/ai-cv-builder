/**
 * The Anthropic key from the environment, or `undefined` when there is none. An empty or blank
 * value counts as absent (Compose passes `ANTHROPIC_API_KEY=` as an empty string when the
 * variable is not set), so the adapters report NOT_CONFIGURED instead of calling the provider
 * with an empty key.
 */
export function apiKeyFromEnv(value: string | undefined): string | undefined {
  const key = value?.trim();
  return key ? key : undefined;
}
