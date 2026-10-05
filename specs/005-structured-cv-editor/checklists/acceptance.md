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


## Iteration 1: structured layout and sections (Phase 3, US1)

Verified in a browser against the running development servers with a throwaway account and a completed v2 CV with the design's content (one role, one education entry, 85% complete; no AI call), then removed. The numbers below were measured on that single-role CV.

### Layout against frames 05.1 / 06.1 at 1440 px (page y from the top, widths in px)

| Part | Figma | Built |
|------|-------|-------|
| Sticky navigation | 1440 x 80 | 1440 x 80, `position: sticky`, constant while saving, saved, failed, downloading |
| Title block, save status, Download PDF, more options | x 270, 1062, 1209 (131 wide, 44 high), 1364 (44) | x 271, 1060, 1207 (133 wide, 44 high), 1364 (44) |
| Editing column / preview column | 584 at x 32 / 760 at x 648 | 584 at x 32 / 760 at x 648, preview sticky at y 112 |
| Workspace introduction | 584 x 51 | 584 x 51 |
| Personal details card | 584 x 615 | 584 x 614.5 |
| Professional summary card | 584 x 199 | 584 x 202.5 |
| Professional experience card (one role) | 584 x 886 | 584 x 888 (872 before the highlight header height was matched) |
| Education card | 584 x 482 | 584 x 482.5 |
| Completeness card | 584 x 85 | 584 x 87 (border counted outside the box in CSS) |

### Behaviour

- Editing the target role, phone and LinkedIn updates the title, the preview and the completeness score (85% to 100%, "Complete") at once; three edits produce one debounced `PUT`; the CV's `targetRole` and the draft change together in one revision bump; the My CVs list shows the new role; after a reload everything is back, links split into LinkedIn / Portfolio and merged again in the same order.
- Opening the editor saves nothing. An invalid link ("not a url" gives "Enter a valid URL.") or an empty new role / education entry blocks saving ("Fix the highlighted fields to save", no `PUT`) and shows its message on the field; fixing it saves.
- Add and remove (all immediate, no confirmation): role, highlight, link, education entry. The End date select shows **Date ended** only for a specific date.
- The more-options menu offers exactly Back to My CVs and Delete CV; Escape closes it and returns focus; Delete CV opens the confirmation dialog naming the CV, Cancel returns focus to the trigger.
- Download PDF in the new navigation is the feature-004 flow unchanged: busy state with the header still 80 px, the file name follows the edited role, and a failure shows its message in the page instead of growing the header.
- `localStorage` and `sessionStorage` hold nothing.
- My CVs, Create CV, the generation view and the not-found page keep their layout (one header, one main; generation cards 552 x 522 and 376 x 554 as before).
- 390 px and 320 px: no horizontal scroll, sections full width, the Preview tab shows the document; the navigation wraps to two rows below 640 px (the designed phone header is Phase 8).

### Gates

| Gate | Result |
|------|--------|
| Web `tsc --noEmit`, `lint`, `next build` | clean |
| Web unit tests | 18 files, 180 passed after merging iteration 5 (completeness, links with `linkError`, entry labels, form with the split link fields) |

### Notes

- The employer location and the education details text are kept in the draft untouched and not shown, because the design has no field for them.
- Skills still use the temporary per-category editor inside the new card shell.

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
- The inline preview is sticky in the structured layout (iteration 1 column; the panel scrolls inside it when the sheet is taller than the window).

## Iteration 2 (US2): skills by category (T049 to T059)

Figma: `08.1` (skills editing), `08.2` (state matrix: combobox, category cards and ordering, validation, suggestion states) and the skills block of `05.1`.

| Check | Result |
|-------|--------|
| Unit: `skills-form.test.ts` (add with the four refusals and their order, duplicate across categories, remove, add/choose category with the 12 limit, remove category, move and the end limits, counts, "at least 5" advice, suggestion states) and `category-filter.test.ts` (filter, custom option, keyboard navigation) | 59 tests passed; web suite 20 files, 218 tests |
| Gates: web `tsc --noEmit`, `lint` | clean |
| Browser (Playwright script against the dev servers, throwaway account): search field takes focus on open; filter; pick an existing category; add by Enter and by button; duplicate in this category and in another (named); blank; too long; custom category created with "No items added"; Move up reorders; Remove category asks "Observability contains 1 skill: Grafana", Cancel has the focus and keeps it, confirm removes it | pass |
| Save and reload: the draft stores categories in order without the empty ones; reload shows the same grouping and order; the preview groups the skills | pass |
| 320 px: the open list stays inside the viewport (236 px wide, 288 px high, scrolls inside), a 60-character unbroken skill wraps, no horizontal scroll | pass |

Deviations from the frames, on purpose: see the "Built as" note under Phase 4 in `tasks.md` (one editor model for every width, order and removal controls on the edited category, the custom option beside matches).

## Iteration 3 (US3): AI assistant states (T060 to T064)

Figma: `07.1` (answered), `07.2` (applied), `07.3` (state matrix) and the assistant card of `05.1`.

| Check | Result |
|-------|--------|
| Unit: `question-form.test.ts` (unresolved count and the supporting line, the answer save labels, when Apply to CV is allowed, when an answer needs saving, the helper text, the "Section / Name" context) and `apply-flow.test.ts` (each failure code to its message, kind and recovery actions) | pass; web suite 218 tests before this change, 230 after |
| Browser (Playwright script, throwaway account, apply responses stubbed so no AI call is made): Apply disabled while unanswered and while the answer is unsaved; typing saves by itself and shows Saved and Answered; Apply enabled; the four failures show their message, their actions and "Retained answer … Target: Experience / Kilona."; Retry later hides the notice; Dismiss collapses the question and the header reads 0 unresolved and "All resolved" | pass |

Not run here: an apply that reaches the real model, and the answer-save failure state with a real network failure (the code path is covered by the save error branch of the mutation).

## Iteration 4 (US4): save state, failure notice and conflict review (T065 to T071)

Figma: `09.1` (saving), `09.2` (save error and conflict), `09.3` to `09.5` (conflict review at 1440, 390 and 320), `11.1` and `11.2` (state register and header contract).

| Check | Result |
|-------|--------|
| Unit: `conflict-review.test.ts` (identical versions, blank versus empty, one differing section with what differs on each side, several fields, order-only skill changes, an entry in one version only, no merged text, the summary line), `save-view.test.ts` (labels, actions, intro line per state), `preview-zoom.test.ts` (local draft while saving) | pass; web suite 22 files, 250 tests |
| Gates: web `tsc --noEmit`, `lint` | clean |
| Browser (Playwright script, throwaway account, the save request delayed, aborted, and a newer revision written to the database): Saving… in the navigation, the supporting line and the preview caption while a save is held; after the abort "Couldn't save · Retry" as a button, the notice, "Last saved version" caption, the typed text kept, Retry connection saves the same text; after a revision written by "another device" the editing person gets "Conflict · Review versions", the notice, the review with both documents and the differing sections marked, Cancel keeps the draft and saves nothing, Keep my version saves the local draft, Use saved version shows the saved text and drops the local edit | pass |
| Phone: the review is full screen at 390 and 320 px, no horizontal scroll, every button 44 px high | pass |

## Iteration 6 (US6): phone layout (T078 to T084)

Figma: `05.2` (390), `05.3` (320), `10.3` and `10.4` (full-screen preview), `11.2` (mobile safe area and keyboard contract).

| Check | Result |
|-------|--------|
| Unit: `mobile-view.test.ts` (the sticky action per view, the keyboard threshold) | pass; web suite 23 files |
| Gates: web `tsc --noEmit`, `lint` | clean |
| Browser (Playwright, throwaway account) at 390 and 320 px: navigation 112 px (row 44, title row 28), Edit and Preview 44 px, no horizontal scroll, Preview CV switches to the preview and becomes Edit CV, the form keeps its text | pass |
| 320 px with long unbroken strings in the role, name, summary and company: no horizontal scroll in the editor or the preview, the navigation title stays on one line, the navigation stays 112 px | pass |
| The sticky bar hides when the visual viewport shrinks (keyboard) and returns; the last section's action ("+ Add education") ends above the bar | pass |

Not run: a real on-screen keyboard (a phone or the iOS Simulator); the keyboard rule is checked by resizing the visual viewport.

