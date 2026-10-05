import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { getDocumentProxy } from 'unpdf';
import { cvDraftSchema } from '../src/modules/cv/generation/draft.schema.js';
import { CvPdfRenderer } from '../src/modules/pdf/export/cv-pdf-renderer.service.js';
import { API_ROOT, testDatabaseUrl } from './helpers/test-db.js';

const MIGRATION_SQL = readFileSync(
  join(API_ROOT, 'prisma/migrations/20261005210000_draft_skill_categories/migration.sql'),
  'utf8',
);
const DRAFT_CHECK = 'Cv_draft_schema_version_check';

function v1Draft(skills: unknown, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
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
    education: [],
    skills,
    ...overrides,
  };
}

function v2Draft() {
  const { skills: _skills, ...rest } = v1Draft([]);
  return {
    ...rest,
    schemaVersion: 2,
    skillCategories: [
      { id: 'cat-a', name: 'Languages', skills: ['TypeScript', 'Go'] },
      { id: 'cat-b', name: 'Databases', skills: ['PostgreSQL'] },
    ],
  };
}

/**
 * Runs the real migration file against a throw-away copy of the Cv table (its own schema in the
 * test database), so rows in the old shape can be inserted: the real table already enforces the new
 * CHECK. Nothing here touches the rows other e2e files use.
 */
describe('Draft skill categories migration (v1 -> v2)', () => {
  const schema = `migration_${randomBytes(6).toString('hex')}`;
  let client: Client;
  let rowCounter = 0;

  async function insert(
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    draft: unknown,
    revision = 3,
  ): Promise<string> {
    rowCounter += 1;
    const id = `cv-${rowCounter}`;
    await client.query(
      `INSERT INTO "Cv" ("id","userId","targetRole","sourceType","sourceText","generationStatus",
         "failureReason","processingStartedAt","draft","revision","updatedAt")
       VALUES ($1,'user-1','Backend Engineer','FREE_TEXT','source',$2::"GenerationStatus",
         $3::"FailureReason",$4,$5::jsonb,$6,'2026-01-02T03:04:05Z')`,
      [
        id,
        status,
        status === 'FAILED' ? 'UNKNOWN' : null,
        status === 'PROCESSING' ? new Date() : null,
        draft === null ? null : JSON.stringify(draft),
        revision,
      ],
    );
    return id;
  }

  async function read(id: string) {
    const { rows } = await client.query<{ draft: unknown; revision: number; updatedAt: Date }>(
      `SELECT "draft","revision","updatedAt" FROM "Cv" WHERE "id" = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) {
      throw new Error(`row ${id} is missing`);
    }
    return row;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    await client.query(`CREATE TABLE "Cv" (LIKE public."Cv" INCLUDING ALL)`);
    // The copy carries the CHECK the real migrations already installed; the migration re-creates it.
    await client.query(`ALTER TABLE "Cv" DROP CONSTRAINT IF EXISTS "${DRAFT_CHECK}"`);
  });

  beforeEach(async () => {
    await client.query(`DELETE FROM "Cv"`);
    await client.query(`ALTER TABLE "Cv" DROP CONSTRAINT IF EXISTS "${DRAFT_CHECK}"`);
  });

  afterAll(async () => {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  });

  it('turns a flat skills list into one "Skills" category and drops the flat field', async () => {
    const id = await insert('COMPLETED', v1Draft(['Node.js', 'PostgreSQL', 'TypeScript']));

    await client.query(MIGRATION_SQL);

    const { draft } = await read(id);
    expect(draft).toMatchObject({
      schemaVersion: 2,
      skillCategories: [
        { id: 'skills-default', name: 'Skills', skills: ['Node.js', 'PostgreSQL', 'TypeScript'] },
      ],
    });
    expect(draft).not.toHaveProperty('skills');
    expect(cvDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('keeps the other draft content exactly as it was', async () => {
    const original = v1Draft(['Node.js']);
    const id = await insert('COMPLETED', original);

    await client.query(MIGRATION_SQL);

    const { draft } = await read(id);
    const { skills: _skills, schemaVersion: _version, ...unchanged } = original;
    expect(draft).toMatchObject(unchanged);
  });

  it('trims, drops blanks and collapses case-insensitive duplicates, keeping the first spelling and order', async () => {
    const id = await insert(
      'COMPLETED',
      v1Draft(['TypeScript', ' node.js ', '   ', 'typescript', 'Node.JS', 'Go', '']),
    );

    await client.query(MIGRATION_SQL);

    const { draft } = await read(id);
    expect(draft).toMatchObject({
      skillCategories: [
        { id: 'skills-default', name: 'Skills', skills: ['TypeScript', 'node.js', 'Go'] },
      ],
    });
  });

  it.each([
    ['an empty list', []],
    ['only blank entries', ['', '  ']],
  ])('gives %s no category at all', async (_label, skills) => {
    const id = await insert('COMPLETED', v1Draft(skills));

    await client.query(MIGRATION_SQL);

    const { draft } = await read(id);
    expect(draft).toMatchObject({ schemaVersion: 2, skillCategories: [] });
    expect(cvDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('leaves a draft that is already version 2 byte-for-byte alone', async () => {
    const id = await insert('COMPLETED', v2Draft());
    const before = await read(id);

    await client.query(MIGRATION_SQL);

    const after = await read(id);
    expect(after.draft).toEqual(before.draft);
    expect(after.draft).toEqual(v2Draft());
  });

  it('does not touch rows without a draft (PENDING, PROCESSING, FAILED)', async () => {
    const ids = [
      await insert('PENDING', null),
      await insert('PROCESSING', null),
      await insert('FAILED', null),
    ];

    await client.query(MIGRATION_SQL);

    for (const id of ids) {
      expect((await read(id)).draft).toBeNull();
    }
  });

  it('is a storage change, not an edit: revision and updatedAt stay the same', async () => {
    const id = await insert('COMPLETED', v1Draft(['Node.js']), 7);
    const before = await read(id);

    await client.query(MIGRATION_SQL);

    const after = await read(id);
    expect(after.revision).toBe(7);
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
  });

  it('can be applied twice without re-migrating or changing anything', async () => {
    const ids = [
      await insert('COMPLETED', v1Draft(['Node.js', 'Go'])),
      await insert('COMPLETED', v2Draft()),
      await insert('PENDING', null),
    ];
    async function readAll() {
      const rows = [];
      for (const id of ids) {
        rows.push(await read(id));
      }
      return rows;
    }

    await client.query(MIGRATION_SQL);
    const afterFirst = await readAll();
    await client.query(MIGRATION_SQL);
    const afterSecond = await readAll();

    expect(afterSecond).toEqual(afterFirst);
  });

  it.each([
    ['an unknown schemaVersion', { ...v2Draft(), schemaVersion: 3 }],
    [
      'a draft without schemaVersion',
      (() => {
        const { schemaVersion: _v, ...rest } = v2Draft();
        return rest;
      })(),
    ],
    ['a version 1 draft whose skills are not a list', v1Draft('Node.js')],
    ['a version 1 draft with a non-string skill', v1Draft(['Node.js', 42])],
  ])('stops without changing any row when it meets %s', async (_label, bad) => {
    const good = await insert('COMPLETED', v1Draft(['Node.js']));
    await insert('COMPLETED', bad);
    const before = await read(good);

    await expect(client.query(MIGRATION_SQL)).rejects.toThrow(/draft_skill_categories/);

    expect((await read(good)).draft).toEqual(before.draft);
  });

  it('stops on a draft that is not a JSON object', async () => {
    await insert('COMPLETED', ['not', 'an', 'object']);

    await expect(client.query(MIGRATION_SQL)).rejects.toThrow(/not JSON objects/);
  });

  describe('the CHECK it installs', () => {
    beforeEach(async () => {
      await client.query(MIGRATION_SQL);
    });

    it('accepts a version 2 draft and a missing draft (the generation lifecycle is unchanged)', async () => {
      await expect(insert('COMPLETED', v2Draft())).resolves.toBeDefined();
      await expect(insert('PENDING', null)).resolves.toBeDefined();
      await expect(insert('PROCESSING', null)).resolves.toBeDefined();
      await expect(insert('FAILED', null)).resolves.toBeDefined();
    });

    it.each([
      ['a version 1 draft', v1Draft(['Node.js'])],
      [
        'a draft without schemaVersion',
        (() => {
          const { schemaVersion: _v, ...rest } = v2Draft();
          return rest;
        })(),
      ],
      ['a JSON array', []],
      ['a JSON string', 'draft'],
    ])('rejects %s', async (_label, bad) => {
      await expect(insert('COMPLETED', bad)).rejects.toThrow(new RegExp(DRAFT_CHECK));
    });

    it('still lets the lifecycle clear and set the draft in the allowed states', async () => {
      const id = await insert('PENDING', null);

      await client.query(
        `UPDATE "Cv" SET "generationStatus" = 'COMPLETED', "draft" = $2::jsonb WHERE "id" = $1`,
        [id, JSON.stringify(v2Draft())],
      );

      expect((await read(id)).draft).toEqual(v2Draft());
    });

    it('can be installed again (the migration is re-executable)', async () => {
      await expect(client.query(MIGRATION_SQL)).resolves.toBeDefined();
    });
  });

  it('exports a migrated version 1 draft to a PDF that shows its skills', async () => {
    const id = await insert('COMPLETED', v1Draft(['Node.js', 'PostgreSQL', 'TypeScript']));
    await client.query(MIGRATION_SQL);
    const { draft } = await read(id);
    const parsed = cvDraftSchema.parse(draft);

    const bytes = await new CvPdfRenderer().render({
      draft: parsed,
      targetRole: 'Backend Engineer',
    });

    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const strings: string[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const content = await (await pdf.getPage(number)).getTextContent();
      for (const item of content.items) {
        if ('str' in item) {
          strings.push(item.str);
        }
      }
    }
    const flat = strings.join(' ').replace(/\s+/g, ' ');
    expect(flat.toUpperCase()).toContain('SKILLS');
    expect(flat).toContain('Node.js · PostgreSQL · TypeScript');
    expect(flat).not.toContain('Skills:');
  });
});
