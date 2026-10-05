/** A promise with its settle functions exposed, for holding async work at a known point. */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
}

export function deferred<T = void>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
