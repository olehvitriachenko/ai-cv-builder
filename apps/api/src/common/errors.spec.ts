import { describeError, errorCode } from './errors.js';

describe('describeError', () => {
  it('returns only the class name of an Error, never its message', () => {
    class ProviderBlewUp extends Error {}

    expect(describeError(new ProviderBlewUp('secret detail'))).toBe('ProviderBlewUp');
    expect(describeError(new TypeError('secret detail'))).toBe('TypeError');
  });

  it('returns the primitive type for anything that is not an Error', () => {
    expect(describeError('secret detail')).toBe('string');
    expect(describeError(undefined)).toBe('undefined');
    expect(describeError({ message: 'x' })).toBe('object');
  });
});

describe('errorCode', () => {
  it('reads a string code from an error-like value', () => {
    expect(errorCode(Object.assign(new Error('x'), { code: 'FST_REQ_FILE_TOO_LARGE' }))).toBe(
      'FST_REQ_FILE_TOO_LARGE',
    );
    expect(errorCode({ code: 'P2002' })).toBe('P2002');
  });

  it('is undefined when there is no string code', () => {
    expect(errorCode(new Error('x'))).toBeUndefined();
    expect(errorCode({ code: 42 })).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
    expect(errorCode('FST_X')).toBeUndefined();
  });
});
