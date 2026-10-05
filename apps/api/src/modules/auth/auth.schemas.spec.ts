import { registerSchema } from './auth.schemas.js';

const validPassword = 'correct horse battery';

describe('registerSchema', () => {
  describe('email', () => {
    it('is trimmed and lower-cased', () => {
      const result = registerSchema.parse({
        email: '  Ada.Lovelace@Example.COM  ',
        password: validPassword,
      });

      expect(result.email).toBe('ada.lovelace@example.com');
    });

    it('rejects an invalid address', () => {
      const result = registerSchema.safeParse({ email: 'not-an-email', password: validPassword });

      expect(result.success).toBe(false);
    });

    it('accepts 254 characters and rejects more', () => {
      const domain = '@example.com';
      const at254 = `${'a'.repeat(254 - domain.length)}${domain}`;

      expect(registerSchema.safeParse({ email: at254, password: validPassword }).success).toBe(
        true,
      );
      expect(
        registerSchema.safeParse({ email: `a${at254}`, password: validPassword }).success,
      ).toBe(false);
    });
  });

  describe('password', () => {
    const parse = (password: string) =>
      registerSchema.safeParse({ email: 'ada@example.com', password });

    it('rejects 7 characters and accepts 8', () => {
      expect(parse('a'.repeat(7)).success).toBe(false);
      expect(parse('a'.repeat(8)).success).toBe(true);
    });

    it('accepts 128 characters and rejects 129', () => {
      expect(parse('a'.repeat(128)).success).toBe(true);
      expect(parse('a'.repeat(129)).success).toBe(false);
    });

    it('is not trimmed', () => {
      const result = registerSchema.parse({ email: 'ada@example.com', password: '  padded pw  ' });

      expect(result.password).toBe('  padded pw  ');
    });
  });

  it('strips unknown keys such as userId', () => {
    const result = registerSchema.parse({
      email: 'ada@example.com',
      password: validPassword,
      userId: 'someone-else',
    });

    expect(result).toEqual({ email: 'ada@example.com', password: validPassword });
  });

  it('rejects missing fields and wrong types', () => {
    expect(registerSchema.safeParse({}).success).toBe(false);
    expect(registerSchema.safeParse({ email: 123, password: true }).success).toBe(false);
    expect(registerSchema.safeParse(undefined).success).toBe(false);
  });
});
