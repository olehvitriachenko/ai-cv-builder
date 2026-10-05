import { answerPatchSchemas } from './answer-patch.schema.js';

describe('answerPatchSchemas', () => {
  it('has one schema per section', () => {
    expect(Object.keys(answerPatchSchemas).sort()).toEqual(['CONTACT', 'EDUCATION', 'EXPERIENCE', 'SKILLS', 'SUMMARY']);
  });

  it('accepts a valid patch for each scope', () => {
    expect(answerPatchSchemas.CONTACT.safeParse({ fullName: null, email: 'a@b.co', phone: null, location: null, links: [] }).success).toBe(true);
    expect(answerPatchSchemas.SUMMARY.safeParse({ summary: 'Backend engineer.' }).success).toBe(true);
    expect(
      answerPatchSchemas.EXPERIENCE.safeParse({ employer: null, title: null, location: null, startDate: '2019', endDate: null, bullets: ['Mentored two engineers'] }).success,
    ).toBe(true);
    expect(
      answerPatchSchemas.EDUCATION.safeParse({ institution: null, qualification: null, startDate: null, endDate: '2015', details: 'Distinction' }).success,
    ).toBe(true);
    expect(answerPatchSchemas.SKILLS.safeParse({ additions: [{ category: 'Databases', skills: ['Go'] }] }).success).toBe(true);
    expect(answerPatchSchemas.SKILLS.safeParse({ additions: [] }).success).toBe(true);
  });

  it('rejects wrong types, a missing key and unknown keys (the model cannot name a path)', () => {
    expect(answerPatchSchemas.SUMMARY.safeParse({ summary: 5 }).success).toBe(false);
    expect(answerPatchSchemas.SKILLS.safeParse({}).success).toBe(false);
    expect(answerPatchSchemas.SKILLS.safeParse({ additions: [], path: 'draft.contact.email' }).success).toBe(false);
    expect(answerPatchSchemas.SKILLS.safeParse({ additions: [{ category: 'Databases', skills: ['Go'], id: 'c1' }] }).success).toBe(false);
    expect(answerPatchSchemas.SKILLS.safeParse({ additions: [{ category: 'Databases', skills: 'Go' }] }).success).toBe(false);
    expect(answerPatchSchemas.SKILLS.safeParse({ skills: ['Go'] }).success).toBe(false);
    expect(answerPatchSchemas.EXPERIENCE.safeParse({ employer: null, title: null, location: null, startDate: null, endDate: null, bullets: 'x' }).success).toBe(false);
    expect(answerPatchSchemas.CONTACT.safeParse({ fullName: null, email: null, phone: null, location: null }).success).toBe(false);
  });

  it('does not accept an id, a status or an operation in a patch', () => {
    expect(answerPatchSchemas.EXPERIENCE.safeParse({ id: 'exp-1', employer: null, title: null, location: null, startDate: null, endDate: null, bullets: [] }).success).toBe(false);
    expect(answerPatchSchemas.SKILLS.safeParse({ additions: [], op: 'replace' }).success).toBe(false);
  });
});
