import type { LlmCvOutput } from '../../src/modules/ai/schemas/llm-cv-output.schema.js';

/**
 * Model output that is valid for `VALID_SOURCE_TEXT` in helpers/cvs.ts: every email, employer and
 * institution below appears in that source.
 */
export function validLlmOutput(overrides: Partial<LlmCvOutput> = {}): LlmCvOutput {
  return {
    contact: {
      fullName: null,
      email: 'ada@example.com',
      phone: null,
      location: null,
      links: [],
    },
    summary: 'Backend engineer with ten years of experience building REST APIs.',
    experience: [
      {
        employer: 'Acme Corp',
        title: 'Backend Engineer',
        location: null,
        startDate: '2016',
        endDate: '2023',
        bullets: ['Built REST APIs in Node.js and PostgreSQL'],
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
    skills: ['Node.js', 'PostgreSQL'],
    questions: [],
    ...overrides,
  };
}
