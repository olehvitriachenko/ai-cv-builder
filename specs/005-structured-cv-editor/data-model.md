# Data Model: Structured CV Editor

No new table. `Cv.draft` (JSON) changes shape; one constraint is added.

## Draft v2 (`CvDraft`, `schemaVersion: 2`)

```text
CvDraft = {
  schemaVersion: 2,
  contact: { fullName, email, phone, location, links: string[<=5] },    // unchanged
  summary: string | null,                                              // unchanged
  experience: ExperienceEntry[<=30],                                   // unchanged
  education: EducationEntry[<=10],                                     // unchanged
  skillCategories: SkillCategory[<=12]                                 // NEW (replaces skills)
}

SkillCategory = { id: string (non-empty), name: string (1..60), skills: string[] (each 1..60) }
```

Stored-draft invariants (schema, every read and write): shape, caps above, total skills across categories <= 60, each category has at least one skill when written by the editor (the editor drops empty categories before saving; the migration and the AI mapper never create one).

Write-path invariants (edit body): category names unique case-insensitively; skills unique case-insensitively across the CV; entry ids unique (as in `003`); email valid when set.

`null` still means "not supported by the source" for nullable fields; skill categories have no nulls.

## Target role

`Cv.targetRole` (unchanged column): trimmed, 1 to 200 characters. Edited through the draft save (same revision). Not part of the draft JSON.

## Migration `<timestamp>_draft_skill_categories`

Pre-check (raises an error, changes nothing): any non-null draft that is not a JSON object, whose `schemaVersion` is not 1 or 2, or whose version 1 `skills` is not an array.

For each draft with `schemaVersion` 1:

| Input | Result |
|-------|--------|
| `skills: ["A", "B", "a"]` | `skillCategories: [{ id: "skills-default", name: "Skills", skills: ["A", "B"] }]` (case-insensitive duplicates removed, first wins, order kept) |
| `skills: []` | `skillCategories: []` |
| any other field | unchanged |
| `schemaVersion` | 2 |

Drafts with `schemaVersion` 2 and `NULL` drafts: untouched. `revision` and `updatedAt`: untouched. Then:

```text
ALTER TABLE "Cv" ADD CONSTRAINT "Cv_draft_schema_version_check"
  CHECK (draft IS NULL OR draft ->> 'schemaVersion' = '2');
```

Properties: idempotent (a second run finds no v1 drafts), order-preserving, loss-free except case-insensitive duplicates, verifiable as a file against seeded rows.

## Derived (client only, not stored)

- **Completeness**: `{ percent, missing[{ id, label, gain }] }` from the spec appendix table.
- **Links view**: `{ linkedin, portfolio, extra[] }` over `contact.links`.
- **End-date mode**: `present | text` over `endDate`; education "currently studying" flag.
- **Preview**: zoom (50 to 150 percent), estimated page count.
- **Section differences** for the conflict review.

## Clarification questions

Unchanged (`003` states and DB checks). A SKILLS-section question applies through the additive category patch ([research.md](./research.md) D-8); there is no `field` for skills.
