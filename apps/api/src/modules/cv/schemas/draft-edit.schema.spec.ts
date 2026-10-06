import type { CvDraft } from '../generation/draft.schema.js';
import { cvDraftEditBodySchema } from './draft-edit.schema.js';

function draft(): CvDraft {
  return {
    schemaVersion: 2,
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
    skillCategories: [{ id: 'cat-1', name: 'Backend', skills: ['Node.js', 'PostgreSQL'] }],
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

  it('rejects a schemaVersion other than 2 and the old flat skills shape', () => {
    expect(paths({ revision: 0, draft: { ...draft(), schemaVersion: 1 } })).toContain(
      'draft.schemaVersion',
    );
    const { skillCategories: _categories, ...rest } = draft();
    expect(parse({ revision: 0, draft: { ...rest, schemaVersion: 1, skills: ['Go'] } }).success).toBe(false);
  });

  it('applies the existing size caps', () => {
    const tooMuch = draft();
    tooMuch.contact.fullName = 'x'.repeat(121);
    tooMuch.summary = 'x'.repeat(1201);
    tooMuch.skillCategories = Array.from({ length: 13 }, (_, index) => ({ id: `c${index}`, name: `Category ${index}`, skills: [`skill-${index}`] }));
    const first = tooMuch.experience[0];
    if (first) {
      first.bullets = Array.from({ length: 13 }, () => 'bullet');
    }

    const result = paths({ revision: 0, draft: tooMuch });

    expect(result).toEqual(
      expect.arrayContaining([
        'draft.contact.fullName',
        'draft.summary',
        'draft.skillCategories',
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
    edited.skillCategories[0]!.skills = ['y'.repeat(61)];

    expect(paths({ revision: 0, draft: edited })).toEqual(
      expect.arrayContaining(['draft.experience.0.bullets.0', 'draft.skillCategories.0.skills.0']),
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

  describe('skill categories (write-path rules)', () => {
    it('rejects category names that repeat ignoring case', () => {
      const edited = draft();
      edited.skillCategories.push({ id: 'cat-2', name: ' backend ', skills: ['Go'] });

      expect(paths({ revision: 0, draft: edited })).toContain('draft.skillCategories.1.name');
    });

    it('rejects a skill that repeats across categories ignoring case', () => {
      const edited = draft();
      edited.skillCategories.push({ id: 'cat-2', name: 'Languages', skills: ['go', 'NODE.JS'] });

      expect(paths({ revision: 0, draft: edited })).toContain('draft.skillCategories.1.skills.1');
    });

    it('rejects a skill that repeats inside one category', () => {
      const edited = draft();
      edited.skillCategories[0]!.skills = ['Go', 'go'];

      expect(paths({ revision: 0, draft: edited })).toContain('draft.skillCategories.0.skills.1');
    });

    it('rejects an empty category and accepts a draft with no categories', () => {
      const empty = draft();
      empty.skillCategories.push({ id: 'cat-2', name: 'Languages', skills: [] });
      const none = draft();
      none.skillCategories = [];

      expect(paths({ revision: 0, draft: empty })).toContain('draft.skillCategories.1.skills');
      expect(parse({ revision: 0, draft: none }).success).toBe(true);
    });

    it('rejects a duplicate category id', () => {
      const edited = draft();
      edited.skillCategories.push({ id: 'cat-1', name: 'Languages', skills: ['Go'] });

      expect(paths({ revision: 0, draft: edited })).toContain('draft.skillCategories.1.id');
    });

    it('rejects more than 60 skills in total', () => {
      const edited = draft();
      edited.skillCategories = [
        { id: 'a', name: 'A', skills: Array.from({ length: 31 }, (_, i) => `a${i}`) },
        { id: 'b', name: 'B', skills: Array.from({ length: 30 }, (_, i) => `b${i}`) },
      ];

      expect(paths({ revision: 0, draft: edited })).toContain('draft.skillCategories');
    });
  });

  describe('target role', () => {
    it('is optional: absent means the stored role is unchanged', () => {
      const result = parse({ revision: 1, draft: draft() });

      expect(result.success && result.data.targetRole).toBe(undefined);
    });

    it('is trimmed when present', () => {
      const result = parse({ revision: 1, draft: draft(), targetRole: '  Staff Engineer ' });

      expect(result.success && result.data.targetRole).toBe('Staff Engineer');
    });

    it.each([['blank', '   '], ['empty', ''], ['too long', 'r'.repeat(201)], ['not text', 5]])(
      'rejects a %s role',
      (_label, targetRole) => {
        expect(paths({ revision: 1, draft: draft(), targetRole })).toContain('targetRole');
      },
    );
  });
});
