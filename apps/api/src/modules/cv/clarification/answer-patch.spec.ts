import type { AnswerPatch } from '../../ai/schemas/answer-patch.schema.js';
import { cvDraftSchema, type CvDraft } from '../generation/draft.schema.js';
import { applyAnswerPatch, type PatchTarget } from './answer-patch.js';

function baseDraft(): CvDraft {
  return {
    schemaVersion: 2,
    contact: { fullName: null, email: null, phone: null, location: 'London', links: ['github.com/ada'] },
    summary: null,
    experience: [
      { id: 'exp-1', employer: 'Acme Corp', title: 'Engineer', location: null, startDate: null, endDate: null, bullets: ['Built APIs'] },
      { id: 'exp-2', employer: 'Globex', title: null, location: null, startDate: '2010', endDate: '2012', bullets: [] },
    ],
    education: [{ id: 'edu-1', institution: 'State University', qualification: 'BSc', startDate: null, endDate: null, details: null }],
    languages: [], certifications: [], portfolio: [], hobbies: [], customSections: [],
    skillCategories: [
      { id: 'cat-1', name: 'Backend', skills: ['Node.js', 'SQL'] },
      { id: 'cat-2', name: 'My tools', skills: ['Vim'] },
    ],
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

  describe('summary', () => {
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
  });

  describe('skills', () => {
    const skillsTarget: PatchTarget = { section: 'SKILLS', itemId: null };
    const additions = (...items: { category: string; skills: string[] }[]): AnswerPatch => ({ additions: items });
    const categories = (result: ReturnType<typeof applyAnswerPatch>) =>
      result.ok ? result.draft.skillCategories.map((c) => [c.name, c.skills]) : [];
    let counter = 0;
    const newId = () => `new-${++counter}`;

    it('appends to the category with the same name, ignoring case, and never removes anything', () => {
      const result = applyAnswerPatch(baseDraft(), skillsTarget, additions({ category: 'backend', skills: ['Go', ' Rust '] }), 'Go and Rust', newId);

      expect(categories(result)).toEqual([
        ['Backend', ['Node.js', 'SQL', 'Go', 'Rust']],
        ['My tools', ['Vim']],
      ]);
    });

    it('can append to an existing custom category', () => {
      const result = applyAnswerPatch(baseDraft(), skillsTarget, additions({ category: 'My tools', skills: ['Emacs'] }), 'I also use Emacs', newId);

      expect(categories(result)).toEqual([
        ['Backend', ['Node.js', 'SQL']],
        ['My tools', ['Vim', 'Emacs']],
      ]);
    });

    it('creates a new category at the end when it is a predefined name, using the catalogue spelling and a generated id', () => {
      counter = 0;
      const result = applyAnswerPatch(baseDraft(), skillsTarget, additions({ category: ' databases ', skills: ['PostgreSQL'] }), 'PostgreSQL', newId);

      expect(categories(result)).toEqual([
        ['Backend', ['Node.js', 'SQL']],
        ['My tools', ['Vim']],
        ['Databases', ['PostgreSQL']],
      ]);
      expect(result.ok && result.draft.skillCategories[2]?.id).toBe('new-1');
    });

    it('creates the fallback Skills category when needed', () => {
      const result = applyAnswerPatch(baseDraft(), skillsTarget, additions({ category: 'skills', skills: ['Origami'] }), 'origami', newId);

      expect(categories(result).at(-1)).toEqual(['Skills', ['Origami']]);
    });

    it('rejects a new category that is neither predefined nor the fallback, naming only the path', () => {
      const result = applyAnswerPatch(baseDraft(), skillsTarget, additions({ category: 'Secret Category', skills: ['Go'] }), 'x', newId);

      expect(issues(result)).toEqual(['patch.additions.0.category: unknown_category']);
      expect(JSON.stringify(result)).not.toContain('Secret Category');
    });

    it('rejects a blank category name', () => {
      expect(issues(applyAnswerPatch(baseDraft(), skillsTarget, additions({ category: '  ', skills: ['Go'] }), 'x', newId))).toEqual(['patch.additions.0.category: blank_category']);
    });

    it('ignores skills that already exist anywhere in the CV (ignoring case) and duplicates inside the patch', () => {
      const result = applyAnswerPatch(
        baseDraft(),
        skillsTarget,
        additions({ category: 'Backend', skills: ['node.js', 'vim', 'Go', 'GO', ''] }),
        'Node.js, Vim and Go',
        newId,
      );

      expect(categories(result)[0]).toEqual(['Backend', ['Node.js', 'SQL', 'Go']]);
    });

    it('treats only-duplicate or empty additions as an empty patch', () => {
      expect(issues(applyAnswerPatch(baseDraft(), skillsTarget, additions({ category: 'Backend', skills: ['SQL'] }), 'x', newId))).toEqual(['patch: empty_patch']);
      expect(issues(applyAnswerPatch(baseDraft(), skillsTarget, additions(), 'x', newId))).toEqual(['patch: empty_patch']);
    });

    it('does not create a category when every skill in it is a duplicate', () => {
      const result = applyAnswerPatch(baseDraft(), skillsTarget, additions({ category: 'Databases', skills: ['sql'] }), 'x', newId);

      expect(issues(result)).toEqual(['patch: empty_patch']);
    });

    it('caps at 60 skills in total and at 12 categories', () => {
      const full = baseDraft();
      full.skillCategories = [{ id: 'c', name: 'Backend', skills: Array.from({ length: 60 }, (_, i) => `skill-${i}`) }];
      const tooMany = applyAnswerPatch(full, skillsTarget, additions({ category: 'Backend', skills: ['One more'] }), 'one more', newId);

      const twelve = baseDraft();
      twelve.skillCategories = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, name: `Custom ${i}`, skills: [`s${i}`] }));
      const tooManyCategories = applyAnswerPatch(twelve, skillsTarget, additions({ category: 'Databases', skills: ['PostgreSQL'] }), 'PostgreSQL', newId);

      expect(issues(tooMany)).toEqual(['patch.additions: too_many_skills']);
      expect(issues(tooManyCategories)).toEqual(['patch.additions: too_many_categories']);
    });

    it('does not mutate the input draft', () => {
      const draft = baseDraft();
      applyAnswerPatch(draft, skillsTarget, additions({ category: 'Backend', skills: ['Go'] }), 'x', newId);

      expect(draft).toEqual(baseDraft());
    });
  });

  describe('grounds what the patch adds in the answer (only the additions)', () => {
    const skillsTarget: PatchTarget = { section: 'SKILLS', itemId: null };

    it('adds a skill the answer names and refuses skills it does not (I also used Redis)', () => {
      const supported = applyAnswerPatch(baseDraft(), skillsTarget, { additions: [{ category: 'Databases', skills: ['Redis'] }] }, 'I also used Redis.');
      const invented = applyAnswerPatch(
        baseDraft(),
        skillsTarget,
        { additions: [{ category: 'Databases', skills: ['Redis', 'AWS'] }, { category: 'DevOps & CI/CD', skills: ['Kubernetes'] }] },
        'I also used Redis.',
      );

      expect(supported.ok && supported.draft.skillCategories.at(-1)).toMatchObject({ name: 'Databases', skills: ['Redis'] });
      expect(issues(invented)).toEqual(['patch.additions.0.skills: unsupported_skill', 'patch.additions.1.skills: unsupported_skill']);
    });

    it('refuses numbers, a location and dates the answer does not state', () => {
      const result = applyAnswerPatch(
        baseDraft(),
        exp1,
        expPatch({ location: 'Berlin', startDate: '2019', bullets: ['Grew revenue by 300% for 2 million users'] }),
        'I worked on billing.',
      );

      expect(issues(result)).toEqual([
        'patch.location: unsupported_location',
        'patch.startDate: unsupported_date',
        'patch.bullets.0: unsupported_quantity',
      ]);
    });

    it('accepts numbers, a location and dates the answer states', () => {
      const result = applyAnswerPatch(
        baseDraft(),
        exp1,
        expPatch({ location: 'Berlin', startDate: 'March 2019', bullets: ['Cut billing errors by 30%'] }),
        'From March 2019 in Berlin; I cut billing errors by 30 percent.',
      );

      expect(result.ok && result.draft.experience[0]).toMatchObject({
        location: 'Berlin',
        startDate: 'March 2019',
        bullets: ['Built APIs', 'Cut billing errors by 30%'],
      });
    });

    it('does not re-check what the CV already holds, and lets a new bullet restate the entry\'s numbers', () => {
      const draft = baseDraft();
      draft.experience[0]!.bullets = ['Cut costs by 40%'];
      draft.skillCategories[0]!.skills.push('Kubernetes');

      const skills = applyAnswerPatch(draft, skillsTarget, { additions: [{ category: 'Databases', skills: ['Redis'] }] }, 'I also used Redis.');
      const bullet = applyAnswerPatch(draft, exp1, expPatch({ bullets: ['Led the 40% cost reduction'] }), 'I led that cost work.');

      expect(skills.ok).toBe(true);
      expect(bullet.ok).toBe(true);
    });

    it('refuses a summary with numbers the answer does not state', () => {
      const result = applyAnswerPatch(baseDraft(), { section: 'SUMMARY', itemId: null }, { summary: 'Engineer with 10 years of experience.' }, 'focus on APIs');

      expect(issues(result)).toEqual(['patch.summary: unsupported_quantity']);
    });

    it('refuses education dates and details numbers the answer does not state', () => {
      const result = applyAnswerPatch(
        baseDraft(),
        { section: 'EDUCATION', itemId: 'edu-1' },
        { institution: null, qualification: null, startDate: null, endDate: '2016', details: 'GPA 3.9' },
        'I graduated with honours.',
      );

      expect(issues(result)).toEqual(['patch.endDate: unsupported_date', 'patch.details: unsupported_quantity']);
    });

    it('refuses a contact location the answer does not name', () => {
      const draft = baseDraft();
      draft.contact.location = null;

      const result = applyAnswerPatch(
        draft,
        { section: 'CONTACT', itemId: null },
        { fullName: null, email: null, phone: null, location: 'Berlin', links: [] },
        'I live in Kyiv.',
      );

      expect(issues(result)).toEqual(['patch.location: unsupported_location']);
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
