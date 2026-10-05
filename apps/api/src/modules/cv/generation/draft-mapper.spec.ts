import type { LlmCvOutput } from '../../ai/llm-cv-output.schema.js';
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
    skills: ['Node.js'],
    questions: [],
    ...overrides,
  };
}

describe('mapOutputToDraft', () => {
  it('produces a schema-valid draft with schemaVersion 1', () => {
    const draft = cvDraftSchema.parse(mapOutputToDraft(output()));

    expect(draft.schemaVersion).toBe(1);
    expect(draft.contact.links).toEqual(['a.dev']);
    expect(draft.skills).toEqual(['Node.js']);
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

    draft.skills.push('mutated');
    expect(source.skills).toEqual(['Node.js']);
  });
});

describe('normalizeQuestions', () => {
  const base = {
    section: 'CONTACT',
    itemIndex: null,
    missing: 'Email',
    question: 'What is your email?',
  } as const;

  it('trims text and drops exact duplicates, keeping order', () => {
    const result = normalizeQuestions([
      { ...base, missing: '  Email ', question: ' What is your email? ' },
      { ...base },
      { ...base, question: 'what is   your EMAIL?' },
      { section: 'SUMMARY', itemIndex: null, missing: 'Focus', question: 'Which focus?' },
    ]);

    expect(result.map((q) => q.section)).toEqual(['CONTACT', 'SUMMARY']);
    expect(result[0]).toMatchObject({ missing: 'Email', question: 'What is your email?' });
  });

  it('keeps the same question when it concerns different entries', () => {
    const result = normalizeQuestions([
      { section: 'EXPERIENCE', itemIndex: 0, missing: 'Dates', question: 'When?' },
      { section: 'EXPERIENCE', itemIndex: 1, missing: 'Dates', question: 'When?' },
    ]);

    expect(result).toHaveLength(2);
  });
});

describe('mapQuestions', () => {
  it('converts itemIndex into the id of the entry at that index', () => {
    const draft = cvDraftSchema.parse(mapOutputToDraft(output()));

    const rows = mapQuestions(
      [
        { section: 'EXPERIENCE', itemIndex: 1, missing: 'Dates', question: 'When at Globex?' },
        { section: 'EDUCATION', itemIndex: 0, missing: 'Degree', question: 'Which degree?' },
      ],
      draft,
    );

    expect(rows[0]).toMatchObject({ section: 'EXPERIENCE', itemId: draft.experience[1]!.id });
    expect(rows[1]).toMatchObject({ section: 'EDUCATION', itemId: draft.education[0]!.id });
  });

  it('leaves itemId null for section-level questions', () => {
    const draft = cvDraftSchema.parse(mapOutputToDraft(output()));

    const rows = mapQuestions(
      [{ section: 'CONTACT', itemIndex: null, missing: 'Email', question: 'Email?' }],
      draft,
    );

    expect(rows[0]).toMatchObject({ itemId: null, status: 'OPEN' });
  });

  it('assigns positions in order', () => {
    const draft = cvDraftSchema.parse(mapOutputToDraft(output()));
    const questions = (['CONTACT', 'SUMMARY', 'SKILLS'] as const).map((section) => ({
      section,
      itemIndex: null,
      missing: section,
      question: `${section}?`,
    }));

    const rows = mapQuestions(questions, draft);

    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.section)).toEqual(['CONTACT', 'SUMMARY', 'SKILLS']);
  });
});
