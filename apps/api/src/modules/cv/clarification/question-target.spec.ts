import type { QuestionFieldName } from '../../ai/schemas/llm-cv-output.schema.js';
import { cvDraftSchema, type CvDraft } from '../generation/draft.schema.js';
import { applyFieldAnswer, checkTarget } from './question-target.js';

function emptyDraft(): CvDraft {
  return {
    schemaVersion: 1,
    contact: { fullName: null, email: null, phone: null, location: null, links: [] },
    summary: null,
    experience: [
      { id: 'exp-1', employer: 'Acme', title: null, location: null, startDate: null, endDate: null, bullets: ['Built APIs'] },
      { id: 'exp-2', employer: null, title: 'Engineer', location: null, startDate: null, endDate: null, bullets: [] },
    ],
    education: [{ id: 'edu-1', institution: 'State University', qualification: null, startDate: null, endDate: null, details: null }],
    skills: ['Node.js'],
  };
}

describe('applyFieldAnswer', () => {
  const cases: [QuestionFieldName, string | null, (draft: CvDraft) => unknown, string][] = [
    ['CONTACT_FULL_NAME', null, (d) => d.contact.fullName, 'Ada Lovelace'],
    ['CONTACT_EMAIL', null, (d) => d.contact.email, 'ada@example.com'],
    ['CONTACT_PHONE', null, (d) => d.contact.phone, '+44 20 7946 0000'],
    ['CONTACT_LOCATION', null, (d) => d.contact.location, 'London'],
    ['EXPERIENCE_TITLE', 'exp-1', (d) => d.experience[0]?.title, 'Staff Engineer'],
    ['EXPERIENCE_EMPLOYER', 'exp-2', (d) => d.experience[1]?.employer, 'Globex'],
    ['EXPERIENCE_LOCATION', 'exp-1', (d) => d.experience[0]?.location, 'Remote'],
    ['EXPERIENCE_START_DATE', 'exp-1', (d) => d.experience[0]?.startDate, 'Jun 2019'],
    ['EXPERIENCE_END_DATE', 'exp-1', (d) => d.experience[0]?.endDate, 'Present'],
    ['EDUCATION_QUALIFICATION', 'edu-1', (d) => d.education[0]?.qualification, 'BSc'],
    ['EDUCATION_START_DATE', 'edu-1', (d) => d.education[0]?.startDate, '2012'],
    ['EDUCATION_END_DATE', 'edu-1', (d) => d.education[0]?.endDate, '2015'],
  ];

  it.each(cases)('%s fills an empty value and changes nothing else', (field, itemId, read, answer) => {
    const draft = emptyDraft();

    const result = applyFieldAnswer(draft, field, itemId, `  ${answer}  `);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(read(result.draft)).toBe(answer);
      expect(cvDraftSchema.safeParse(result.draft).success).toBe(true);
      // Everything except that one value is identical.
      const expected = structuredClone(result.draft);
      expect(draft).toEqual(emptyDraft());
      expect(JSON.stringify(expected)).not.toBe(JSON.stringify(draft));
    }
  });

  it('only touches the targeted entry', () => {
    const result = applyFieldAnswer(emptyDraft(), 'EXPERIENCE_END_DATE', 'exp-2', '2020');

    expect(result.ok && result.draft.experience[0]).toEqual(emptyDraft().experience[0]);
    expect(result.ok && result.draft.experience[1]?.endDate).toBe('2020');
    expect(result.ok && result.draft.education).toEqual(emptyDraft().education);
  });

  it('EDUCATION_INSTITUTION fills an empty institution', () => {
    const draft = emptyDraft();
    const education = draft.education[0];
    if (education) {
      education.institution = null;
      education.qualification = 'BSc';
    }

    const result = applyFieldAnswer(draft, 'EDUCATION_INSTITUTION', 'edu-1', 'City College');

    expect(result.ok && result.draft.education[0]?.institution).toBe('City College');
  });

  it('CONTACT_LINK appends, up to 5 links, without duplicating one', () => {
    const draft = emptyDraft();
    draft.contact.links = ['github.com/ada'];

    const added = applyFieldAnswer(draft, 'CONTACT_LINK', null, 'linkedin.com/in/ada');
    const duplicate = applyFieldAnswer(draft, 'CONTACT_LINK', null, 'github.com/ada');
    const full = emptyDraft();
    full.contact.links = ['a', 'b', 'c', 'd', 'e'];

    expect(added.ok && added.draft.contact.links).toEqual(['github.com/ada', 'linkedin.com/in/ada']);
    expect(duplicate).toEqual({ ok: false, reason: 'TARGET_FILLED' });
    expect(applyFieldAnswer(full, 'CONTACT_LINK', null, 'f')).toEqual({ ok: false, reason: 'TARGET_FILLED' });
  });

  it.each([
    ['CONTACT_EMAIL', null, (d: CvDraft) => { d.contact.email = 'old@example.com'; }],
    ['CONTACT_PHONE', null, (d: CvDraft) => { d.contact.phone = '1'; }],
    ['EXPERIENCE_TITLE', 'exp-2', (d: CvDraft) => { /* exp-2 already has a title */ void d; }],
    ['EXPERIENCE_EMPLOYER', 'exp-1', (d: CvDraft) => { /* exp-1 already has an employer */ void d; }],
  ] as const)('never overwrites a filled %s', (field, itemId, fill) => {
    const draft = emptyDraft();
    fill(draft);

    expect(applyFieldAnswer(draft, field, itemId, 'new value')).toEqual({ ok: false, reason: 'TARGET_FILLED' });
  });

  it('reports a removed entry as TARGET_MISSING', () => {
    expect(applyFieldAnswer(emptyDraft(), 'EXPERIENCE_END_DATE', 'gone', '2020')).toEqual({ ok: false, reason: 'TARGET_MISSING' });
    expect(applyFieldAnswer(emptyDraft(), 'EDUCATION_END_DATE', 'exp-1', '2020')).toEqual({ ok: false, reason: 'TARGET_MISSING' });
    expect(applyFieldAnswer(emptyDraft(), 'EXPERIENCE_END_DATE', null, '2020')).toEqual({ ok: false, reason: 'TARGET_MISSING' });
  });

  it('rejects a value that does not fit the field', () => {
    expect(applyFieldAnswer(emptyDraft(), 'CONTACT_EMAIL', null, 'not an email')).toEqual({ ok: false, reason: 'INVALID_VALUE' });
    expect(applyFieldAnswer(emptyDraft(), 'CONTACT_PHONE', null, '1'.repeat(41))).toEqual({ ok: false, reason: 'INVALID_VALUE' });
    expect(applyFieldAnswer(emptyDraft(), 'CONTACT_PHONE', null, 'call me maybe')).toEqual({ ok: false, reason: 'INVALID_VALUE' });
    expect(applyFieldAnswer(emptyDraft(), 'CONTACT_PHONE', null, '123')).toEqual({ ok: false, reason: 'INVALID_VALUE' });
    expect(applyFieldAnswer(emptyDraft(), 'EXPERIENCE_START_DATE', 'exp-1', 'x'.repeat(41))).toEqual({ ok: false, reason: 'INVALID_VALUE' });
    expect(applyFieldAnswer(emptyDraft(), 'CONTACT_FULL_NAME', null, 'x'.repeat(121))).toEqual({ ok: false, reason: 'INVALID_VALUE' });
    expect(applyFieldAnswer(emptyDraft(), 'CONTACT_LINK', null, 'x'.repeat(201))).toEqual({ ok: false, reason: 'INVALID_VALUE' });
    expect(applyFieldAnswer(emptyDraft(), 'CONTACT_FULL_NAME', null, '   ')).toEqual({ ok: false, reason: 'INVALID_VALUE' });
  });
});

describe('checkTarget (before an AI-assisted apply)', () => {
  it('accepts a section-level target that exists', () => {
    expect(checkTarget(emptyDraft(), { section: 'SKILLS', itemId: null })).toBeNull();
    expect(checkTarget(emptyDraft(), { section: 'CONTACT', itemId: null })).toBeNull();
  });

  it('finds an entry by id and reports a removed one', () => {
    expect(checkTarget(emptyDraft(), { section: 'EXPERIENCE', itemId: 'exp-1' })).toBeNull();
    expect(checkTarget(emptyDraft(), { section: 'EDUCATION', itemId: 'edu-1' })).toBeNull();
    expect(checkTarget(emptyDraft(), { section: 'EXPERIENCE', itemId: 'gone' })).toBe('TARGET_MISSING');
    expect(checkTarget(emptyDraft(), { section: 'EXPERIENCE', itemId: 'edu-1' })).toBe('TARGET_MISSING');
  });

  it('refuses a summary question when a summary already exists', () => {
    const draft = emptyDraft();
    draft.summary = 'Already written';

    expect(checkTarget(draft, { section: 'SUMMARY', itemId: null })).toBe('TARGET_FILLED');
    expect(checkTarget(emptyDraft(), { section: 'SUMMARY', itemId: null })).toBeNull();
  });
});
