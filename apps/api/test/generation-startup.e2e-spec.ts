import { Logger } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infrastructure/index.js';
import { GenerationRunner } from '../src/modules/cv/generation/generation-runner.service.js';
import { createTestApp } from './helpers/create-test-app.js';
import { createCvFromText, postCv, VALID_SOURCE_TEXT, VALID_TARGET_ROLE } from './helpers/cvs.js';
import { FakeCvGenerator } from './helpers/fake-cv-generator.js';
import { validLlmOutput } from './helpers/llm-output.js';
import { seedProcessing } from './helpers/seed.js';
import { registerUser, type RegisteredUser } from './helpers/users.js';

/**
 * Boots the app with the runner's real autorun path (startup sweep, kick, drain). Startup sweeps
 * are global, so this file owns the database while it runs: e2e files run sequentially and it
 * starts from an empty Cv table.
 */
describe('Generation runner autorun', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let runner: GenerationRunner;
  let user: RegisteredUser;
  let pendingId: string;
  let interruptedId: string;
  const generator = new FakeCvGenerator();

  beforeAll(async () => {
    // First "process lifetime": leave one PENDING and one in-flight PROCESSING row behind.
    const before = await createTestApp();
    const beforePrisma = before.get(PrismaService);
    await beforePrisma.cv.deleteMany();
    user = await registerUser(before);
    pendingId = await createCvFromText(before, user.cookie);
    interruptedId = await createCvFromText(before, user.cookie);
    await seedProcessing(beforePrisma, interruptedId);
    await before.close();

    // Second lifetime: the API restarts with autorun on.
    generator.enqueueOutput(validLlmOutput());
    app = await createTestApp({ generator, generation: { autorun: true } });
    prisma = app.get(PrismaService);
    runner = app.get(GenerationRunner);
  });

  afterAll(async () => {
    await app.close();
  });

  const rowOf = (id: string) => prisma.cv.findUniqueOrThrow({ where: { id } });
  const waitForStatus = (id: string, status: string) =>
    vi.waitFor(
      async () => {
        expect((await rowOf(id)).generationStatus).toBe(status);
      },
      { timeout: 5000, interval: 25 },
    );

  it('fails a CV found PROCESSING at startup as INTERRUPTED and processes the PENDING one', async () => {
    await waitForStatus(pendingId, 'COMPLETED');

    expect(await rowOf(interruptedId)).toMatchObject({
      generationStatus: 'FAILED',
      failureReason: 'INTERRUPTED',
      draft: null,
    });
    // Only the PENDING CV was sent to the provider: the interrupted one was never resumed.
    expect(generator.calls).toHaveLength(1);
  });

  it('runs a retry in the background without any further call', async () => {
    generator.enqueueOutput(validLlmOutput());

    const response = await app.inject({
      method: 'POST',
      url: `/api/cvs/${interruptedId}/retry`,
      headers: { cookie: user.cookie },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().status).toBe('PENDING');
    await waitForStatus(interruptedId, 'COMPLETED');
  });

  it('answers a new request immediately with PENDING and finishes it in the background', async () => {
    const hold = generator.enqueueHold();

    const response = await postCv(app, user.cookie, {
      targetRole: VALID_TARGET_ROLE,
      sourceText: VALID_SOURCE_TEXT,
    });

    // The response does not wait for the generation, which is still held in flight.
    expect(response.statusCode).toBe(202);
    expect(response.json().status).toBe('PENDING');
    await hold.started;
    expect((await rowOf(response.json().id)).generationStatus).toBe('PROCESSING');

    hold.release(validLlmOutput());
    await waitForStatus(response.json().id, 'COMPLETED');
  });

  it('catches and logs a rejected background drain instead of leaving it unhandled', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(runner, 'drain').mockRejectedValueOnce(new Error('secret database detail'));

    runner.kick();

    await vi.waitFor(() => {
      expect(logged).toHaveBeenCalledWith(expect.stringContaining('event=drain_failed'));
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain('secret database detail');
    logged.mockRestore();
  });
});
