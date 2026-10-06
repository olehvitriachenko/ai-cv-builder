import { getDocumentProxy } from 'unpdf';
import type { CvDraft } from '../../cv/generation/draft.schema.js';
import { CvPdfRenderer } from './cv-pdf-renderer.service.js';

/** A4 in PDF points. */
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const SIDE_MARGIN = 49;
/** Rounding slack for glyph metrics. */
const SLACK = 1.5;

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}
interface PdfPage {
  width: number;
  height: number;
  items: TextItem[];
}
interface ReadPdf {
  pages: PdfPage[];
  /** Every non-empty text item of every page, concatenated exactly as stored (no separators). */
  raw: string;
  /** Items joined by a space, whitespace collapsed, for "is this sentence present" checks. */
  flat: string;
}

/** Reads a generated PDF back the way a viewer would: real positioned text, not pixels. */
async function readPdf(bytes: Buffer): Promise<ReadPdf> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pages: PdfPage[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const item of content.items) {
      if ('str' in item && item.str.length > 0) {
        items.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
        });
      }
    }
    pages.push({ width: viewport.width, height: viewport.height, items });
  }
  const strings = pages.flatMap((page) => page.items.map((item) => item.str));
  return { pages, raw: strings.join(''), flat: strings.join(' ').replace(/\s+/g, ' ') };
}

/** True when the text holds a C0 control character other than tab, line feed or carriage return. */
function hasControlCharacters(text: string): boolean {
  return Array.from(text).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  });
}

function emptyDraft(): CvDraft {
  return {
    schemaVersion: 2,
    contact: { fullName: null, email: null, phone: null, location: null, links: [] },
    summary: null,
    experience: [],
    education: [],
    languages: [], certifications: [], portfolio: [], hobbies: [], customSections: [],
    skillCategories: [],
  };
}

function typicalDraft(): CvDraft {
  return {
    schemaVersion: 2,
    contact: {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+44 20 7946 0000',
      location: 'London, UK',
      links: ['https://example.com/ada'],
    },
    summary: 'Backend engineer focused on reliable REST APIs.',
    experience: [
      {
        id: 'exp-1',
        employer: 'Acme Corp',
        title: 'Senior Engineer',
        location: 'London',
        startDate: '2016',
        endDate: '2023',
        bullets: ['Built REST APIs in Node.js', 'Mentored four engineers'],
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'State University',
        qualification: 'BSc Computer Science',
        startDate: '2012',
        endDate: '2015',
        details: 'First class honours',
      },
    ],
    languages: [], certifications: [], portfolio: [], hobbies: [], customSections: [],
    skillCategories: [
      { id: 'cat-1', name: 'Backend', skills: ['Node.js', 'PostgreSQL', 'TypeScript'] },
    ],
  };
}

/** Section headings are rendered upper-case; match them case-insensitively. */
const HEADINGS = ['profile', 'experience', 'education', 'skills'];

describe('CvPdfRenderer', () => {
  const renderer = new CvPdfRenderer();

  it.each([
    ['Present', true, false],
    [String(new Date().getFullYear() + 3), true, true],
    ['2015', false, false],
  ] as const)('preserves education semantics for %s', async (endDate, studying, expected) => {
    const draft = typicalDraft();
    draft.education[0]!.endDate = endDate;
    const pdf = await readPdf(await renderer.render({ draft, targetRole: 'Backend Engineer' }));
    expect(pdf.flat.includes('Currently studying')).toBe(studying);
    expect(pdf.flat.includes('(expected)')).toBe(expected);
  });

  it.each([
    [String(new Date().getFullYear()), false, false],
    [String(new Date().getFullYear()), true, true],
    [String(new Date().getFullYear() + 1), true, true],
    ['Present', true, false],
    [null, true, false],
  ] as const)('renders persisted education end %s with ongoing=%s', async (endDate, ongoing, expected) => {
    const draft = typicalDraft();
    draft.education[0] = { ...draft.education[0]!, startDate: '2022', endDate, ongoing };
    const pdf = await readPdf(await renderer.render({ draft, targetRole: 'Engineer' }));
    expect(pdf.flat.includes('Currently studying')).toBe(ongoing);
    expect(pdf.flat.includes('(expected)')).toBe(expected);
  });

  it('retains source-derived now in exported experience', async () => {
    const draft = typicalDraft();
    draft.experience[0]!.startDate = 'Sept 2019';
    draft.experience[0]!.endDate = 'now';
    const pdf = await readPdf(await renderer.render({ draft, targetRole: 'Engineer' }));
    expect(pdf.flat).toContain('Sept 2019 — now');
  });

  it('produces a PDF whose every page is A4 portrait', async () => {
    const bytes = await renderer.render({ draft: typicalDraft(), targetRole: 'Backend Engineer' });

    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const { pages } = await readPdf(bytes);
    expect(pages.length).toBeGreaterThanOrEqual(1);
    for (const page of pages) {
      expect(page.width).toBeCloseTo(A4_WIDTH, 1);
      expect(page.height).toBeCloseTo(A4_HEIGHT, 1);
    }
  });

  it('contains selectable text for the name and the email, in document order', async () => {
    const { flat } = await readPdf(
      await renderer.render({ draft: typicalDraft(), targetRole: 'Backend Engineer' }),
    );

    const order = [
      'Ada Lovelace',
      'BACKEND ENGINEER',
      'ada@example.com',
      'Backend engineer focused on reliable REST APIs.',
      'Senior Engineer',
      'Acme Corp',
      'Built REST APIs in Node.js',
      'BSc Computer Science',
      'State University',
      'Backend: Node.js · PostgreSQL · TypeScript',
    ];
    let cursor = -1;
    for (const part of order) {
      const at = flat.toLowerCase().indexOf(part.toLowerCase(), cursor + 1);
      expect(at, `"${part}" should appear after the previous part`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('lays sections out in the preview order: Profile, Experience, Education, Skills', async () => {
    const { flat } = await readPdf(
      await renderer.render({ draft: typicalDraft(), targetRole: 'Backend Engineer' }),
    );
    const upper = flat.toUpperCase();
    const positions = ['PROFILE', 'EXPERIENCE', 'EDUCATION', 'SKILLS'].map((heading) =>
      upper.indexOf(heading),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('leaves out missing facts: no placeholders, no "null", no empty headings, no stray separators', async () => {
    const draft: CvDraft = {
      ...emptyDraft(),
      contact: { fullName: 'Ada Lovelace', email: null, phone: null, location: null, links: [] },
      experience: [
        {
          id: 'exp-1',
          employer: 'Acme Corp',
          title: null,
          location: null,
          startDate: null,
          endDate: null,
          bullets: [],
        },
      ],
    };

    const { flat } = await readPdf(
      await renderer.render({ draft, targetRole: 'Backend Engineer' }),
    );

    expect(flat).toContain('Ada Lovelace');
    expect(flat).toContain('Acme Corp');
    expect(flat.toLowerCase()).not.toMatch(/null|undefined|not provided|n\/a/);
    const upper = flat.toUpperCase();
    expect(upper).toContain('EXPERIENCE');
    for (const empty of ['PROFILE', 'EDUCATION', 'SKILLS']) {
      expect(upper, `${empty} has no content, so it has no heading`).not.toContain(empty);
    }
    // No dangling separators from absent meta values or dates.
    expect(flat).not.toMatch(/(^|\s)[·—-](\s|$)/);
  });

  it('renders a draft with no facts as one page showing only the target role', async () => {
    const { pages, flat } = await readPdf(
      await renderer.render({ draft: emptyDraft(), targetRole: 'Backend Engineer' }),
    );

    expect(pages).toHaveLength(1);
    expect(flat.trim().toUpperCase()).toBe('BACKEND ENGINEER');
  });

  it('renders accents and Cyrillic exactly', async () => {
    const draft: CvDraft = {
      ...typicalDraft(),
      contact: {
        fullName: 'Олена Іваненко',
        email: 'olena@example.com',
        phone: null,
        location: 'Київ, Україна',
        links: [],
      },
      summary: 'Інженер із досвідом розробки надійних сервісів. Café résumé naïve Zoë.',
      experience: [
        {
          id: 'exp-1',
          employer: 'ТОВ «Приклад»',
          title: 'Старший інженер',
          location: null,
          startDate: '2018',
          endDate: 'теперішній час',
          bullets: ['Розробила REST API на Node.js'],
        },
      ],
      education: [],
      skillCategories: [{ id: 'cat-1', name: 'Мови', skills: ['Українська', 'Español'] }],
    };

    const { flat } = await readPdf(await renderer.render({ draft, targetRole: 'Інженер' }));

    for (const text of [
      'Олена Іваненко',
      'Київ, Україна',
      'Інженер із досвідом розробки надійних сервісів.',
      'Café résumé naïve Zoë.',
      'ТОВ «Приклад»',
      'Старший інженер',
      'Розробила REST API на Node.js',
      'Мови: Українська · Español',
    ]) {
      expect(flat, text).toContain(text);
    }
  });

  it('keeps the text layer correct when documents are rendered back to back', async () => {
    // Regression: the renderer's font objects keep per-document state. After a Cyrillic document the
    // next one came out with a corrupted text layer ("Ad\u0003" for "Ada"), so selection and search broke.
    const cyrillic: CvDraft = {
      ...emptyDraft(),
      contact: { ...emptyDraft().contact, fullName: 'Олена Іваненко' },
      summary: 'Інженер із досвідом розробки надійних сервісів.',
    };
    const latin: CvDraft = {
      ...emptyDraft(),
      contact: { ...emptyDraft().contact, fullName: 'Ada Lovelace' },
      summary: 'Backend engineer who builds reliable services.',
    };

    for (const [draft, name, summary] of [
      [cyrillic, 'Олена Іваненко', 'Інженер із досвідом розробки надійних сервісів.'],
      [latin, 'Ada Lovelace', 'Backend engineer who builds reliable services.'],
      [cyrillic, 'Олена Іваненко', 'Інженер із досвідом розробки надійних сервісів.'],
      [latin, 'Ada Lovelace', 'Backend engineer who builds reliable services.'],
    ] as const) {
      const { flat } = await readPdf(await renderer.render({ draft, targetRole: 'Engineer' }));
      expect(flat).toContain(name);
      expect(flat).toContain(summary);
      expect(hasControlCharacters(flat)).toBe(false);
    }
  });

  it('keeps every document correct when several are rendered at the same time', async () => {
    const drafts = Array.from({ length: 6 }, (_, index): CvDraft => ({
      ...emptyDraft(),
      contact: {
        ...emptyDraft().contact,
        fullName: index % 2 === 0 ? `Олена Іваненко ${index}` : `Ada Lovelace ${index}`,
      },
      summary: index % 2 === 0 ? `Інженер номер ${index}` : `Engineer number ${index}`,
    }));

    const files = await Promise.all(
      drafts.map((draft) => renderer.render({ draft, targetRole: 'Engineer' })),
    );

    for (const [index, bytes] of files.entries()) {
      const { flat } = await readPdf(bytes);
      expect(flat).toContain(drafts[index]?.contact.fullName ?? '');
      expect(flat).toContain(drafts[index]?.summary ?? '');
      expect(hasControlCharacters(flat)).toBe(false);
    }
  });

  it('keeps a very long unbroken link inside the margins without changing its text', async () => {
    const link = `https://example.com/${'a'.repeat(190)}`;
    const draft: CvDraft = {
      ...typicalDraft(),
      contact: { ...typicalDraft().contact, links: [link] },
      summary: `See ${link} for details`,
      experience: [
        {
          id: 'exp-1',
          employer: 'Acme',
          title: 'Engineer',
          location: null,
          startDate: null,
          endDate: null,
          bullets: [`Docs at ${link}`],
        },
      ],
    };

    const { pages, raw, flat } = await readPdf(
      await renderer.render({ draft, targetRole: 'Backend Engineer' }),
    );

    for (const page of pages) {
      for (const item of page.items) {
        expect(item.x + item.width, item.str).toBeLessThanOrEqual(A4_WIDTH - SIDE_MARGIN + SLACK);
      }
    }
    // The text is the original: no visible hyphen, no inserted character, three occurrences.
    expect(raw.split(link).length - 1).toBeGreaterThanOrEqual(3);
    expect(flat).toContain('for details');
    expect(raw).not.toMatch(/[​­]/);
  });

  it('breaks a long CV across A4 pages without clipping or orphaned headings', async () => {
    const draft: CvDraft = {
      ...typicalDraft(),
      experience: Array.from({ length: 14 }, (_, entry) => ({
        id: `exp-${entry}`,
        employer: `Company ${entry}`,
        title: `Engineer ${entry}`,
        location: 'London',
        startDate: '2010',
        endDate: '2020',
        bullets: Array.from(
          { length: 6 },
          (_, bullet) =>
            `Delivered result ${entry}-${bullet}: designed, built and operated a service that handled sustained production traffic with strict reliability goals.`,
        ),
      })),
    };

    const { pages, raw, flat } = await readPdf(
      await renderer.render({ draft, targetRole: 'Backend Engineer' }),
    );

    expect(pages.length).toBeGreaterThanOrEqual(3);
    for (const entry of draft.experience) {
      expect(flat).toContain(entry.title ?? '');
      for (const bullet of entry.bullets) {
        expect(flat, bullet).toContain(bullet);
      }
    }
    for (const page of pages) {
      expect(page.width).toBeCloseTo(A4_WIDTH, 1);
      for (const item of page.items) {
        expect(item.x).toBeGreaterThanOrEqual(SIDE_MARGIN - SLACK);
        expect(item.x + item.width).toBeLessThanOrEqual(A4_WIDTH - SIDE_MARGIN + SLACK);
        expect(item.y).toBeGreaterThan(0);
        expect(item.y).toBeLessThan(A4_HEIGHT);
      }
      // The last line of a page is never a lone section heading.
      const lowest = [...page.items].sort((a, b) => a.y - b.y)[0];
      expect(HEADINGS).not.toContain(lowest?.str.trim().toLowerCase());
    }
    expect(raw.length).toBeGreaterThan(1000);
  });

  it('never leaves an entry title on one page and its first bullet on the next', async () => {
    const draft: CvDraft = {
      ...emptyDraft(),
      experience: Array.from({ length: 30 }, (_, entry) => ({
        id: `exp-${entry}`,
        employer: `Employer ${entry}`,
        title: `Title ${entry}`,
        location: null,
        startDate: null,
        endDate: null,
        bullets: [`First bullet of entry ${entry}`, `Second bullet of entry ${entry}`],
      })),
    };

    const { pages } = await readPdf(await renderer.render({ draft, targetRole: 'Engineer' }));

    expect(pages.length).toBeGreaterThanOrEqual(2);
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const text = page?.items.map((item) => item.str).join(' ') ?? '';
      for (const title of text.match(/Title \d+/g) ?? []) {
        const number = title.replace('Title ', '');
        expect(text, `title ${number} is on the same page as its first bullet`).toContain(
          `First bullet of entry ${number}`,
        );
      }
    }
  });

  it('shows a lone default "Skills" category as one unlabelled list under the Skills heading', async () => {
    const draft: CvDraft = {
      ...typicalDraft(),
      skillCategories: [
        { id: 'skills-default', name: 'Skills', skills: ['Node.js', 'PostgreSQL', 'TypeScript'] },
      ],
    };

    const { flat } = await readPdf(await renderer.render({ draft, targetRole: 'Engineer' }));

    expect(flat.toUpperCase()).toContain('SKILLS');
    expect(flat).toContain('Node.js · PostgreSQL · TypeScript');
    expect(flat).not.toContain('Skills:');
  });

  it('shows each skill category as "<name>: <skills>" in order, one block per category', async () => {
    const draft: CvDraft = {
      ...typicalDraft(),
      skillCategories: [
        { id: 'a', name: 'Languages', skills: ['TypeScript', 'Go'] },
        { id: 'b', name: 'Databases', skills: ['PostgreSQL'] },
        { id: 'c', name: 'Skills', skills: ['Mentoring'] },
      ],
    };

    const { flat } = await readPdf(await renderer.render({ draft, targetRole: 'Engineer' }));

    let cursor = -1;
    for (const part of [
      'Languages: TypeScript · Go',
      'Databases: PostgreSQL',
      'Skills: Mentoring',
    ]) {
      const at = flat.indexOf(part, cursor + 1);
      expect(at, `"${part}" should appear after the previous block`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('leaves out the Skills section when no category holds a skill', async () => {
    const draft: CvDraft = {
      ...typicalDraft(),
      skillCategories: [{ id: 'a', name: 'Languages', skills: [] }],
    };

    const { flat } = await readPdf(await renderer.render({ draft, targetRole: 'Engineer' }));

    expect(flat.toUpperCase()).not.toContain('SKILLS');
    expect(flat).not.toContain('Languages');
  });

  it('renders the maximum draft the product allows', async () => {
    const draft: CvDraft = {
      schemaVersion: 2,
      contact: {
        fullName: 'N'.repeat(120),
        email: `${'e'.repeat(60)}@example.com`,
        phone: '+'.padEnd(40, '1'),
        location: 'L'.repeat(120),
        links: Array.from(
          { length: 5 },
          (_, index) => `https://example.com/${index}/${'x'.repeat(170)}`,
        ),
      },
      summary: 'S'.repeat(1200),
      experience: Array.from({ length: 30 }, (_, entry) => ({
        id: `exp-${entry}`,
        employer: 'E'.repeat(200),
        title: 'T'.repeat(200),
        location: 'L'.repeat(120),
        startDate: 'D'.repeat(40),
        endDate: 'D'.repeat(40),
        bullets: Array.from({ length: 12 }, (_, bullet) =>
          `Bullet ${entry}-${bullet} ${'w '.repeat(140)}`.trim().slice(0, 300),
        ),
      })),
      education: Array.from({ length: 10 }, (_, entry) => ({
        id: `edu-${entry}`,
        institution: 'I'.repeat(200),
        qualification: 'Q'.repeat(200),
        startDate: 'D'.repeat(40),
        endDate: 'D'.repeat(40),
        details: 'd'.repeat(300),
      })),
      languages: [], certifications: [], portfolio: [], hobbies: [], customSections: [],
      skillCategories: Array.from({ length: 12 }, (_, category) => ({
        id: `cat-${category}`,
        name: `Category ${category}`,
        skills: Array.from({ length: 5 }, (_, skill) =>
          `Skill ${category * 5 + skill} ${'s'.repeat(50)}`.slice(0, 60),
        ),
      })),
    };

    const { pages, flat } = await readPdf(
      await renderer.render({ draft, targetRole: 'R'.repeat(200) }),
    );

    expect(pages.length).toBeGreaterThan(5);
    expect(flat).toContain('Bullet 29-11');
    expect(flat).toContain('Category 11:');
    expect(flat).toContain('Skill 59');
    for (const page of pages) {
      for (const item of page.items) {
        expect(item.x + item.width, item.str).toBeLessThanOrEqual(A4_WIDTH - SIDE_MARGIN + SLACK);
      }
    }
  }, 60_000);
});

describe('CvPdfRenderer optional sections', () => {
  const renderer = new CvPdfRenderer();

  function withSections(): CvDraft {
    return {
      ...typicalDraft(),
      certifications: [
        { id: 'c1', name: 'AWS Solutions Architect', issuer: 'Amazon Web Services', date: 'Jun 2024', link: 'https://aws.amazon.com/verify/123' },
        { id: 'c2', name: 'Scrum Master', issuer: null, date: null, link: null },
      ],
      languages: [
        { id: 'l1', name: 'English', level: 'C1' },
        { id: 'l2', name: 'German', level: null },
      ],
      portfolio: [{ id: 'p1', name: 'CV Builder', link: 'https://example.com/cv-builder', description: 'An AI assisted CV tool' }],
      hobbies: ['Chess', 'Climbing'],
      customSections: [{ id: 's1', title: 'Volunteering', content: 'Food bank coordinator\nMentoring juniors' }],
    };
  }

  it('prints the sections after Skills in a fixed order: Certifications, Languages, Portfolio, Hobbies, custom', async () => {
    const { flat } = await readPdf(await renderer.render({ draft: withSections(), targetRole: 'Engineer' }));

    const upper = flat.toUpperCase();
    const order = ['SKILLS', 'CERTIFICATIONS', 'LANGUAGES', 'PORTFOLIO', 'HOBBIES', 'VOLUNTEERING'];
    const positions = order.map((heading) => upper.lastIndexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('shows each section with exactly the stored values and nothing invented', async () => {
    const { flat } = await readPdf(await renderer.render({ draft: withSections(), targetRole: 'Engineer' }));

    expect(flat).toContain('AWS Solutions Architect');
    expect(flat).toContain('Amazon Web Services · Jun 2024');
    // The text layer splits a link at its "//"; compare it without spaces.
    const compact = flat.replace(/\s+/gu, '');
    expect(compact).toContain('https://aws.amazon.com/verify/123');
    expect(flat).toContain('Scrum Master');
    expect(flat).toContain('English — C1');
    expect(flat).toMatch(/German(?! —)/u);
    expect(flat).toContain('CV Builder');
    expect(compact).toContain('https://example.com/cv-builder');
    expect(flat).toContain('An AI assisted CV tool');
    expect(flat).toContain('Chess · Climbing');
    expect(flat).toContain('Food bank coordinator');
    expect(flat).toContain('Mentoring juniors');
    expect(flat).not.toContain('null');
  });

  it('leaves out every section the draft does not hold, headings included', async () => {
    const { flat } = await readPdf(await renderer.render({ draft: typicalDraft(), targetRole: 'Engineer' }));

    for (const heading of ['CERTIFICATIONS', 'LANGUAGES', 'PORTFOLIO', 'HOBBIES']) {
      expect(flat.toUpperCase()).not.toContain(heading);
    }
  });

  it('keeps the line breaks of a custom section as separate lines', async () => {
    const { pages } = await readPdf(await renderer.render({ draft: withSections(), targetRole: 'Engineer' }));

    const items = pages.flatMap((page) => page.items);
    const first = items.find((item) => item.str.includes('Food bank coordinator'));
    const second = items.find((item) => item.str.includes('Mentoring juniors'));
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first?.y).not.toBe(second?.y);
  });
});

