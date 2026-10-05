import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { describeError } from '../../../common/errors.js';
import { PrismaService } from '../../../infrastructure/index.js';
import { GENERATION_OPTIONS, type GenerationOptions } from './generation.options.js';
import {
  DEADLINE_REASON,
  GenerationProcessor,
  SHUTDOWN_REASON,
  type ClaimedJob,
} from './generation-processor.service.js';

const SWEEP_INTERVAL_MS = 30_000;

/** Rolls back a claim if shutdown began while its database statement was in flight. */
class ShutdownDuringClaim extends Error {}

/**
 * Drives generations in the background, inside this process, from the database. The Cv row is the
 * job: every state change is a compare-and-set update, so duplicate or stale workers cannot corrupt
 * state.
 *
 *  - kick(): start pending work now (not awaited by callers).
 *  - startup: PROCESSING rows are failed as INTERRUPTED (their in-flight request died with the
 *    process; never silently resumed), then PENDING rows are processed.
 *  - every 30 s: fail PROCESSING rows past the timeout, then pick up PENDING rows.
 *
 * Assumes a single API instance (see the plan's trade-offs).
 */
@Injectable()
export class GenerationRunner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(GenerationRunner.name);
  private readonly inFlight = new Set<Promise<void>>();
  private readonly controllers = new Set<AbortController>();
  private timer: NodeJS.Timeout | undefined;
  private draining = false;
  private drainRequested = false;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: GenerationProcessor,
    @Inject(GENERATION_OPTIONS) private readonly options: GenerationOptions,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.stopping || !this.options.autorun) {
      return;
    }

    try {
      await this.failInterrupted();
    } catch (error) {
      this.logger.error(`event=startup_sweep_failed error=${describeError(error)}`);
    }
    this.kick();

    if (this.stopping) {
      return;
    }

    this.timer = setInterval(() => {
      this.sweep().catch((error: unknown) => {
        this.logger.error(`event=sweep_failed error=${describeError(error)}`);
      });
    }, SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    this.stopping = true;
    clearInterval(this.timer);
    // Cancel in-flight provider calls. Their rows stay PROCESSING; the next start marks them
    // INTERRUPTED, exactly like a crash.
    for (const controller of this.controllers) {
      controller.abort(SHUTDOWN_REASON);
    }
  }

  /** Starts pending work without waiting for it. Rejections are caught and logged, never lost. */
  kick(): void {
    if (this.stopping || !this.options.autorun) {
      return;
    }
    this.drain().catch((error: unknown) => {
      this.logger.error(`event=drain_failed error=${describeError(error)}`);
    });
  }

  /** Claims and starts the oldest PENDING rows while there is spare concurrency. */
  async drain(): Promise<void> {
    if (this.stopping) {
      return;
    }
    if (this.draining) {
      this.drainRequested = true;
      return;
    }
    this.draining = true;
    try {
      do {
        this.drainRequested = false;
        await this.drainOnce();
      } while (!this.stopping && this.drainRequested);
    } finally {
      this.draining = false;
    }
  }

  private async drainOnce(): Promise<void> {
    while (!this.stopping && this.inFlight.size < this.options.concurrency) {
      const next = await this.prisma.cv.findFirst({
        where: { generationStatus: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!next || this.stopping) {
        return;
      }

      const job = await this.claim(next.id);
      if (job) {
        this.start(job);
      }
    }
  }

  /**
   * Compare-and-set PENDING -> PROCESSING. The returned `attempt` is the new value of
   * `generationAttempts`, the fencing token for every later write of this job. Exactly one caller
   * can win for a given row.
   */
  private async claim(id: string): Promise<ClaimedJob | null> {
    if (this.stopping) {
      return null;
    }
    const claimed = await this.prisma
      .$transaction(async (tx) => {
        if (this.stopping) {
          throw new ShutdownDuringClaim();
        }
        const [row] = await tx.cv.updateManyAndReturn({
          where: { id, generationStatus: 'PENDING' },
          data: {
            generationStatus: 'PROCESSING',
            processingStartedAt: new Date(),
            generationAttempts: { increment: 1 },
          },
          select: { id: true, generationAttempts: true, sourceText: true, targetRole: true },
        });
        if (this.stopping) {
          throw new ShutdownDuringClaim();
        }
        return row;
      })
      .catch((error: unknown) => {
        if (error instanceof ShutdownDuringClaim) {
          return undefined;
        }
        throw error;
      });

    if (!claimed) {
      return null;
    }
    this.logger.log(
      `event=generation_started cvId=${claimed.id} attempt=${claimed.generationAttempts}`,
    );
    return {
      id: claimed.id,
      attempt: claimed.generationAttempts,
      sourceText: claimed.sourceText,
      targetRole: claimed.targetRole,
    };
  }

  private start(job: ClaimedJob): void {
    if (this.stopping) {
      return;
    }
    const task: Promise<void> = this.execute(job).finally(() => {
      this.inFlight.delete(task);
      this.kick();
    });
    this.inFlight.add(task);
  }

  /** Runs one claimed job under its deadline. Never rejects: errors are logged. */
  private async execute(job: ClaimedJob): Promise<void> {
    if (this.stopping) {
      return;
    }
    const controller = new AbortController();
    this.controllers.add(controller);
    const deadline = setTimeout(() => controller.abort(DEADLINE_REASON), this.options.timeoutMs);

    try {
      await this.processor.run(job, controller.signal);
    } catch (error) {
      this.logger.error(
        `event=generation_run_failed cvId=${job.id} attempt=${job.attempt} error=${describeError(error)}`,
      );
    } finally {
      clearTimeout(deadline);
      this.controllers.delete(controller);
    }
  }

  /**
   * Claims one specific CV and runs it to completion (awaited). The deterministic entry point for
   * tests; returns false when the row was not PENDING.
   */
  async runCv(id: string): Promise<boolean> {
    const job = await this.claim(id);
    if (!job) {
      return false;
    }
    await this.execute(job);
    return true;
  }

  /** PROCESSING for longer than the timeout becomes FAILED / TIMED_OUT. Returns the row count. */
  async failTimedOut(): Promise<number> {
    const { count } = await this.prisma.cv.updateMany({
      where: {
        generationStatus: 'PROCESSING',
        processingStartedAt: { lt: new Date(Date.now() - this.options.timeoutMs) },
      },
      data: {
        generationStatus: 'FAILED',
        failureReason: 'TIMED_OUT',
        failureDetail: 'timeout_sweep',
        finishedAt: new Date(),
      },
    });
    if (count > 0) {
      this.logger.warn(`event=generation_timed_out count=${count}`);
    }
    return count;
  }

  /**
   * Every PROCESSING row becomes FAILED / INTERRUPTED. Run at startup: the in-flight request of
   * such a job was lost with the process. Never moved back to PENDING; the owner retries.
   */
  async failInterrupted(): Promise<number> {
    const { count } = await this.prisma.cv.updateMany({
      where: { generationStatus: 'PROCESSING' },
      data: {
        generationStatus: 'FAILED',
        failureReason: 'INTERRUPTED',
        failureDetail: 'restart',
        finishedAt: new Date(),
      },
    });
    if (count > 0) {
      this.logger.warn(`event=generation_interrupted count=${count}`);
    }
    return count;
  }

  private async sweep(): Promise<void> {
    if (this.stopping) {
      return;
    }
    try {
      await this.failTimedOut();
    } catch (error) {
      this.logger.error(`event=timeout_sweep_failed error=${describeError(error)}`);
    }
    await this.drain();
  }
}
