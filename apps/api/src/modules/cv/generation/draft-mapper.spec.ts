import { SKILL_CATEGORY_NAMES } from '../../ai/catalogue/skill-categories.js';
import type { LlmCvOutput } from '../../ai/schemas/llm-cv-output.schema.js';
import { cvDraftSchema } from './draft.schema.js';
import { mapOutputToDraft, mapQuestions, normalizeQuestions } from './draft-mapper.js';

function output(overrides: Partial<LlmCvOutput> = {}): LlmCvOutput {
  return {
    contact: { fullName: 'Ada', email: null, phone: null, location: null, links: ['a.dev'] },
    summary: 'Engineer.',
    experience: [
      {
        employer: 'Acme',
        title: 'Dev',
        location: null,
        startDate: null,
        endDate: null,
        bullets: ['x'],
      },
      {
        employer: 'Globex',
        title: null,
        location: null,
        startDate: null,
        endDate: null,
        bullets: [],
      },
    ],
    education: [
      {
        institution: 'State U',
        qualification: null,
        startDate: null,
        endDate: null,
        details: null,
      },
    ],
    skillCategories: [{ category: 'Frameworks', skills: ['Node.js'] }],
    questions: [],
    ...overrides,
  };
}

describe('mapOutputToDraft', () => {
  it('produces a schema-valid draft with schemaVersion 2 and grouped skills', () => {
    const draft = cvDraftSchema.parse(mapOutputToDraft(output()));

    expect(draft.schemaVersion).toBe(2);
    expect(draft.contact.links).toEqual(['a.dev']);
    expect(draft.skillCategories).toEqual([
      { id: expect.any(String), name: 'Frameworks', skills: ['Node.js'] },
    ]);
  });

  describe('skill categories', () => {
    const map = (skillCategories: LlmCvOutput['skillCategories']) =>
      mapOutputToDraft(output({ skillCategories }));

    it('assigns a unique, model-independent id to every category', () => {
      let next = 0;
      const draft = mapOutputToDraft(
        output({
          skillCategories: [
            { category: 'Databases', skills: ['PostgreSQL'] },
            { category: 'Frameworks', skills: ['NestJS'] },
          ],
        }),
        () => `id-${++next}`,
      );

      expect(draft.skillCategories.map((c) => c.id)).toEqual(['id-4', 'id-5']);
      expect(new Set(draft.skillCategories.map((c) => c.id)).size).toBe(2);
    });

    it('keeps category and skill order', () => {
      const draft = map([
        { category: 'Frameworks', skills: ['NestJS', 'React'] },
        { category: 'Databases', skills: ['PostgreSQL'] },
      ]);

      expect(draft.skillCategories.map((c) => [c.name, c.skills])).toEqual([
        ['Frameworks', ['NestJS', 'React']],
        ['Databases', ['PostgreSQL']],
      ]);
    });

    it('merges a category that appears twice into the first occurrence', () => {
      const draft = map([
        { category: 'Databases', skills: ['PostgreSQL'] },
        { category: 'Frameworks', skills: ['NestJS'] },
        { category: 'Databases', skills: ['Redis'] },
      ]);

      expect(draft.skillCategories.map((c) => [c.name, c.skills])).toEqual([
        ['Databases', ['PostgreSQL', 'Redis']],
        ['Frameworks', ['NestJS']],
      ]);
    });

    it('drops blank skills, case-insensitive duplicates across categories (first wins) and empty categories', () => {
      const draft = map([
        { category: 'Frameworks', skills: ['React', '  ', 'react'] },
        { category: 'Databases', skills: ['REACT'] },
        { category: 'Skills', skills: [' Go '] },
      ]);

      expect(draft.skillCategories.map((c) => [c.name, c.skills])).toEqual([
        ['Frameworks', ['React']],
        ['Skills', ['Go']],
      ]);
    });

    it('does not truncate: an over-cap result is left for validation to reject', () => {
      const draft = map(
        SKILL_CATEGORY_NAMES.slice(0, 13).map((category, index) => ({ category, skills: [`s${index}`] })),
      );

      expect(draft.skillCategories).toHaveLength(13);
    });
  });

  it('assigns a unique id to every experience and education entry', () => {
    const draft = mapOutputToDraft(output());
    const ids = [...draft.experience, ...draft.education].map((entry) => entry.id);

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  it('uses the supplied id factory, so ids never come from the model', () => {
    let next = 0;
    const draft = mapOutputToDraft(output(), () => `id-${++next}`);

    expect(draft.experience.map((e) => e.id)).toEqual(['id-1', 'id-2']);
    expect(draft.education.map((e) => e.id)).toEqual(['id-3']);
  });

  it('does not share arrays with the model output', () => {
    const source = output();
    const draft = mapOutputToDraft(source);

    draft.skillCategories[0]?.skills.push('mutated');
    expect(source.skillCategories[0]?.skills).toEqual(['Node.js']);
  });
});

describe('normalizeQuestions', () => {
  const base = {
    section: 'CONTACT',
    itemIndex: null, field: undefined,
    missing: 'Email',
    question: 'What is your email?',
  } as const;

  it('trims text and drops exact duplicates, keeping order', () => {
    const result = normalizeQuestions([
      { ...base, missing: '  Email ', question: ' What is your email? ' },
      { ...base },
      { ...base, question: 'what is   your EMAIL?' },
      { section: 'SUMMARY', itemIndex: null, field: undefined, missing: 'Focus', question: 'Which focus?' },
    ]);

    expect(result.map((q) => q.section)).toEqual(['CONTACT', 'SUMMARY']);
    expect(result[0]).toMatchObject({ missing: 'Email', question: 'What is your email?' });
  });

  it('keeps the same question when it concerns different entries', () => {
    const result = normalizeQuestions([
      { section: 'EXPERIENCE', itemIndex: 0, field: undefined, missing: 'Dates', question: 'When?' },
      { section: 'EXPERIENCE', itemIndex: 1, field: undefined, missing: 'Dates', question: 'When?' },
    ]);

    expect(result).toHaveLength(2);
  });
});

describe('mapQuestions', () => {
  it('converts itemIndex into the id of the entry at that index', () => {
    const draft = cvDraftSchema.parse(mapOutputToDraft(output()));

    const rows = mapQuestions(
      [
        { section: 'EXPERIENCE', itemIndex: 1, field: undefined, missing: 'Dates', question: 'When at Globex?' },
        { section: 'EDUCATION', itemIndex: 0, field: undefined, missing: 'Degree', question: 'Which degree?' },
      ],
      draft,
    );

    expect(rows[0]).toMatchObject({ section: 'EXPERIENCE', itemId: draft.experience[1]!.id });
    expect(rows[1]).toMatchObject({ section: 'EDUCATION', itemId: draft.education[0]!.id });
  });

  it('leaves itemId null for section-level questions', () => {
    const draft = cvDraftSchema.parse(mapOutputToDraft(output()));

    const rows = mapQuestions(
      [{ section: 'CONTACT', itemIndex: null, field: undefined, missing: 'Email', question: 'Email?' }],
      draft,
    );

    expect(rows[0]).toMatchObject({ itemId: null, status: 'UNANSWERED' });
  });

  it('assigns positions in order', () => {
    const draft = cvDraftSchema.parse(mapOutputToDraft(output()));
    const questions = (['CONTACT', 'SUMMARY', 'SKILLS'] as const).map((section) => ({
      section,
      itemIndex: null, field: undefined,
      missing: section,
      question: `${section}?`,
    }));

    const rows = mapQuestions(questions, draft);

    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.section)).toEqual(['CONTACT', 'SUMMARY', 'SKILLS']);
  });
});

describe('mapQuestions field', () => {
  it('carries a field into its stored row and persists an omitted field as null', () => {
    const draft = cvDraftSchema.parse(mapOutputToDraft(output()));

    const rows = mapQuestions(
      [
        { section: 'CONTACT', itemIndex: null, field: 'CONTACT_EMAIL', missing: 'Email', question: 'Email?' },
        { section: 'SUMMARY', itemIndex: null, missing: 'Focus', question: 'Focus?' },
      ],
      draft,
    );

    expect(rows.map((row) => row.field)).toEqual(['CONTACT_EMAIL', null]);
  });
});

describe('mapOutputToDraft optional sections', () => {
  let counter = 0;
  const newId = () => `id-${(counter += 1)}`;
  const item = (section: 'language' | 'certification' | 'portfolio' | 'hobby' | 'custom', name: string, rest: Partial<{ detail: string; date: string; link: string }> = {}) => ({
    section,
    name,
    detail: '',
    date: '',
    link: '',
    ...rest,
  });

  it('gives a draft without items empty lists', () => {
    const draft = cvDraftSchema.parse(mapOutputToDraft(output()));

    expect(draft.languages).toEqual([]);
    expect(draft.certifications).toEqual([]);
    expect(draft.portfolio).toEqual([]);
    expect(draft.hobbies).toEqual([]);
    expect(draft.customSections).toEqual([]);
  });

  it('sorts the items into their sections, generates the ids and turns "" and an unknown level into null', () => {
    const draft = mapOutputToDraft(
      output({
        optionalItems: [
          item('language', 'English', { detail: 'C1' }),
          item('language', 'German', { detail: 'fluent' }),
          item('certification', 'AWS SAA', { detail: 'Amazon', link: '  ' }),
          item('portfolio', 'CV Builder', { link: 'example.com/cv' }),
          item('hobby', 'Chess'),
          item('custom', 'Volunteering', { detail: 'Food bank' }),
        ],
      }),
      newId,
    );

    expect(draft.languages).toEqual([
      { id: expect.any(String), name: 'English', level: 'C1' },
      { id: expect.any(String), name: 'German', level: null },
    ]);
    expect(draft.certifications).toEqual([{ id: expect.any(String), name: 'AWS SAA', issuer: 'Amazon', date: null, link: null }]);
    expect(draft.portfolio).toEqual([{ id: expect.any(String), name: 'CV Builder', link: 'example.com/cv', description: null }]);
    expect(draft.hobbies).toEqual(['Chess']);
    expect(draft.customSections).toEqual([{ id: expect.any(String), title: 'Volunteering', content: 'Food bank' }]);
    const ids = [...(draft.languages ?? []), ...(draft.certifications ?? []), ...(draft.portfolio ?? []), ...(draft.customSections ?? [])].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('accepts the level "Native speaker" as written', () => {
    const draft = mapOutputToDraft(output({ optionalItems: [item('language', 'Ukrainian', { detail: 'Native speaker' })] }));

    expect(draft.languages?.[0]?.level).toBe('Native speaker');
  });

  it('drops items without their name and keeps the first of a repeated language or hobby', () => {
    const draft = mapOutputToDraft(
      output({
        optionalItems: [
          item('language', 'English', { detail: 'A2' }),
          item('language', ' english ', { detail: 'C1' }),
          item('language', ' '),
          item('certification', '', { detail: 'Amazon' }),
          item('hobby', 'Chess'),
          item('hobby', 'chess'),
          item('hobby', ' '),
          item('custom', 'Only title'),
          item('custom', '', { detail: 'Only content' }),
        ],
      }),
    );

    expect(draft.languages).toHaveLength(1);
    expect(draft.languages?.[0]).toMatchObject({ name: 'English', level: 'A2' });
    expect(draft.certifications).toEqual([]);
    expect(draft.hobbies).toEqual(['Chess']);
    expect(draft.customSections).toEqual([]);
  });
});
