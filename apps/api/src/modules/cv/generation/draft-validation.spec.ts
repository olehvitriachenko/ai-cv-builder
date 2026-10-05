import type { LlmCvOutput } from '../../ai/llm-cv-output.schema.js';
import { formatIssue, validateGeneration, type GenerationValidation } from './draft-validation.js';

const SOURCE = [
  'Ada Lovelace',
  'ada@example.com | +44 20 7946 0958 | https://github.com/ada-l',
  'Backend engineer at Acme Corp, London, 2016-2023: built REST APIs in Node.js.',
  'BSc Computer Science, State University, 2015.',
].join('\n');

function output(overrides: Partial<LlmCvOutput> = {}): LlmCvOutput {
  return {
    contact: {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+44 20 7946 0958',
      location: 'London',
      links: ['https://github.com/ada-l'],
    },
    summary: 'Backend engineer focused on REST APIs.',
    experience: [
      {
        employer: 'Acme Corp',
        title: 'Backend engineer',
        location: 'London',
        startDate: '2016',
        endDate: '2023',
        bullets: ['Built REST APIs in Node.js'],
      },
    ],
    education: [
      {
        institution: 'State University',
        qualification: 'BSc Computer Science',
        startDate: null,
        endDate: '2015',
        details: null,
      },
    ],
    skills: ['Node.js'],
    questions: [],
    ...overrides,
  };
}

function issuesOf(result: GenerationValidation): string[] {
  return result.ok ? [] : result.issues.map(formatIssue);
}

describe('validateGeneration', () => {
  it('accepts valid output and returns the draft with ids and the stored questions', () => {
    const result = validateGeneration(
      output({
        questions: [
          {
            section: 'EXPERIENCE',
            itemIndex: 0,
            missing: 'Team size',
            question: 'How big was the team?',
          },
        ],
      }),
      SOURCE,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.experience[0]).toMatchObject({ employer: 'Acme Corp' });
      expect(result.questions).toEqual([
        {
          section: 'EXPERIENCE',
          itemId: result.draft.experience[0]!.id,
          missing: 'Team size',
          question: 'How big was the team?',
          position: 0,
          status: 'OPEN',
        },
      ]);
    }
  });

  it('accepts a partial draft (unknown facts null, empty sections) together with questions', () => {
    const result = validateGeneration(
      output({
        contact: { fullName: null, email: null, phone: null, location: null, links: [] },
        summary: null,
        experience: [],
        education: [],
        skills: [],
        questions: [{ section: 'CONTACT', itemIndex: null, missing: 'Email', question: 'Email?' }],
      }),
      SOURCE,
    );

    expect(result.ok).toBe(true);
  });

  it('trims strings in the returned draft', () => {
    const result = validateGeneration(output({ summary: '  Padded summary.  ' }), SOURCE);

    expect(result.ok && result.draft.summary).toBe('Padded summary.');
  });

  describe('structure', () => {
    it('rejects a blank string (null is how the model says unknown)', () => {
      const result = validateGeneration(output({ summary: '   ' }), SOURCE);

      expect(issuesOf(result)).toEqual(['summary: draft_too_small']);
    });

    it('rejects an entry with neither employer nor title', () => {
      const result = validateGeneration(
        output({
          experience: [
            {
              employer: null,
              title: null,
              location: null,
              startDate: null,
              endDate: null,
              bullets: ['x'],
            },
          ],
        }),
        SOURCE,
      );

      expect(issuesOf(result)).toEqual(['experience.0: draft_custom']);
    });

    it('rejects values over the caps and blank bullets', () => {
      const result = validateGeneration(
        output({
          skills: Array.from({ length: 61 }, (_, i) => `skill${i}`),
          experience: [
            {
              employer: 'Acme Corp',
              title: null,
              location: null,
              startDate: null,
              endDate: null,
              bullets: ['a'.repeat(301), ' '],
            },
          ],
        }),
        SOURCE,
      );

      expect(issuesOf(result)).toEqual(
        expect.arrayContaining([
          'skills: draft_too_big',
          'experience.0.bullets.0: draft_too_big',
          'experience.0.bullets.1: draft_too_small',
        ]),
      );
    });
  });

  describe('clarification questions', () => {
    const q = (overrides: Partial<LlmCvOutput['questions'][number]> = {}) => ({
      section: 'CONTACT' as const,
      itemIndex: null,
      missing: 'Email',
      question: 'What is your email?',
      ...overrides,
    });

    it('rejects more than 10 questions after removing duplicates', () => {
      const many = Array.from({ length: 11 }, (_, i) => q({ question: `Question ${i}?` }));

      expect(issuesOf(validateGeneration(output({ questions: many }), SOURCE))).toEqual([
        'questions: too_many_questions',
      ]);
    });

    it('accepts exactly 10 and counts duplicates once', () => {
      const ten = Array.from({ length: 10 }, (_, i) => q({ question: `Question ${i}?` }));
      expect(validateGeneration(output({ questions: ten }), SOURCE).ok).toBe(true);

      const withDuplicates = [...ten, q({ question: 'Question 0?' })];
      const result = validateGeneration(output({ questions: withDuplicates }), SOURCE);
      expect(result.ok && result.questions).toHaveLength(10);
    });

    it('rejects an item index outside the entries or on a section without entries', () => {
      const result = validateGeneration(
        output({
          questions: [
            q({ section: 'EXPERIENCE', itemIndex: 1 }),
            q({ section: 'EDUCATION', itemIndex: -1, question: 'b?' }),
            q({ section: 'CONTACT', itemIndex: 0, question: 'c?' }),
            q({ section: 'EXPERIENCE', itemIndex: 0, question: 'd?' }),
          ],
        }),
        SOURCE,
      );

      expect(issuesOf(result)).toEqual([
        'questions.0.itemIndex: invalid_item_index',
        'questions.1.itemIndex: invalid_item_index',
        'questions.2.itemIndex: invalid_item_index',
      ]);
    });

    it('rejects blank and over-long question text', () => {
      const result = validateGeneration(
        output({
          questions: [
            q({ missing: '  ' }),
            q({ question: 'x'.repeat(301) }),
            q({ missing: 'y'.repeat(301), question: 'z?' }),
          ],
        }),
        SOURCE,
      );

      expect(issuesOf(result)).toEqual([
        'questions.0.missing: blank_text',
        'questions.1.question: text_too_long',
        'questions.2.missing: text_too_long',
      ]);
    });
  });

  describe('source-backed checks', () => {
    it('rejects a contact detail the source does not support', () => {
      const result = validateGeneration(
        output({
          contact: {
            fullName: 'Ada Lovelace',
            email: 'invented@example.com',
            phone: '+44 20 0000 0000',
            location: null,
            links: ['https://github.com/ada-l', 'https://linkedin.com/in/invented'],
          },
        }),
        SOURCE,
      );

      expect(issuesOf(result)).toEqual([
        'contact.email: unsupported_contact',
        'contact.phone: unsupported_contact',
        'contact.links.1: unsupported_contact',
      ]);
    });

    it('rejects a person name the source does not support', () => {
      const result = validateGeneration(
        output({ contact: { ...output().contact, fullName: 'Grace Hopper' } }),
        SOURCE,
      );

      expect(issuesOf(result)).toEqual(['contact.fullName: unsupported_name']);
    });

    it('accepts contact formatting differences', () => {
      const result = validateGeneration(
        output({
          contact: {
            fullName: 'LOVELACE Ada',
            email: 'ADA@example.com',
            phone: '+442079460958',
            location: null,
            links: ['github.com/ada-l/'],
          },
        }),
        SOURCE,
      );

      expect(result.ok).toBe(true);
    });

    it('rejects an employer or institution with no counterpart in the source', () => {
      const result = validateGeneration(
        output({
          experience: [
            {
              employer: 'Globex',
              title: 'Dev',
              location: null,
              startDate: null,
              endDate: null,
              bullets: [],
            },
          ],
          education: [
            {
              institution: 'Hogwarts',
              qualification: null,
              startDate: null,
              endDate: null,
              details: null,
            },
          ],
        }),
        SOURCE,
      );

      expect(issuesOf(result)).toEqual([
        'experience.0.employer: unsupported_organisation',
        'education.0.institution: unsupported_organisation',
      ]);
    });

    it('accepts names that only differ in capitalisation, punctuation or legal suffix', () => {
      const result = validateGeneration(
        output({
          experience: [
            {
              employer: 'ACME, Corporation',
              title: 'Dev',
              location: null,
              startDate: null,
              endDate: null,
              bullets: [],
            },
            {
              employer: 'Acme Inc.',
              title: 'Dev',
              location: null,
              startDate: null,
              endDate: null,
              bullets: [],
            },
          ],
          education: [
            {
              institution: 'state university',
              qualification: null,
              startDate: null,
              endDate: null,
              details: null,
            },
          ],
        }),
        SOURCE,
      );

      expect(result.ok).toBe(true);
    });

    it('does not check unsupported facts that are not mechanically checkable (bullets, dates, titles, skills)', () => {
      const result = validateGeneration(
        output({
          skills: ['Kubernetes'],
          experience: [
            {
              employer: 'Acme Corp',
              title: 'CTO',
              location: null,
              startDate: '1999',
              endDate: '2001',
              bullets: ['Led a team of 40'],
            },
          ],
        }),
        SOURCE,
      );

      expect(result.ok).toBe(true);
    });
  });

  it('reports only rule ids and JSON paths, never draft or source values', () => {
    const result = validateGeneration(
      output({
        contact: { ...output().contact, email: 'secret-invented@evil.test' },
        experience: [
          {
            employer: 'Secret Globex Ltd',
            title: 'Dev',
            location: null,
            startDate: null,
            endDate: null,
            bullets: [],
          },
        ],
      }),
      SOURCE,
    );

    expect(result.ok).toBe(false);
    const text = JSON.stringify(result);
    expect(text).not.toContain('secret-invented');
    expect(text).not.toContain('Secret Globex');
    expect(text).not.toContain('Ada Lovelace');
    expect(text).not.toContain('REST APIs');
  });
});
