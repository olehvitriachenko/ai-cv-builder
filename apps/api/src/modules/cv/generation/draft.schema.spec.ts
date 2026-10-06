import { cvDraftSchema, type CvDraft } from './draft.schema.js';

function minimalDraft() {
  return {
    schemaVersion: 2,
    contact: { fullName: null, email: null, phone: null, location: null, links: [] },
    summary: null,
    experience: [],
    education: [],
    skillCategories: [],
  };
}

function fullDraft(): CvDraft {
  return {
    schemaVersion: 2,
    contact: {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+44 20 7946 0958',
      location: 'London',
      links: ['https://example.com/ada'],
    },
    summary: 'Backend engineer.',
    experience: [
      {
        id: 'e1',
        employer: 'Acme Corp',
        title: 'Engineer',
        location: null,
        startDate: '2016',
        endDate: '2023',
        bullets: ['Built REST APIs'],
      },
    ],
    education: [
      {
        id: 'd1',
        institution: 'State University',
        qualification: 'BSc Computer Science',
        startDate: null,
        endDate: '2015',
        details: null,
      },
    ],
    languages: [], certifications: [], portfolio: [], hobbies: [], customSections: [],
    skillCategories: [{ id: 'c1', name: 'Backend', skills: ['Node.js', 'PostgreSQL'] }],
  };
}

describe('cvDraftSchema', () => {
  it('accepts a full draft and a minimal draft with every fact null', () => {
    expect(cvDraftSchema.safeParse(fullDraft()).success).toBe(true);
    expect(cvDraftSchema.safeParse(minimalDraft()).success).toBe(true);
  });

  it('rejects a wrong schemaVersion (version 1 is no longer supported) and missing sections', () => {
    expect(cvDraftSchema.safeParse({ ...minimalDraft(), schemaVersion: 1 }).success).toBe(false);
    expect(cvDraftSchema.safeParse({ ...minimalDraft(), schemaVersion: 3 }).success).toBe(false);
    const { skillCategories: _categories, ...withoutCategories } = minimalDraft();
    expect(cvDraftSchema.safeParse(withoutCategories).success).toBe(false);
  });

  it('does not accept the old flat skills list in place of categories', () => {
    const { skillCategories: _categories, ...rest } = minimalDraft();
    expect(cvDraftSchema.safeParse({ ...rest, skills: ['Node.js'] }).success).toBe(false);
  });

  it.each([
    ['fullName', (d: CvDraft) => (d.contact.fullName = 'a'.repeat(121))],
    ['email', (d: CvDraft) => (d.contact.email = 'a'.repeat(255))],
    ['phone', (d: CvDraft) => (d.contact.phone = '1'.repeat(41))],
    ['location', (d: CvDraft) => (d.contact.location = 'a'.repeat(121))],
    ['links count', (d: CvDraft) => (d.contact.links = Array<string>(6).fill('x'))],
    ['link length', (d: CvDraft) => (d.contact.links = ['a'.repeat(201)])],
    ['summary', (d: CvDraft) => (d.summary = 'a'.repeat(1201))],
    [
      'categories count',
      (d: CvDraft) => {
        d.skillCategories = Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, skills: ['x'] }));
      },
    ],
    ['category name length', (d: CvDraft) => (d.skillCategories[0]!.name = 'a'.repeat(61))],
    ['empty category name', (d: CvDraft) => (d.skillCategories[0]!.name = '  ')],
    ['category id', (d: CvDraft) => (d.skillCategories[0]!.id = '')],
    ['skill length', (d: CvDraft) => (d.skillCategories[0]!.skills = ['a'.repeat(61)])],
    ['empty skill', (d: CvDraft) => (d.skillCategories[0]!.skills = [''])],
    [
      'skills in total',
      (d: CvDraft) => {
        d.skillCategories = [
          { id: 'a', name: 'A', skills: Array.from({ length: 31 }, (_, i) => `a${i}`) },
          { id: 'b', name: 'B', skills: Array.from({ length: 30 }, (_, i) => `b${i}`) },
        ];
      },
    ],
    ['bullet length', (d: CvDraft) => (d.experience[0]!.bullets = ['a'.repeat(301)])],
    ['bullets count', (d: CvDraft) => (d.experience[0]!.bullets = Array<string>(13).fill('x'))],
    ['employer', (d: CvDraft) => (d.experience[0]!.employer = 'a'.repeat(201))],
    ['startDate', (d: CvDraft) => (d.experience[0]!.startDate = 'a'.repeat(41))],
    ['education details', (d: CvDraft) => (d.education[0]!.details = 'a'.repeat(301))],
    [
      'experience count',
      (d: CvDraft) => {
        d.experience = Array.from({ length: 31 }, (_, i) => ({
          ...fullDraft().experience[0]!,
          id: `e${i}`,
        }));
      },
    ],
    [
      'education count',
      (d: CvDraft) => {
        d.education = Array.from({ length: 11 }, (_, i) => ({
          ...fullDraft().education[0]!,
          id: `d${i}`,
        }));
      },
    ],
  ])('rejects %s one over its cap', (_name, mutate) => {
    const draft = fullDraft();
    mutate(draft);
    expect(cvDraftSchema.safeParse(draft).success).toBe(false);
  });

  it('accepts values exactly at the caps', () => {
    const draft = fullDraft();
    draft.summary = 'a'.repeat(1200);
    draft.skillCategories = Array.from({ length: 12 }, (_, c) => ({
      id: `c${c}`,
      name: 'n'.repeat(60),
      skills: Array.from({ length: 5 }, () => 's'.repeat(60)),
    }));
    draft.experience[0]!.bullets = Array<string>(12).fill('b'.repeat(300));
    expect(cvDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('rejects empty and whitespace-only strings (null is the way to say unknown)', () => {
    const empty = fullDraft();
    empty.summary = '';
    expect(cvDraftSchema.safeParse(empty).success).toBe(false);

    const blank = fullDraft();
    blank.contact.email = '   ';
    expect(cvDraftSchema.safeParse(blank).success).toBe(false);

    const emptyBullet = fullDraft();
    emptyBullet.experience[0]!.bullets = [''];
    expect(cvDraftSchema.safeParse(emptyBullet).success).toBe(false);
  });

  it('rejects an experience entry with neither employer nor title', () => {
    const draft = fullDraft();
    draft.experience[0]!.employer = null;
    draft.experience[0]!.title = null;
    expect(cvDraftSchema.safeParse(draft).success).toBe(false);
  });

  it('rejects an education entry with neither institution nor qualification', () => {
    const draft = fullDraft();
    draft.education[0]!.institution = null;
    draft.education[0]!.qualification = null;
    expect(cvDraftSchema.safeParse(draft).success).toBe(false);
  });

  it('allows a title without an employer and an institution without a qualification', () => {
    const draft = fullDraft();
    draft.experience[0]!.employer = null;
    draft.education[0]!.qualification = null;
    expect(cvDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('allows a category with no skills in the stored shape (the editor drops empty categories before saving)', () => {
    const draft = fullDraft();
    draft.skillCategories[0]!.skills = [];
    expect(cvDraftSchema.safeParse(draft).success).toBe(true);
  });
});

describe('cvDraftSchema optional sections', () => {
  it('reads a draft stored before the sections existed as having none', () => {
    const result = cvDraftSchema.safeParse(minimalDraft());

    expect(result.success && result.data.languages).toEqual([]);
    expect(result.success && result.data.certifications).toEqual([]);
    expect(result.success && result.data.portfolio).toEqual([]);
    expect(result.success && result.data.hobbies).toEqual([]);
    expect(result.success && result.data.customSections).toEqual([]);
  });

  it('accepts every section with its optional values null', () => {
    const result = cvDraftSchema.safeParse({
      ...minimalDraft(),
      languages: [{ id: 'l1', name: 'English', level: 'C1' }, { id: 'l2', name: 'German', level: null }],
      certifications: [{ id: 'c1', name: 'AWS SAA', issuer: null, date: null, link: null }],
      portfolio: [{ id: 'p1', name: 'CV Builder', link: null, description: null }],
      hobbies: ['Chess', 'Climbing'],
      customSections: [{ id: 's1', title: 'Volunteering', content: 'Food bank\nMentoring' }],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a level outside the five and blank required values', () => {
    const base = minimalDraft();
    expect(cvDraftSchema.safeParse({ ...base, languages: [{ id: 'l', name: 'English', level: 'Excellent' }] }).success).toBe(false);
    expect(cvDraftSchema.safeParse({ ...base, languages: [{ id: 'l', name: '  ', level: null }] }).success).toBe(false);
    expect(cvDraftSchema.safeParse({ ...base, hobbies: ['  '] }).success).toBe(false);
    expect(cvDraftSchema.safeParse({ ...base, customSections: [{ id: 's', title: 'T', content: '' }] }).success).toBe(false);
  });

  it('enforces the size limits', () => {
    const base = minimalDraft();
    const many = (count: number, make: (index: number) => unknown) => Array.from({ length: count }, (_, index) => make(index));
    expect(cvDraftSchema.safeParse({ ...base, languages: many(13, (i) => ({ id: `l${i}`, name: `L${i}`, level: null })) }).success).toBe(false);
    expect(cvDraftSchema.safeParse({ ...base, languages: many(12, (i) => ({ id: `l${i}`, name: `L${i}`, level: null })) }).success).toBe(true);
    expect(cvDraftSchema.safeParse({ ...base, certifications: many(16, (i) => ({ id: `c${i}`, name: `C${i}`, issuer: null, date: null, link: null })) }).success).toBe(false);
    expect(cvDraftSchema.safeParse({ ...base, portfolio: many(9, (i) => ({ id: `p${i}`, name: `P${i}`, link: null, description: null })) }).success).toBe(false);
    expect(cvDraftSchema.safeParse({ ...base, hobbies: many(16, (i) => `H${i}`) }).success).toBe(false);
    expect(cvDraftSchema.safeParse({ ...base, hobbies: ['h'.repeat(61)] }).success).toBe(false);
    expect(cvDraftSchema.safeParse({ ...base, customSections: many(4, (i) => ({ id: `s${i}`, title: `T${i}`, content: 'x' })) }).success).toBe(false);
    expect(cvDraftSchema.safeParse({ ...base, customSections: [{ id: 's', title: 'T', content: 'x'.repeat(1201) }] }).success).toBe(false);
    expect(cvDraftSchema.safeParse({ ...base, portfolio: [{ id: 'p', name: 'P', link: null, description: 'd'.repeat(301) }] }).success).toBe(false);
  });
});

