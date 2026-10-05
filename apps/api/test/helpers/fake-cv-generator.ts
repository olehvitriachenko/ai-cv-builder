import { CvGenerator, type CvGeneratorRequest } from '../../src/modules/ai/cv-generator.js';

/** A call that is held in flight until the test releases it. */
export interface Hold {
  /** Resolves when the generator call that consumed this step has started. */
  started: Promise<void>;
  release(output: unknown): void;
  fail(error: Error): void;
}

type Step =
  | { kind: 'output'; output: unknown }
  | { kind: 'error'; error: Error }
  | { kind: 'hold'; promise: Promise<unknown>; markStarted: () => void };

/** What a call recorded. Never the source text. */
export interface RecordedCall {
  targetRole: string;
  feedback: string[] | undefined;
}

/**
 * The test double for the `CvGenerator` port: a scripted queue of outputs, errors and held calls.
 * It honours the abort signal, like the real adapter, so deadline tests behave realistically.
 */
export class FakeCvGenerator extends CvGenerator {
  readonly modelId = 'fake-model';
  readonly promptVersion = 'fake-prompt-v0';
  readonly calls: RecordedCall[] = [];

  private steps: Step[] = [];

  reset(): void {
    this.steps = [];
    this.calls.length = 0;
  }

  enqueueOutput(output: unknown): this {
    this.steps.push({ kind: 'output', output });
    return this;
  }

  enqueueError(error: Error): this {
    this.steps.push({ kind: 'error', error });
    return this;
  }

  /** The next call blocks until `release`/`fail`, or until its signal aborts. */
  enqueueHold(): Hold {
    let markStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let release: (output: unknown) => void = () => undefined;
    let fail: (error: Error) => void = () => undefined;
    const promise = new Promise<unknown>((resolve, reject) => {
      release = resolve;
      fail = reject;
    });
    this.steps.push({ kind: 'hold', promise, markStarted });
    return { started, release, fail };
  }

  async generate(request: CvGeneratorRequest): Promise<unknown> {
    this.calls.push({ targetRole: request.targetRole, feedback: request.feedback });

    const step = this.steps.shift();
    if (!step) {
      throw new Error('FakeCvGenerator: no scripted step for this call');
    }
    if (step.kind === 'error') {
      throw step.error;
    }
    if (step.kind === 'output') {
      return step.output;
    }

    step.markStarted();
    const { signal } = request;
    if (!signal) {
      return step.promise;
    }
    return new Promise<unknown>((resolve, reject) => {
      const onAbort = (): void => reject(new DOMException('Aborted', 'AbortError'));
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      step.promise
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', onAbort));
    });
  }
}
