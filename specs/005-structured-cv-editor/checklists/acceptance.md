# Acceptance evidence: Structured CV Editor

Evidence is appended per phase. Each entry says what was run and what was observed.

## Phase 2: data foundation (draft v2)

Environment: local PostgreSQL 16, scratch databases created and dropped by the verification script (never the development or `_test` databases), real `prisma migrate deploy`.

### T028 Migration `20261005210000_draft_skill_categories`

| Scenario | Result |
|----------|--------|
| Clean database, full `migrate deploy` | All 5 migrations applied; `Cv_draft_schema_version_check` exists; a second `deploy` reports "No pending migrations". |
| Database at the `003` migration holding v1 drafts: skills `["Node.js","node.js"," ","Go"]` (`revision` 5), empty skills, an already-v2 draft, a `PENDING` and a `FAILED` row with `NULL` draft | v1 skills became one category `{id: "skills-default", name: "Skills", skills: ["Node.js","Go"]}` (blank dropped, case-insensitive duplicate collapsed, first spelling and order kept); empty skills became `skillCategories: []`; the v2 draft is byte-for-byte unchanged; `NULL` drafts unchanged; `revision` and `updatedAt` of every row unchanged. |
| Second `deploy` and a direct re-run of the SQL on the migrated database | Nothing re-migrated; row dump identical before and after. |
| Malformed row (`schemaVersion: 7`) next to a valid v1 row | Migration stops with `draft_skill_categories: 1 CV draft(s) have an unknown schemaVersion` (counts only, no draft content); the valid v1 row stays v1 and the CHECK is not installed (whole migration rolled back). Recovery documented and exercised: `migrate resolve --rolled-back`, fix the row, `deploy` succeeds. |
| CHECK on the real table | Rejected: a version 1 draft, a draft without `schemaVersion`, a JSON array, a JSON string. Accepted: `NULL`, a v2 object. |
| Development database (`ai_cv_builder`) holding earlier test drafts | 96 v1 drafts migrated in place; afterwards `v1 = 0`, no draft keeps a flat `skills` key, every `NULL` draft untouched. |

The same cases run in `API/test/draft-skill-categories-migration.e2e-spec.ts` against the migration file in an isolated schema (22 tests).

### T029 Generation lifecycle on the migrated schema

`generation-lifecycle`, `generation-failures`, `generation-startup`, `cv-concurrency`, `cv-edit` and the rest of the e2e suite pass on the migrated test database (23 files, 292 tests), including `PENDING` to `PROCESSING` to `COMPLETED` with a v2 draft, `FAILED`, retry, and the startup sweep to `FAILED/INTERRUPTED`. The migration e2e also inserts `PENDING`, `PROCESSING`, `FAILED` rows with `NULL` draft and a `PENDING` row later updated to `COMPLETED` with a v2 draft: no statement is rejected.

### T030 PDF export on v2 and after the migration

1. PDF specs pass: `cv-pdf-renderer.service.spec.ts` (15 tests, including a lone default `Skills` category without a label, several labelled categories in order, no Skills section when no category holds a skill, the 12-category / 60-skill maximum), `pdf-filename.spec.ts`, `cv-export.e2e-spec.ts`.
2. On the migrated development database, `GET /api/cvs/:id/pdf` as the owner: `200 application/pdf` for a migrated v1 CV with Latin skills (text: `SKILLS Node.js · PostgreSQL · TypeScript`), for one with Cyrillic skills (`SKILLS Українська мова · Español`), and for one with empty skills (no Skills heading at all).
3. A v2 CV with a Cyrillic custom category name exports `Мови програмування: Go · Rust` and `Databases: PostgreSQL`.
4. A foreign CV returns `404`, a `PENDING` CV returns `409`, an anonymous request returns `401`, as in `004`.

The text was extracted from the generated PDFs with the same extractor the renderer spec uses.

### Gates

| Gate | Result |
|------|--------|
| API `tsc --noEmit`, `lint` (oxlint type-aware), `build` | clean |
| API unit tests | 30 files, 425 tests passed |
| API e2e tests | 23 files, 292 tests passed |
| Web `tsc --noEmit`, `lint`, `build` | clean |
| Web unit tests | 14 files, 125 tests passed |
| Cleanup grep (T031) | no flat `skills` field and no `schemaVersion: 1` outside tests that assert v1 is rejected |

### Browser check of the temporary categorised skills editor

Next.js production build against the migrated database: the preview shows `Frontend: …` and `Testing: …`; editing a category's skills autosaves ("All changes saved") and survives a reload; a duplicate category name and a skill repeated across categories show inline errors and are not saved.

### Notes

- `@types/pg` was added to `API` devDependencies (type declarations for the `pg` client the migration e2e uses; `pg` was already a dependency and `@types/pg@8.23.1` was already in the lockfile through the Prisma adapter).
- The SKILLS apply issue paths are `patch.additions`; the draft mapper does not enforce the category and skill caps (validation rejects an over-cap draft, so nothing over the caps is persisted).

## Iteration 5 (US5): preview controls and full-screen preview (T072 to T077)

Figma: section `10 · Preview & fullscreen` (`76:3937`): 10.1 desktop hover, 10.2 desktop fullscreen, 10.3 mobile 390, 10.4 mobile 320 (frames `51:2273`, `41:28492`, `46:2700`, `46:2790`).

| Check | Result |
|-------|--------|
| Unit: `preview-zoom.test.ts` (zoom steps and limits, fitted phone scale, fit, page estimate, status line) | 12 tests passed; web suite 17 files, 164 tests |
| Gates: web `tsc --noEmit`, `lint`, `build` | clean |
| Expand action hidden until the sheet is hovered or focused; visible without hover on a touch device | pass (1440, 390, 320) |
| Zoom limits in the inline panel | 150% (+ disabled) and 50% (- disabled) |
| Fullscreen: opens on the keyboard (Enter), own zoom (inline zoom unchanged), Fit page resets, Esc closes, Close preview closes, focus returns to the expand button | pass |
| Download PDF from the fullscreen bar | a PDF download starts (`Alex-Morgan-Senior-Frontend-Engineer.pdf`) |
| Long CV (9 roles) | "Page 1 of 2" and a page-break guide |
| 390 px and 320 px fullscreen | no horizontal overflow; every control 44 px high; fitted zoom 54% and 43% |
| `localStorage`/`sessionStorage` | empty of CV content |

Deviations from the frames, on purpose:

- The frames show "83%" (desktop) and "45%" (phone) as example values. The product shows the real scale: the sheet fits the available width (inline) or the whole page (fullscreen Fit page), never above 100%.
- The desktop bottom bar is as wide as the 660 px sheet at 100%; at a smaller zoom it stays 660 px wide while the sheet is narrower.
- The page count is an estimate from the preview height (the PDF export owns real pagination); the sheet grows to the content with dashed guides at each A4 boundary rather than in whole A4 steps.
- The inline preview is not sticky yet: the sticky column belongs to the structured layout (iteration 1).
