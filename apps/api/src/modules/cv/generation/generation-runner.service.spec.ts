import { deferred } from '../../../../test/helpers/deferred.js';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../infrastructure/index.js';
import { GENERATION_OPTIONS } from './generation.options.js';
import { GenerationProcessor } from './generation-processor.service.js';
import { GenerationRunner } from './generation-runner.service.js';

describe('GenerationRunner shutdown', () => {
  async function setup() {
    const rows = ['first', 'second'];
    const findFirst = vi.fn(async () => (rows.length ? { id: rows[0] } : null));
    const updateManyAndReturn = vi.fn(async () => [
      {
        id: rows.shift(),
        generationAttempts: 1,
        sourceText: 'source',
        targetRole: 'role',
      },
    ]);
    const tx = { cv: { updateManyAndReturn } };
    const transaction = vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx));
    const finished = deferred<void>();
    const run = vi.fn(async (_job: unknown, signal: AbortSignal) => {
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      finished.resolve();
    });
    const module = await Test.createTestingModule({
      providers: [
        GenerationRunner,
        { provide: PrismaService, useValue: { cv: { findFirst }, $transaction: transaction } },
        { provide: GenerationProcessor, useValue: { run } },
        {
          provide: GENERATION_OPTIONS,
          useValue: { autorun: true, concurrency: 1, timeoutMs: 60_000 },
        },
      ],
    }).compile();
    return {
      module,
      runner: module.get(GenerationRunner),
      findFirst,
      updateManyAndReturn,
      run,
      finished,
    };
  }

  it('does not let completion finally/kick start queued work after shutdown', async () => {
    const { module, runner, findFirst, updateManyAndReturn, run, finished } = await setup();
    try {
      await runner.drain();
      expect(run).toHaveBeenCalledTimes(1);
      runner.onModuleDestroy();
      await finished.promise;
      // Flush the finishing task and its finally -> kick chain.
      await new Promise<void>((resolve) => setImmediate(resolve));
      runner.kick();
      await runner.drain();
      expect(await runner.runCv('second')).toBe(false);
      expect(run).toHaveBeenCalledTimes(1);
      expect(findFirst).toHaveBeenCalledTimes(1);
      expect(updateManyAndReturn).toHaveBeenCalledTimes(1);
    } finally {
      await module.close();
    }
  });

  it('does not claim a row returned by a pending lookup after shutdown', async () => {
    const { module, runner, findFirst, updateManyAndReturn, run } = await setup();
    const found = deferred<{ id: string }>();
    findFirst.mockReturnValueOnce(found.promise);
    try {
      const draining = runner.drain();
      runner.onModuleDestroy();
      found.resolve({ id: 'first' });
      await draining;
      expect(updateManyAndReturn).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });

  it('aborts the claim transaction when shutdown happens during the claim query', async () => {
    const { module, runner, updateManyAndReturn, run } = await setup();
    const entered = deferred<void>();
    const claimed = deferred<Awaited<ReturnType<typeof updateManyAndReturn>>>();
    updateManyAndReturn.mockImplementationOnce(() => {
      entered.resolve();
      return claimed.promise;
    });
    try {
      const draining = runner.drain();
      await entered.promise;
      runner.onModuleDestroy();
      claimed.resolve([
        { id: 'first', generationAttempts: 1, sourceText: 'source', targetRole: 'role' },
      ]);
      await draining;
      expect(run).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });
});
