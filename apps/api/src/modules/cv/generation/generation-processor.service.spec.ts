import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../infrastructure/index.js';
import { CvGenerator } from '../../ai/cv-generator.js';
import { VALID_SOURCE_TEXT, VALID_TARGET_ROLE } from '../../../../test/helpers/cvs.js';
import { validLlmOutput } from '../../../../test/helpers/llm-output.js';
import { GENERATION_OPTIONS } from './generation.options.js';
import {
  DEADLINE_REASON,
  GenerationProcessor,
  SHUTDOWN_REASON,
} from './generation-processor.service.js';

describe('GenerationProcessor cancellation during persistence', () => {
  it.each([
    ['draft', DEADLINE_REASON],
    ['questions', DEADLINE_REASON],
    ['draft', SHUTDOWN_REASON],
    ['questions', SHUTDOWN_REASON],
  ])('rolls back when cancelled during %s write (%s)', async (stage, reason) => {
    const controller = new AbortController();
    const tx = {
      cv: {
        updateMany: vi.fn(async () => {
          if (stage === 'draft') controller.abort(reason);
          return { count: 1 };
        }),
      },
      clarificationQuestion: {
        createMany: vi.fn(async () => {
          if (stage === 'questions') controller.abort(reason);
          return { count: 1 };
        }),
      },
    };
    let committed = false;
    const transaction = vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => {
      const result = await run(tx);
      committed = true;
      return result;
    });
    const fail = vi.fn(async () => ({ count: 1 }));
    const module = await Test.createTestingModule({
      providers: [
        GenerationProcessor,
        {
          provide: PrismaService,
          useValue: { $transaction: transaction, cv: { updateMany: fail } },
        },
        {
          provide: CvGenerator,
          useValue: {
            modelId: 'fake',
            promptVersion: 'fake',
            generate: async () =>
              validLlmOutput({
                questions: [
                  {
                    section: 'SUMMARY',
                    itemIndex: null, field: undefined,
                    missing: 'Focus',
                    question: 'Which focus?',
                  },
                ],
              }),
          },
        },
        { provide: GENERATION_OPTIONS, useValue: { transientRetryDelayMs: 0 } },
      ],
    }).compile();
    try {
      await module
        .get(GenerationProcessor)
        .run(
          { id: 'cv', attempt: 1, sourceText: VALID_SOURCE_TEXT, targetRole: VALID_TARGET_ROLE },
          controller.signal,
        );
      expect(committed).toBe(false);
      if (reason === DEADLINE_REASON) {
        expect(fail).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              generationStatus: 'FAILED',
              failureReason: 'TIMED_OUT',
            }),
          }),
        );
      } else {
        expect(fail).not.toHaveBeenCalled();
      }
    } finally {
      await module.close();
    }
  });
});
