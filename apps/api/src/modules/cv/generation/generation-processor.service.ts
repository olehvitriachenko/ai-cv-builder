import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FailureReason } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../infrastructure/index.js';
import { CvGenerator, ProviderError } from '../../ai/cv-generator.js';
import { llmCvOutputSchema } from '../../ai/llm-cv-output.schema.js';
import type { QuestionRow } from './draft-mapper.js';
import { formatIssue, validateGeneration, type ValidationIssue } from './draft-validation.js';
import type { CvDraft } from './draft.schema.js';
import { GENERATION_OPTIONS, type GenerationOptions } from './generation.options.js';

/** One automatic retry at most: invalid output or a transient provider error. Never unbounded. */
const MAX_ATTEMPTS = 2;
const MAX_DETAIL_CHARS = 200;

/** Abort reasons set by the runner on the job's AbortController. */
export const DEADLINE_REASON = 'deadline';
export const SHUTDOWN_REASON = 'shutdown';

/**
 * A job claimed by the runner. `attempt` is the value of `generationAttempts` produced by the
 * claim: the fencing token. Every terminal write below matches it together with the expected
 * status, so a worker that was timed out, interrupted or superseded by a retry can never change
 * the row (a retry gets a higher token; the counter is never reset).
 */
export interface ClaimedJob {
  id: string;
  attempt: number;
  sourceText: string;
  targetRole: string;
}

type Produced =
  | { kind: 'ok'; draft: CvDraft; questions: QuestionRow[] }
  | { kind: 'failed'; reason: FailureReason; detail: string }
  /** The process is shutting down: write nothing, the startup sweep marks the row INTERRUPTED. */
  | { kind: 'abandoned' };

function failed(reason: FailureReason, detail: string): Produced {
  return { kind: 'failed', reason, detail };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

/** Safe-to-store description of an unexpected error: its class name only, never its message. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

@Injectable()
export class GenerationProcessor {
  private readonly logger = new Logger(GenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: CvGenerator,
    @Inject(GENERATION_OPTIONS) private readonly options: GenerationOptions,
  ) {}

  /**
   * Runs one claimed job to a terminal state (or abandons it on shutdown). Everything between the
   * source and persistence is untrusted:
   *   generator -> output schema -> domain validation -> compare-and-set + persistence.
   * Logs only event names, ids, attempt counts and reason codes.
   */
  async run(job: ClaimedJob, signal: AbortSignal): Promise<void> {
    const produced = await this.produce(job, signal);

    if (produced.kind === 'abandoned') {
      this.logger.warn(`event=generation_abandoned cvId=${job.id} attempt=${job.attempt}`);
    } else if (produced.kind === 'ok') {
      await this.complete(job, produced);
    } else {
      await this.fail(job, produced.reason, produced.detail);
    }
  }

  private async produce(job: ClaimedJob, signal: AbortSignal): Promise<Produced> {
    let feedback: string[] | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let raw: unknown;
      try {
        raw = await this.generator.generate({
          sourceText: job.sourceText,
          targetRole: job.targetRole,
          feedback,
          signal,
        });
      } catch (error) {
        if (signal.aborted) {
          return signal.reason === SHUTDOWN_REASON
            ? { kind: 'abandoned' }
            : failed('TIMED_OUT', DEADLINE_REASON);
        }
        if (!(error instanceof ProviderError)) {
          return failed('UNKNOWN', errorName(error));
        }

        const token = error.detail ? `${error.kind} ${error.detail}` : error.kind;
        switch (error.kind) {
          case 'NOT_CONFIGURED':
            return failed('PROVIDER_NOT_CONFIGURED', token);
          case 'REFUSED':
            return failed('INVALID_OUTPUT', 'refusal');
          case 'BAD_REQUEST':
            return failed('UNKNOWN', token);
          case 'TRANSIENT':
            if (attempt === MAX_ATTEMPTS) {
              return failed('PROVIDER_UNAVAILABLE', token);
            }
            this.logger.warn(
              `event=generation_retry cvId=${job.id} attempt=${attempt} reason=transient`,
            );
            await sleep(this.options.transientRetryDelayMs, signal);
            continue;
        }
      }

      const checked = this.validate(raw, job.sourceText);
      if (checked.kind === 'ok') {
        return checked;
      }

      const rules = checked.issues.map(formatIssue);
      if (attempt === MAX_ATTEMPTS) {
        return failed('INVALID_OUTPUT', rules.join('; '));
      }
      this.logger.warn(
        `event=generation_retry cvId=${job.id} attempt=${attempt} reason=invalid_output`,
      );
      feedback = rules;
    }

    // Unreachable: the loop always returns or continues up to MAX_ATTEMPTS.
    return failed('UNKNOWN', 'attempts_exhausted');
  }

  /** Output schema, then domain validation. Nothing is persisted from output that fails either. */
  private validate(
    raw: unknown,
    sourceText: string,
  ):
    | { kind: 'ok'; draft: CvDraft; questions: QuestionRow[] }
    | { kind: 'invalid'; issues: ValidationIssue[] } {
    const parsed = llmCvOutputSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        kind: 'invalid',
        issues: parsed.error.issues.map((issue) => ({
          rule: `schema_${issue.code}`,
          path: issue.path.map(String).join('.'),
        })),
      };
    }

    const result = validateGeneration(parsed.data, sourceText);
    return result.ok
      ? { kind: 'ok', draft: result.draft, questions: result.questions }
      : { kind: 'invalid', issues: result.issues };
  }

  /**
   * The draft and its questions are written in one transaction, and the questions only if the
   * compare-and-set matched: a stale worker inserts nothing.
   */
  private async complete(
    job: ClaimedJob,
    produced: Extract<Produced, { kind: 'ok' }>,
  ): Promise<void> {
    try {
      const committed = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.cv.updateMany({
          where: { id: job.id, generationStatus: 'PROCESSING', generationAttempts: job.attempt },
          data: {
            generationStatus: 'COMPLETED',
            draft: produced.draft,
            finishedAt: new Date(),
            promptVersion: this.generator.promptVersion,
            aiModel: this.generator.modelId,
          },
        });
        if (updated.count !== 1) {
          return false;
        }
        if (produced.questions.length > 0) {
          await tx.clarificationQuestion.createMany({
            data: produced.questions.map((question) => ({ cvId: job.id, ...question })),
          });
        }
        return true;
      });

      this.logger.log(
        committed
          ? `event=generation_completed cvId=${job.id} attempt=${job.attempt} questions=${produced.questions.length}`
          : `event=generation_discarded cvId=${job.id} attempt=${job.attempt} outcome=completed`,
      );
    } catch (error) {
      this.logger.error(
        `event=generation_persist_failed cvId=${job.id} attempt=${job.attempt} error=${errorName(error)}`,
      );
      await this.fail(job, 'UNKNOWN', 'persist_failed');
    }
  }

  private async fail(job: ClaimedJob, reason: FailureReason, detail: string): Promise<void> {
    const updated = await this.prisma.cv.updateMany({
      where: { id: job.id, generationStatus: 'PROCESSING', generationAttempts: job.attempt },
      data: {
        generationStatus: 'FAILED',
        failureReason: reason,
        failureDetail: detail.slice(0, MAX_DETAIL_CHARS),
        finishedAt: new Date(),
      },
    });

    this.logger.warn(
      updated.count === 1
        ? `event=generation_failed cvId=${job.id} attempt=${job.attempt} reason=${reason}`
        : `event=generation_discarded cvId=${job.id} attempt=${job.attempt} outcome=failed`,
    );
  }
}
