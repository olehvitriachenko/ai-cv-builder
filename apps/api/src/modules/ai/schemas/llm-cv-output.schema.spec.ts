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
    skills: ['Node.js'],
    questions: [],
  };
}

describe('llmCvOutputSchema', () => {
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
    const { skills: _skills, ...output } = validOutput();
    expect(llmCvOutputSchema.safeParse(output).success).toBe(false);
    const { questions: _questions, ...withoutQuestions } = validOutput();
    expect(llmCvOutputSchema.safeParse(withoutQuestions).success).toBe(false);
  });

  it('rejects wrong types', () => {
    expect(llmCvOutputSchema.safeParse({ ...validOutput(), skills: 'Node.js' }).success).toBe(
      false,
    );
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
