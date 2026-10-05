import { llmCvOutputSchema } from './llm-cv-output.schema.js';

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
          itemIndex: 0,
          missing: 'Dates',
          question: 'When did you work there?',
        },
        { section: 'CONTACT', itemIndex: null, missing: 'Email', question: 'What is your email?' },
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
      questions: [{ section: 'HOBBIES', itemIndex: null, missing: 'x', question: 'y' }],
    };
    expect(llmCvOutputSchema.safeParse(badSection).success).toBe(false);

    const badIndex = {
      ...validOutput(),
      questions: [{ section: 'EXPERIENCE', itemIndex: 1.5, missing: 'x', question: 'y' }],
    };
    expect(llmCvOutputSchema.safeParse(badIndex).success).toBe(false);
  });
});
