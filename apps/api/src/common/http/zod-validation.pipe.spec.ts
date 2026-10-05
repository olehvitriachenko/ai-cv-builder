import { z } from 'zod';
import { ApiError } from './api-error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  items: z.array(z.object({ qty: z.number().int() })),
});

function fieldErrorsOf(value: unknown) {
  try {
    new ZodValidationPipe(schema).transform(value);
  } catch (error) {
    if (error instanceof ApiError) {
      return error.fieldErrors;
    }
    throw error;
  }
  return undefined;
}

describe('ZodValidationPipe', () => {
  it('returns the parsed value', () => {
    expect(new ZodValidationPipe(schema).transform({ name: 'a', items: [], extra: 1 })).toEqual({
      name: 'a',
      items: [],
    });
  });

  it('keys a top-level problem by its field name', () => {
    expect(fieldErrorsOf({ name: '', items: [] })).toEqual({ name: ['Name is required'] });
  });

  it('keys a nested problem by its full dotted path', () => {
    const errors = fieldErrorsOf({ name: 'a', items: [{ qty: 1 }, { qty: 'x' }] });

    expect(Object.keys(errors ?? {})).toEqual(['items.1.qty']);
  });
});
