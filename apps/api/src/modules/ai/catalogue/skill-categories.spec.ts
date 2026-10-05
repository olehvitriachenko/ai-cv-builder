import {
  FALLBACK_SKILL_CATEGORY,
  SKILL_CATEGORY_NAMES,
  isKnownSkillCategory,
  parseSkillCategoryNames,
} from './skill-categories.js';

describe('skill category names', () => {
  it('comes from the shared catalogue: non-empty, trimmed, 1 to 60 characters', () => {
    expect(SKILL_CATEGORY_NAMES.length).toBeGreaterThan(0);
    for (const name of SKILL_CATEGORY_NAMES) {
      expect(name).toBe(name.trim());
      expect(name.length).toBeGreaterThanOrEqual(1);
      expect(name.length).toBeLessThanOrEqual(60);
    }
  });

  it('has unique names, ignoring case', () => {
    const lowered = SKILL_CATEGORY_NAMES.map((name) => name.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
  });

  it('keeps the catalogue order', () => {
    expect(SKILL_CATEGORY_NAMES[0]).toBe('Programming Languages');
  });

  it('does not list the fallback category itself', () => {
    expect(FALLBACK_SKILL_CATEGORY).toBe('Skills');
    expect(SKILL_CATEGORY_NAMES).not.toContain(FALLBACK_SKILL_CATEGORY);
  });
});

describe('isKnownSkillCategory', () => {
  it('accepts a catalogue name in any letter case, and the fallback', () => {
    expect(isKnownSkillCategory('Databases')).toBe(true);
    expect(isKnownSkillCategory('  databases ')).toBe(true);
    expect(isKnownSkillCategory('Skills')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isKnownSkillCategory('Underwater Basket Weaving')).toBe(false);
    expect(isKnownSkillCategory('')).toBe(false);
  });
});

describe('parseSkillCategoryNames', () => {
  it('returns the names of a valid catalogue in order', () => {
    expect(
      parseSkillCategoryNames([
        { name: 'A', suggestions: ['a1', 'a2', 'a3', 'a4'] },
        { name: 'B', suggestions: ['b1', 'b2', 'b3', 'b4'] },
      ]),
    ).toEqual(['A', 'B']);
  });

  it.each([
    ['not an array', {}],
    ['an empty catalogue', []],
    ['an empty name', [{ name: '', suggestions: [] }]],
    ['a name longer than 60 characters', [{ name: 'x'.repeat(61), suggestions: [] }]],
    ['duplicate names ignoring case', [{ name: 'A', suggestions: [] }, { name: 'a', suggestions: [] }]],
    ['a name that collides with the fallback', [{ name: 'skills', suggestions: [] }]],
  ])('fails fast for %s', (_label, input) => {
    expect(() => parseSkillCategoryNames(input)).toThrow();
  });
});
