import type { AnswerPatch } from '../../ai/schemas/answer-patch.schema.js';
import { cvDraftSchema, type CvDraft } from '../generation/draft.schema.js';
import { applyAnswerPatch, type PatchTarget } from './answer-patch.js';

function baseDraft(): CvDraft {
  return {
    schemaVersion: 1,
    contact: { fullName: null, email: null, phone: null, location: 'London', links: ['github.com/ada'] },
    summary: null,
    experience: [
      { id: 'exp-1', employer: 'Acme Corp', title: 'Engineer', location: null, startDate: null, endDate: null, bullets: ['Built APIs'] },
      { id: 'exp-2', employer: 'Globex', title: null, location: null, startDate: '2010', endDate: '2012', bullets: [] },
    ],
    education: [{ id: 'edu-1', institution: 'State University', qualification: 'BSc', startDate: null, endDate: null, details: null }],
    skills: ['Node.js', 'SQL'],
  };
}

const expPatch = (overrides: Partial<Extract<AnswerPatch, { bullets: string[] }>> = {}): AnswerPatch => ({
  employer: null,
  title: null,
  location: null,
  startDate: null,
  endDate: null,
  bullets: [],
  ...overrides,
});

const exp1: PatchTarget = { section: 'EXPERIENCE', itemId: 'exp-1' };

function issues(result: ReturnType<typeof applyAnswerPatch>): string[] {
  return result.ok ? [] : result.issues.map((issue) => `${issue.path}: ${issue.rule}`);
}

describe('applyAnswerPatch', () => {
  describe('experience entry', () => {
    it('appends bullets to the targeted entry and leaves the others untouched', () => {
      const result = applyAnswerPatch(baseDraft(), exp1, expPatch({ bullets: ['Mentored two engineers through code reviews'] }), 'I mentored two engineers through code reviews');

      expect(result.ok && result.draft.experience[0]?.bullets).toEqual(['Built APIs', 'Mentored two engineers through code reviews']);
      expect(result.ok && result.draft.experience[1]).toEqual(baseDraft().experience[1]);
      expect(result.ok && result.draft.contact).toEqual(baseDraft().contact);
      expect(result.ok && cvDraftSchema.safeParse(result.draft).success).toBe(true);
    });

    it('fills empty scalars of the entry', () => {
      const result = applyAnswerPatch(baseDraft(), exp1, expPatch({ startDate: '2019', endDate: '2021' }), '2019 to 2021');

      expect(result.ok && result.draft.experience[0]).toMatchObject({ startDate: '2019', endDate: '2021', employer: 'Acme Corp' });
    });

    it('never overwrites a filled scalar: that is an issue, not an overwrite', () => {
      const result = applyAnswerPatch(baseDraft(), { section: 'EXPERIENCE', itemId: 'exp-2' }, expPatch({ startDate: '2011' }), '2011');

      expect(issues(result)).toEqual(['patch.startDate: would_overwrite']);
    });

    it('skips bullets already present and caps the entry at 12 bullets', () => {
      const draft = baseDraft();
      const entry = draft.experience[0];
      if (entry) {
        entry.bullets = Array.from({ length: 12 }, (_, index) => `bullet ${index}`);
      }

      const full = applyAnswerPatch(draft, exp1, expPatch({ bullets: ['one more'] }), 'one more');
      const duplicate = applyAnswerPatch(baseDraft(), exp1, expPatch({ bullets: ['Built APIs', 'Brand new'] }), 'Brand new');

      expect(issues(full)).toEqual(['patch.bullets: too_many_bullets']);
      expect(duplicate.ok && duplicate.draft.experience[0]?.bullets).toEqual(['Built APIs', 'Brand new']);
    });

    it('rejects an empty patch: nothing changed, so the question is not applied', () => {
      expect(issues(applyAnswerPatch(baseDraft(), exp1, expPatch(), 'x'))).toEqual(['patch: empty_patch']);
      expect(issues(applyAnswerPatch(baseDraft(), exp1, expPatch({ bullets: ['  ', ''] }), 'x'))).toEqual(['patch: empty_patch']);
      expect(issues(applyAnswerPatch(baseDraft(), exp1, expPatch({ bullets: ['Built APIs'] }), 'x'))).toEqual(['patch: empty_patch']);
    });

    it('reports a removed entry', () => {
      const result = applyAnswerPatch(baseDraft(), { section: 'EXPERIENCE', itemId: 'gone' }, expPatch({ bullets: ['x'] }), 'x');

      expect(issues(result)).toEqual(['target: target_missing']);
    });

    it('rejects an employer the answer or entry does not support (no invented organisations)', () => {
      const entry = baseDraft();
      const target = entry.experience[1];
      if (target) {
        target.employer = null;
        target.title = 'Consultant';
      }

      const invented = applyAnswerPatch(entry, { section: 'EXPERIENCE', itemId: 'exp-2' }, expPatch({ employer: 'Initech' }), 'I worked at Hooli');
      const supported = applyAnswerPatch(entry, { section: 'EXPERIENCE', itemId: 'exp-2' }, expPatch({ employer: 'Hooli' }), 'I worked at Hooli');

      expect(issues(invented)).toEqual(['patch.employer: unsupported_organisation']);
      expect(supported.ok && supported.draft.experience[1]?.employer).toBe('Hooli');
    });

    it('enforces the draft caps on the result', () => {
      const result = applyAnswerPatch(baseDraft(), exp1, expPatch({ bullets: ['x'.repeat(301)] }), 'x');

      expect(result.ok).toBe(false);
      expect(issues(result).join()).toContain('draft_');
    });
  });

  describe('education entry', () => {
    const eduTarget: PatchTarget = { section: 'EDUCATION', itemId: 'edu-1' };
    const eduPatch = (overrides: Partial<Extract<AnswerPatch, { institution: string | null }>> = {}): AnswerPatch => ({
      institution: null,
      qualification: null,
      startDate: null,
      endDate: null,
      details: null,
      ...overrides,
    });

    it('fills details and dates on the entry', () => {
      const result = applyAnswerPatch(baseDraft(), eduTarget, eduPatch({ details: 'First class honours', endDate: '2015' }), 'First class honours, graduated 2015');

      expect(result.ok && result.draft.education[0]).toMatchObject({ details: 'First class honours', endDate: '2015', qualification: 'BSc' });
    });

    it('refuses to replace a filled qualification', () => {
      expect(issues(applyAnswerPatch(baseDraft(), eduTarget, eduPatch({ qualification: 'MSc' }), 'MSc'))).toEqual(['patch.qualification: would_overwrite']);
    });
  });

  describe('contact', () => {
    const contactTarget: PatchTarget = { section: 'CONTACT', itemId: null };
    const contactPatch = (overrides: Partial<Extract<AnswerPatch, { fullName: string | null }>> = {}): AnswerPatch => ({
      fullName: null,
      email: null,
      phone: null,
      location: null,
      links: [],
      ...overrides,
    });

    it('fills email and phone only when the answer states them', () => {
      const ok = applyAnswerPatch(baseDraft(), contactTarget, contactPatch({ email: 'ada@example.com', phone: '+44 20 7946 0958' }), 'ada@example.com, phone +44 20 7946 0958');
      const invented = applyAnswerPatch(baseDraft(), contactTarget, contactPatch({ email: 'other@example.com' }), 'my email is ada@example.com');

      expect(ok.ok && ok.draft.contact).toMatchObject({ email: 'ada@example.com', phone: '+44 20 7946 0958' });
      expect(issues(invented)).toEqual(['patch.email: unsupported_contact']);
    });

    it('only accepts a name and a link that the answer contains', () => {
      const name = applyAnswerPatch(baseDraft(), contactTarget, contactPatch({ fullName: 'Ada Lovelace' }), 'Hi, I am Ada Lovelace');
      const badName = applyAnswerPatch(baseDraft(), contactTarget, contactPatch({ fullName: 'Grace Hopper' }), 'Hi, I am Ada Lovelace');
      const link = applyAnswerPatch(baseDraft(), contactTarget, contactPatch({ links: ['linkedin.com/in/ada'] }), 'https://linkedin.com/in/ada');
      const badLink = applyAnswerPatch(baseDraft(), contactTarget, contactPatch({ links: ['evil.example/ada'] }), 'https://linkedin.com/in/ada');

      expect(name.ok).toBe(true);
      expect(issues(badName)).toEqual(['patch.fullName: unsupported_name']);
      expect(link.ok && link.draft.contact.links).toEqual(['github.com/ada', 'linkedin.com/in/ada']);
      expect(issues(badLink)).toEqual(['patch.links.0: unsupported_contact']);
    });

    it('does not replace an existing location and caps links at 5', () => {
      const location = applyAnswerPatch(baseDraft(), contactTarget, contactPatch({ location: 'Paris' }), 'Paris');
      const draft = baseDraft();
      draft.contact.links = ['a.example', 'b.example', 'c.example', 'd.example', 'e.example'];
      const links = applyAnswerPatch(draft, contactTarget, contactPatch({ links: ['f.example'] }), 'f.example');

      expect(issues(location)).toEqual(['patch.location: would_overwrite']);
      expect(issues(links)).toEqual(['patch.links: too_many_links']);
    });
  });

  describe('summary and skills', () => {
    it('writes a summary only into an empty summary', () => {
      const result = applyAnswerPatch(baseDraft(), { section: 'SUMMARY', itemId: null }, { summary: 'Backend engineer focused on APIs.' }, 'focus on APIs');
      const draft = baseDraft();
      draft.summary = 'My own words';
      const refused = applyAnswerPatch(draft, { section: 'SUMMARY', itemId: null }, { summary: 'Rewritten' }, 'x');

      expect(result.ok && result.draft.summary).toBe('Backend engineer focused on APIs.');
      expect(issues(refused)).toEqual(['target: target_filled']);
    });

    it('rejects a null summary patch as empty', () => {
      expect(issues(applyAnswerPatch(baseDraft(), { section: 'SUMMARY', itemId: null }, { summary: null }, 'x'))).toEqual(['patch: empty_patch']);
    });

    it('appends new skills, ignores case-insensitive duplicates and caps at 60', () => {
      const result = applyAnswerPatch(baseDraft(), { section: 'SKILLS', itemId: null }, { skills: ['node.js', 'Go', ' Rust '] }, 'Go and Rust');
      const draft = baseDraft();
      draft.skills = Array.from({ length: 60 }, (_, index) => `skill-${index}`);
      const full = applyAnswerPatch(draft, { section: 'SKILLS', itemId: null }, { skills: ['One more'] }, 'x');

      expect(result.ok && result.draft.skills).toEqual(['Node.js', 'SQL', 'Go', 'Rust']);
      expect(issues(full)).toEqual(['patch.skills: too_many_skills']);
    });

    it('treats only-duplicate skills as an empty patch', () => {
      expect(issues(applyAnswerPatch(baseDraft(), { section: 'SKILLS', itemId: null }, { skills: ['SQL'] }, 'x'))).toEqual(['patch: empty_patch']);
    });
  });

  it('rejects a patch of the wrong scope', () => {
    const result = applyAnswerPatch(baseDraft(), { section: 'SKILLS', itemId: null }, { summary: 'x' }, 'x');

    expect(issues(result)).toEqual(['patch: wrong_scope']);
  });

  it('reports only rule ids and paths, never draft or answer text', () => {
    const result = applyAnswerPatch(baseDraft(), { section: 'CONTACT', itemId: null }, { fullName: 'Secret Person', email: null, phone: null, location: null, links: [] }, 'nothing relevant');

    expect(JSON.stringify(result)).not.toContain('Secret Person');
    expect(JSON.stringify(result)).not.toContain('nothing relevant');
  });

  it('does not mutate the input draft', () => {
    const draft = baseDraft();

    applyAnswerPatch(draft, exp1, expPatch({ bullets: ['New'] }), 'New');

    expect(draft).toEqual(baseDraft());
  });
});
