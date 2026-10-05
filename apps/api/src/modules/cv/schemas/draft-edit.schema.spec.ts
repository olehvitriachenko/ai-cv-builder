import type { CvDraft } from '../generation/draft.schema.js';
import { cvDraftEditBodySchema } from './draft-edit.schema.js';

function draft(): CvDraft {
  return {
    schemaVersion: 1,
    contact: {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      location: null,
      links: [],
    },
    summary: 'Backend engineer.',
    experience: [
      {
        id: 'exp-1',
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
        id: 'edu-1',
        institution: 'State University',
        qualification: 'BSc',
        startDate: null,
        endDate: '2015',
        details: null,
      },
    ],
    skills: ['Node.js'],
  };
}

function parse(body: unknown) {
  return cvDraftEditBodySchema.safeParse(body);
}

function paths(body: unknown): string[] {
  const result = parse(body);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('cvDraftEditBodySchema', () => {
  it('accepts a valid draft with the revision it is based on', () => {
    const result = parse({ revision: 3, draft: draft() });

    expect(result.success).toBe(true);
  });

  it('trims strings like the generated draft', () => {
    const edited = draft();
    edited.contact.fullName = '  Ada Lovelace  ';

    const result = parse({ revision: 0, draft: edited });

    expect(result.success && result.data.draft.contact.fullName).toBe('Ada Lovelace');
  });

  it.each([-1, 1.5, '2', null, undefined])('rejects revision %s', (revision) => {
    expect(paths({ revision, draft: draft() })).toContain('revision');
  });

  it('rejects a schemaVersion other than 1', () => {
    expect(paths({ revision: 0, draft: { ...draft(), schemaVersion: 2 } })).toContain(
      'draft.schemaVersion',
    );
  });

  it('applies the existing size caps', () => {
    const tooMuch = draft();
    tooMuch.contact.fullName = 'x'.repeat(121);
    tooMuch.summary = 'x'.repeat(1201);
    tooMuch.skills = Array.from({ length: 61 }, (_, index) => `skill-${index}`);
    const first = tooMuch.experience[0];
    if (first) {
      first.bullets = Array.from({ length: 13 }, () => 'bullet');
    }

    const result = paths({ revision: 0, draft: tooMuch });

    expect(result).toEqual(
      expect.arrayContaining([
        'draft.contact.fullName',
        'draft.summary',
        'draft.skills',
        'draft.experience.0.bullets',
      ]),
    );
  });

  it('rejects a bullet over 300 characters and a skill over 60', () => {
    const edited = draft();
    const first = edited.experience[0];
    if (first) {
      first.bullets = ['x'.repeat(301)];
    }
    edited.skills = ['y'.repeat(61)];

    expect(paths({ revision: 0, draft: edited })).toEqual(
      expect.arrayContaining(['draft.experience.0.bullets.0', 'draft.skills.0']),
    );
  });

  it('rejects blank strings (an emptied field must be sent as null)', () => {
    const edited = draft();
    edited.summary = '   ';

    expect(paths({ revision: 0, draft: edited })).toContain('draft.summary');
  });

  it('rejects an experience entry with neither employer nor title', () => {
    const edited = draft();
    const first = edited.experience[0];
    if (first) {
      first.employer = null;
      first.title = null;
    }

    expect(paths({ revision: 0, draft: edited }).some((path) => path.startsWith('draft.experience.0'))).toBe(true);
  });

  it('rejects an education entry with neither institution nor qualification', () => {
    const edited = draft();
    const first = edited.education[0];
    if (first) {
      first.institution = null;
      first.qualification = null;
    }

    expect(paths({ revision: 0, draft: edited }).some((path) => path.startsWith('draft.education.0'))).toBe(true);
  });

  it('rejects a duplicate entry id across experience and education', () => {
    const edited = draft();
    const education = edited.education[0];
    if (education) {
      education.id = 'exp-1';
    }

    expect(paths({ revision: 0, draft: edited })).toContain('draft.education.0.id');
  });

  it('rejects a duplicate entry id within experience', () => {
    const edited = draft();
    const first = edited.experience[0];
    if (first) {
      edited.experience.push({ ...first, bullets: [] });
    }

    expect(paths({ revision: 0, draft: edited })).toContain('draft.experience.1.id');
  });

  it('rejects a malformed email and accepts a missing one', () => {
    const bad = draft();
    bad.contact.email = 'not-an-email';
    const none = draft();
    none.contact.email = null;

    expect(paths({ revision: 0, draft: bad })).toContain('draft.contact.email');
    expect(parse({ revision: 0, draft: none }).success).toBe(true);
  });

  it('allows at most 5 links, 30 experience and 10 education entries', () => {
    const many = draft();
    many.contact.links = Array.from({ length: 6 }, (_, index) => `link-${index}`);

    expect(paths({ revision: 0, draft: many })).toContain('draft.contact.links');
  });

  it('strips unknown keys such as a client userId', () => {
    const result = parse({ revision: 1, draft: draft(), userId: 'someone-else' });

    expect(result.success && 'userId' in result.data).toBe(false);
  });
});
