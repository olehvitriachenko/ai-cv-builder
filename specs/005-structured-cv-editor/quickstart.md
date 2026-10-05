# Quickstart: Structured CV Editor

How to run and verify each iteration. Details: [plan.md](./plan.md), [data-model.md](./data-model.md), [contracts](./contracts/structured-editor-api.md).

## Prerequisites

- Node 22/24, pnpm, PostgreSQL 16 (`pg_ctlcluster 16 main start`, or `docker compose up -d postgres`).
- `apps/api/.env` with `DATABASE_URL`; `ANTHROPIC_API_KEY` only for the manual smoke test.
- Install and generate: `pnpm install`, `pnpm db:generate`, `pnpm db:migrate`.

## 1. Gates (every iteration)

```text
pnpm --filter api exec tsc --noEmit
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api test:e2e          # real PostgreSQL, ANTHROPIC_API_KEY unset
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```

Expected: all green; the suite makes no real AI request.

## 2. Migration (iteration 0)

1. **Clean database**: create an empty database, run `pnpm db:migrate`; it applies with no error and no data.
2. **Database with existing drafts**: on a scratch database migrate to the `003` migration, insert (a) a v1 draft with skills `["React","TypeScript","react"]`, (b) a v1 draft with `skills: []`, (c) a v2 draft, (d) a `NULL` draft; record `revision` and `updatedAt`; run `pnpm db:migrate`.
   - (a) becomes `skillCategories: [{ id: "skills-default", name: "Skills", skills: ["React","TypeScript"] }]`, `schemaVersion` 2;
   - (b) becomes `skillCategories: []`;
   - (c) and (d) are byte-for-byte unchanged; `revision` and `updatedAt` are unchanged for all.
3. **Second run**: `prisma migrate deploy` reports nothing to apply; re-executing the SQL file changes nothing.
4. **Malformed draft**: a scratch row with `skills: "x"` makes the migration fail with a clear error and leaves every row unchanged.
5. **CHECK**: inserting a `schemaVersion: 1` draft is rejected by the database.

The e2e suite runs the same cases against the migration file.

## 3. API behaviour (iteration 0)

- `GET /api/cvs/:id/result` returns `targetRole` and a v2 draft.
- `PUT /api/cvs/:id/draft` with a changed `targetRole` and a grouped draft returns `200`; the list shows the new role; a stale revision returns `409` and changes nothing; a v1 body returns `400`.
- A generation with the fake generator persists a grouped draft; a malformed output persists nothing.
- Answering and applying a SKILLS question adds skills to the named category without removing others.

## 4. Browser verification (iterations 1 to 6)

Run the app (`GENERATION_AUTORUN=false PORT=3001 node dist/main.js`, `next start -p 3000`) with seeded CVs and compare with the Figma frames at 1440, 390 and 320 px:

| Iteration | Check |
|-----------|-------|
| 1 | Structure and spacing of 05.1 and 05.6; all sections open; edit every field, add/remove an entry, a highlight, a link; completeness changes as fields fill; reload keeps everything; target role change shows in the list |
| 2 | 05.7: open the category list, search, pick, type a custom name; add by button and Enter; refusals (blank, duplicate, too long); tap a suggestion; remove a chip; Move up/down; "+ Add skills"; the preview groups skills; reload keeps order |
| 3 | 05.2 and 05.3: unanswered, answered, applied, dismissed, failed apply; unresolved count; complete state |
| 4 | 05.4 and 05.5: Saving, saved, offline "Couldn't save · Retry", two-tab conflict, Review both versions, Keep my version, Use saved version; local text never lost |
| 5 | 05.10: zoom limits, Fit page, expand, Esc and Close, focus returns; status line shows "Last saved version" while unsaved |
| 6 | 05.8 and 05.9: Edit/Preview switch keeps text and scroll, sticky bar does not cover focused fields, combobox list fits at 320 px, no horizontal scroll |

For every iteration also confirm: `localStorage` and `sessionStorage` hold no CV content; a foreign CV id shows the same not-found page.

## 5. Real-model smoke (manual, needs a key)

`ANTHROPIC_API_KEY=... pnpm --filter api test:smoke`: generation returns grouped skills with known categories; a SKILLS apply adds to a named category. Record the result in the acceptance checklist.
