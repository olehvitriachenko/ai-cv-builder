# API Contract: Structured CV Editor (changes to the 003 contract)

Everything in [`specs/003-cv-editor-my-cvs/contracts/cv-editor-api.md`](../../003-cv-editor-my-cvs/contracts/cv-editor-api.md) applies unchanged (session cookie, error body, ownership, error codes, revision rules) except what is listed here. No new endpoint.

## Changes

| Operation | 003 | Now |
|-----------|-----|-----|
| `CvDraft` | `schemaVersion: 1`, `skills: string[]` | `schemaVersion: 2`, `skillCategories: SkillCategory[]`; no `skills` key |
| `GET /api/cvs/:id/result` | `{ id, status, revision, draft, questions[] }` | adds `targetRole: string` |
| `PUT /api/cvs/:id/draft` | body `{ revision, draft }` | body `{ revision, draft, targetRole? }` |
| `POST .../questions/:qid/apply` | returns `CvResult` | `CvResult` now carries the v2 draft and `targetRole`; SKILLS answers apply as category additions |
| `GET /api/cvs` | unchanged | unchanged (the card's role reflects an edited target role) |

## Shared shapes

```text
SkillCategory = { id: string, name: string /* 1..60 */, skills: string[] /* each 1..60 */ }

CvResult = {
  id, status: "COMPLETED", revision, targetRole: string,
  draft: CvDraft /* v2 */, questions: ClarificationQuestion[]
}
```

## `PUT /api/cvs/:id/draft`

Body: `{ revision: number, draft: CvDraft, targetRole?: string }`.

- `targetRole`, when present: trimmed, 1 to 200 characters. When absent the stored role is unchanged.
- Draft validation: the draft schema (v2 shape and caps: at most 12 categories, at most 60 skills in total), plus the write-path rules: entry ids unique, email valid when set, category names unique case-insensitively, skills unique case-insensitively across the CV, no empty category.
- One conditional `UPDATE` (owner, `COMPLETED`, revision) writes `draft`, `targetRole` (when given) and `revision + 1`.

`200` -> `{ revision, updatedAt }` (unchanged).

| Status | `code` | When |
|--------|--------|------|
| `400` | `VALIDATION_ERROR` | Invalid body. `fieldErrors` keys are dotted paths, for example `targetRole`, `draft.skillCategories.0.name`, `draft.skillCategories.1.skills.3`, `draft.skillCategories` (duplicate names or the 60-skill total) |
| `404`, `409` | `CV_NOT_FOUND`, `CV_NOT_EDITABLE`, `REVISION_CONFLICT` | unchanged |

A body with `schemaVersion: 1` or a `skills` key is `400` (the old shape is not accepted).

## Apply of a SKILLS question

The answer applier receives the categories (names and skills) and returns `{ additions: [{ category, skills[] }] }`. The server appends each skill to the category with the same name (case-insensitive) or creates that category at the end when it is a predefined name or `Skills`; duplicates are ignored; nothing is removed or renamed. Errors as in `003`: `422 APPLY_OUTPUT_INVALID` (unknown category, empty effective patch, schema or cap violation), `409 TARGET_NOT_APPLICABLE`, `503 AI_UNAVAILABLE`, `409 REVISION_CONFLICT`, `409 QUESTION_STATE_CONFLICT`.

## Generation

The structured output of generation uses `skillCategories: [{ category: <predefined name | "Skills">, skills[] }]`; the stored draft is v2. Prompt version 3. No endpoint changes.

## Guarantees

- The database holds only version 2 drafts (CHECK constraint) after the migration.
- Privacy: logs and errors carry ids, status and error category only, never role text, skills or draft content.
