import { cvDraftSchema, type CvDraft } from './draft.schema.js';

function minimalDraft() {
  return {
    schemaVersion: 1,
    contact: { fullName: null, email: null, phone: null, location: null, links: [] },
    summary: null,
    experience: [],
    education: [],
    skills: [],
  };
}

function fullDraft(): CvDraft {
  return {
    schemaVersion: 1,
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
    skills: ['Node.js', 'PostgreSQL'],
  };
}

describe('cvDraftSchema', () => {
  it('accepts a full draft and a minimal draft with every fact null', () => {
    expect(cvDraftSchema.safeParse(fullDraft()).success).toBe(true);
    expect(cvDraftSchema.safeParse(minimalDraft()).success).toBe(true);
  });

  it('rejects a wrong schemaVersion and missing sections', () => {
    expect(cvDraftSchema.safeParse({ ...minimalDraft(), schemaVersion: 2 }).success).toBe(false);
    const { skills: _skills, ...withoutSkills } = minimalDraft();
    expect(cvDraftSchema.safeParse(withoutSkills).success).toBe(false);
  });

  it.each([
    ['fullName', (d: CvDraft) => (d.contact.fullName = 'a'.repeat(121))],
    ['email', (d: CvDraft) => (d.contact.email = 'a'.repeat(255))],
    ['phone', (d: CvDraft) => (d.contact.phone = '1'.repeat(41))],
    ['location', (d: CvDraft) => (d.contact.location = 'a'.repeat(121))],
    ['links count', (d: CvDraft) => (d.contact.links = Array<string>(6).fill('x'))],
    ['link length', (d: CvDraft) => (d.contact.links = ['a'.repeat(201)])],
    ['summary', (d: CvDraft) => (d.summary = 'a'.repeat(1201))],
    ['skills count', (d: CvDraft) => (d.skills = Array<string>(61).fill('x'))],
    ['skill length', (d: CvDraft) => (d.skills = ['a'.repeat(61)])],
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
    draft.skills = Array<string>(60).fill('s'.repeat(60));
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
});
