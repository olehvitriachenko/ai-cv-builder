import { FALLBACK_SKILL_CATEGORY, SKILL_CATEGORY_NAMES } from '../catalogue/skill-categories.js';
import { QUESTION_FIELDS, llmCvOutputSchema } from './llm-cv-output.schema.js';

function validOutput() {
  return {
    contact: { fullName: 'Ada', email: null, phone: null, location: null, links: [] },
    summary: null,
    experience: [
      {
        employer: 'Acme',
        title: null,
        location: null,
        startDate: null,
        endDate: null,
        bullets: ['Built APIs'],
      },
    ],
    education: [],
    skillCategories: [{ category: 'Frameworks', skills: ['Node.js'] }],
    questions: [],
  };
}

describe('llmCvOutputSchema', () => {
  describe('skill categories', () => {
    const withCategories = (skillCategories: unknown) => ({ ...validOutput(), skillCategories });

    it('accepts every predefined category name and the Skills fallback', () => {
      for (const category of [...SKILL_CATEGORY_NAMES, FALLBACK_SKILL_CATEGORY]) {
        expect(llmCvOutputSchema.safeParse(withCategories([{ category, skills: ['x'] }])).success, category).toBe(true);
      }
    });

    it('accepts no categories and the same category more than once (the mapper merges them)', () => {
      expect(llmCvOutputSchema.safeParse(withCategories([])).success).toBe(true);
      expect(
        llmCvOutputSchema.safeParse(
          withCategories([
            { category: 'Databases', skills: ['PostgreSQL'] },
            { category: 'Databases', skills: ['Redis'] },
          ]),
        ).success,
      ).toBe(true);
    });

    it('rejects a category name outside the catalogue and the fallback', () => {
      expect(llmCvOutputSchema.safeParse(withCategories([{ category: 'Underwater Basket Weaving', skills: ['x'] }])).success).toBe(false);
      expect(llmCvOutputSchema.safeParse(withCategories([{ category: 'databases', skills: ['x'] }])).success).toBe(false);
    });

    it('rejects extra keys on a category and the old flat skills list', () => {
      expect(llmCvOutputSchema.safeParse(withCategories([{ category: 'Databases', skills: ['x'], id: 'c1' }])).success).toBe(false);
      const { skillCategories: _categories, ...rest } = validOutput();
      expect(llmCvOutputSchema.safeParse({ ...rest, skills: ['Node.js'] }).success).toBe(false);
    });
  });

  it('accepts valid output with and without questions', () => {
    expect(llmCvOutputSchema.safeParse(validOutput()).success).toBe(true);

    const withQuestions = {
      ...validOutput(),
      questions: [
        {
          section: 'EXPERIENCE',
          itemIndex: 0, field: null,
          missing: 'Dates',
          question: 'When did you work there?',
        },
        { section: 'CONTACT', itemIndex: null, field: null, missing: 'Email', question: 'What is your email?' },
      ],
    };
    expect(llmCvOutputSchema.safeParse(withQuestions).success).toBe(true);
  });

  it('rejects a missing section', () => {
    const { skillCategories: _categories, ...output } = validOutput();
    expect(llmCvOutputSchema.safeParse(output).success).toBe(false);
    const { questions: _questions, ...withoutQuestions } = validOutput();
    expect(llmCvOutputSchema.safeParse(withoutQuestions).success).toBe(false);
  });

  it('rejects wrong types', () => {
    expect(llmCvOutputSchema.safeParse({ ...validOutput(), skillCategories: 'Node.js' }).success).toBe(
      false,
    );
    expect(
      llmCvOutputSchema.safeParse({ ...validOutput(), skillCategories: [{ category: 'Databases', skills: 'Go' }] })
        .success,
    ).toBe(false);
    expect(llmCvOutputSchema.safeParse({ ...validOutput(), summary: 42 }).success).toBe(false);
    expect(llmCvOutputSchema.safeParse('not an object').success).toBe(false);
    expect(llmCvOutputSchema.safeParse(null).success).toBe(false);
  });

  it('rejects an unknown question section and a non-integer item index', () => {
    const badSection = {
      ...validOutput(),
      questions: [{ section: 'HOBBIES', itemIndex: null, field: null, missing: 'x', question: 'y' }],
    };
    expect(llmCvOutputSchema.safeParse(badSection).success).toBe(false);

    const badIndex = {
      ...validOutput(),
      questions: [{ section: 'EXPERIENCE', itemIndex: 1.5, field: null, missing: 'x', question: 'y' }],
    };
    expect(llmCvOutputSchema.safeParse(badIndex).success).toBe(false);
  });

  describe('question field', () => {
    const withField = (field: unknown) => ({
      ...validOutput(),
      questions: [{ section: 'CONTACT', itemIndex: null, field, missing: 'Email', question: 'Your email?' }],
    });

    it('accepts every known field and null', () => {
      for (const field of [...QUESTION_FIELDS, null]) {
        const section = field === null ? 'CONTACT' : field.split('_')[0];
        const output = {
          ...validOutput(),
          questions: [{ section, itemIndex: null, field, missing: 'm', question: 'q' }],
        };
        expect(llmCvOutputSchema.safeParse(output).success).toBe(true);
      }
    });

    it('lists the 14 single-value targets', () => {
      expect(QUESTION_FIELDS).toHaveLength(14);
      expect(QUESTION_FIELDS).toContain('CONTACT_EMAIL');
      expect(QUESTION_FIELDS).toContain('EXPERIENCE_END_DATE');
    });

    it('rejects an unknown field value', () => {
      expect(llmCvOutputSchema.safeParse(withField('CONTACT_FAX')).success).toBe(false);
      expect(llmCvOutputSchema.safeParse(withField('email')).success).toBe(false);
    });

    it('requires the field key (structured output returns every property)', () => {
      const output = {
        ...validOutput(),
        questions: [{ section: 'CONTACT', itemIndex: null, missing: 'Email', question: 'Your email?' }],
      };

      expect(llmCvOutputSchema.safeParse(output).success).toBe(false);
    });
  });
});
