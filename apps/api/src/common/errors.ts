/**
 * Safe-to-log and safe-to-store name of an unknown error: its class name only, never its message,
 * stack or payload (those can carry personal data).
 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

/** The string `code` of an unknown error (Node, Fastify and Prisma errors carry one), if any. */
export function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}
