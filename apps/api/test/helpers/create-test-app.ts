import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { CvGenerator } from '../../src/modules/ai/cv-generator.js';
import {
  GENERATION_OPTIONS,
  type GenerationOptions,
} from '../../src/modules/cv/generation/generation.options.js';
import { FakeCvGenerator } from './fake-cv-generator.js';

export interface TestAppOptions {
  /** Replaces the Anthropic adapter. Defaults to an empty FakeCvGenerator. */
  generator?: CvGenerator;
  generation?: Partial<GenerationOptions>;
}

/**
 * Boots the real app (real PostgreSQL) with the same wiring as `main.ts`; use `app.inject()`.
 * The CvGenerator port is always replaced, so no test can reach the real provider. Timers and the
 * startup sweep are off by default; lifecycle tests drive the runner directly.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<NestFastifyApplication> {
  const generation: GenerationOptions = {
    timeoutMs: 300_000,
    concurrency: 2,
    autorun: false,
    transientRetryDelayMs: 0,
    ...options.generation,
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CvGenerator)
    .useValue(options.generator ?? new FakeCvGenerator())
    .overrideProvider(GENERATION_OPTIONS)
    .useValue(generation)
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
}
