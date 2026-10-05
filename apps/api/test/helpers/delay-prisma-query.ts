import type { Prisma } from '../../src/generated/prisma/client.js';

/**
 * Holds a Prisma query until `gate` settles. Prisma queries are lazy (they run when awaited),
 * so the real query starts only after the gate opens. Used to freeze one request at an exact
 * point of a race while another request completes.
 */
class GatedPrismaPromise<T> implements Prisma.PrismaPromise<T> {
  readonly [Symbol.toStringTag] = 'PrismaPromise' as const;

  constructor(
    private readonly query: Prisma.PrismaPromise<T>,
    private readonly gate: Promise<void>,
  ) {}

  private run(): Promise<T> {
    return this.gate.then(() => this.query);
  }

  // Intentional: this class implements Prisma.PrismaPromise, which is a thenable by definition.
  // oxlint-disable-next-line unicorn/no-thenable
  then<R1 = T, R2 = never>(
    onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.run().then(onFulfilled, onRejected);
  }

  catch<R = never>(onRejected?: ((reason: unknown) => R | PromiseLike<R>) | null): Promise<T | R> {
    return this.run().catch(onRejected);
  }

  finally(onFinally?: (() => void) | null): Promise<T> {
    return this.run().finally(onFinally);
  }
}

export function delayPrismaQuery<T>(
  query: Prisma.PrismaPromise<T>,
  gate: Promise<void>,
): Prisma.PrismaPromise<T> {
  return new GatedPrismaPromise(query, gate);
}
