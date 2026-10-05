import { CvAnswerApplier, type AnswerPatchRequest } from '../../src/modules/ai/cv-answer-applier.js';

type Step =
  | { kind: 'output'; output: unknown }
  | { kind: 'error'; error: Error }
  | { kind: 'hold'; promise: Promise<unknown>; markStarted: () => void };

/** A call held in flight until the test releases it (to change the CV while the AI is working). */
export interface AnswerHold {
  started: Promise<void>;
  release(output: unknown): void;
  fail(error: Error): void;
}

/**
 * The test double for the `CvAnswerApplier` port: a scripted queue of outputs, errors and held
 * calls. It records exactly what the service sent, so tests can assert the request is scoped to the
 * targeted section or entry and nothing more. It honours the abort signal like the real adapter.
 */
export class FakeCvAnswerApplier extends CvAnswerApplier {
  readonly modelId = 'fake-applier-model';
  readonly promptVersion = 'fake-applier-v0';
  readonly calls: AnswerPatchRequest[] = [];

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

  enqueueHold(): AnswerHold {
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

  async apply(request: AnswerPatchRequest): Promise<unknown> {
    this.calls.push(request);

    const step = this.steps.shift();
    if (!step) {
      throw new Error('FakeCvAnswerApplier: no scripted step for this call');
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
      step.promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
  }
}
