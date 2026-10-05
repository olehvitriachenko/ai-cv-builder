# Implementation Plan: Structured CV Editor

**Branch**: `005-structured-cv-editor` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-structured-cv-editor/spec.md` (clarified 2026-10-05)

## Summary

Replace the accordion editor of `003` with the structured, always-expanded editor of the Figma section `05` (10 frames), delivered in iterations. Three changes reach below the UI (two are new data behaviour, one keeps the merged PDF export working); everything else is presentation over the existing editing, clarification and concurrency machinery.

1. **Skills grouped by category**: the draft's flat `skills` list is replaced by `skillCategories` (ordered categories, each with an ordered list of skills) and the draft `schemaVersion` becomes 2. A **one-time, repository-tracked SQL migration** moves every stored draft, a DB CHECK keeps the stored version at 2, and the application then supports only the new shape (no runtime dual-format conversion). AI generation (prompt v3) and the clarification apply for the SKILLS section move to the grouped shape.
2. **Editable target role**: `PUT /cvs/:id/draft` accepts an optional `targetRole`, written in the same conditional `UPDATE` as the draft (same revision check); `GET /cvs/:id/result` returns it.
3. **PDF compatibility**: feature `004` (PDF export) is merged into this branch and already works; it reads the draft's flat `skills`. Iteration 0 updates the PDF document to `skillCategories` (names preserved, migrated CVs export with all their skills) and verifies it before the foundation is considered green. The editor header and the full-screen preview reuse the existing Download PDF flow of `004` unchanged.

Everything else is client work on the CV page:

- Sticky editor navigation, completeness card, always-expanded section cards (personal details with LinkedIn/Portfolio/extra links, summary, experience, categorised skills, education), AI Assistant card restyled, and an autosave/conflict notice with a "review both versions" view.
- A preview panel with zoom, estimated page count, status line and a full-screen view (native `<dialog>`).
- A phone layout (390/320 px) with an Edit / Preview switch and a sticky Preview action.

No new table, no new dependency, no new infrastructure. Pure derivations (completeness, links mapping, skills operations, zoom, category filtering) are small framework-free modules with unit tests, in line with `003`.

## Technical Context

**Language/Version**: TypeScript (strict), ESM. API: NestJS 12 + Fastify 5 on Node 22/24. Web: Next.js 16 / React 19 (read the relevant guide in `apps/web/node_modules/next/dist/docs/` before touching routing; `AGENTS.md` warns that conventions differ from older versions).

**Primary Dependencies**: Existing only (plus one internal data-only workspace package, `packages/skill-catalogue`, linked by `pnpm install`; no external package): Prisma 7, Zod 4, `@anthropic-ai/sdk`, `@tanstack/react-query`, React Hook Form, `lucide-react`. **No new dependencies** (the combobox, zoom, full-screen view and reordering are hand-written on native elements).

**Storage**: PostgreSQL. One new migration: a data migration of `Cv.draft` plus one CHECK constraint ([data-model.md](./data-model.md)). No new table or column, no new index.

**Testing**: Vitest. Unit tests for pure code; e2e on real PostgreSQL for the API contract and for the migration (the migration file is executed against seeded rows); Playwright browser runs against the Figma frames at 1440, 390 and 320 px. The real Anthropic API is never called by automated tests.

**Target Platform**: Linux/macOS Node server; modern desktop and mobile browsers.

**Project Type**: Web application (pnpm monorepo `apps/api`, `apps/web`).

**Performance Goals**: The edit save stays one `UPDATE`; the migration is one `UPDATE ... WHERE` pass (take-home scale). The editor re-renders only the changed section card and the preview; completeness is O(draft size) per change.

**Constraints**: Constitution and `.claude/rules/*`; no `any`, no unsafe casts; LLM output validated before persistence; no browser storage of CV content; the draft schema stays the single model (the form only translates it); logs never carry CV content.

**Scale/Scope**: Caps stay those of the draft schema; new caps: at most 12 skill categories, 60 skills in total, category name 1 to 60 characters ([research.md](./research.md) D-2).

## Constitution Check

*GATE: passes before research; re-checked after design (still passes).*

| Principle | Status | How this plan satisfies it |
|-----------|--------|----------------------------|
| I. Product contract | Pass | Return-later editing, clarification answering/applying and the structured document stay intact; PDF export (`004`, merged) keeps working on draft v2 |
| II. Strict type safety | Pass | One draft schema (v2) parsed at every boundary; the form maps to it with typed helpers; no casts as validation |
| III. Reliability over breadth | Pass | The migration is idempotent, guarded and verified four ways; compare-and-set saves unchanged; iterations ship one verified slice at a time |
| IV. Generation lifecycle | Pass | Lifecycle untouched; only the structured output and its mapping change |
| V. Auth and ownership | Pass | `targetRole` rides the existing owner-scoped conditional update; no new route needs identity from the client |
| VI. AI transforms facts, never invents | Pass | Grouping only places skills the source states under category names; unplaceable skills go to "Skills"; the SKILLS answer-apply stays additive and scoped. As in `002`, skills are governed by the prompt contract, not mechanically verified ([research.md](./research.md) D-7) |
| VII. Structured output validated | Pass | Model output -> Zod (category enum + strings) -> domain mapping/caps -> persistence; apply patches stay strict and additive |
| VIII. Server-first | Pass | The CV page stays a Server Component that loads the result; interactive sections are client components below it |
| IX. Database integrity | Pass | Explicit migration; a CHECK constraint keeps every stored draft at version 2; no speculative index |
| X. Critical behavior tested | Pass | See [Test Strategy](#test-strategy); tests precede each iteration |
| XI. User controls the CV | Pass | Suggestions are client-only until tapped; "Improve with AI" is not shown; conflicts never merge automatically |
| XII. Simplicity | Pass | Whole-version conflict choice, Move up/down instead of drag-and-drop, hand-written combobox, estimated page count instead of a pagination engine; one JSON file instead of two copies of the catalogue |
| XIII. Scope discipline | Pass | Out-of-scope list of the spec respected; no new PDF features, templates or AI rewriting; the `004` contract is untouched |
| XIV. Owned code | Pass | Each iteration is reviewed against its Figma frames and the diff; decisions are in [research.md](./research.md) |
| XV. Local reproducibility | Pass | Migration verified on local PostgreSQL (clean and seeded); quickstart lists the commands |
| XVI. Documentation | Pass | Trade-offs recorded in research and repeated in the README follow-ups at the end |

## Project Structure

### Documentation (this feature)

```text
specs/005-structured-cv-editor/
├── spec.md
├── plan.md                              # This file
├── research.md                          # Decisions D-1 .. D-18
├── data-model.md                        # Draft v2, migration rules, derived models
├── quickstart.md                        # How to run and verify each iteration
├── contracts/structured-editor-api.md   # Changes to the 003 contract
├── checklists/requirements.md
└── tasks.md                             # Created by /speckit-tasks
```

### Source Code (repository root)

```text
packages/skill-catalogue/                          # NEW: data-only workspace package, ONE source for categories + suggestions
├── package.json                                 # name, exports -> ./skill-categories.json
└── skill-categories.json                        # ordered [{ name, suggestions[4..6] }]

apps/api/
├── prisma/migrations/<timestamp>_draft_skill_categories/migration.sql   # NEW: data migration + CHECK
└── src/modules/
    ├── cv/
    │   ├── generation/draft.schema.ts            # v2 schema (skillCategories), caps
    │   ├── generation/draft-mapper.ts            # LLM output -> v2 draft (ids, dedupe, caps)
    │   ├── generation/draft-validation.ts        # meaningful-content check over categories
    │   ├── schemas/draft-edit.schema.ts          # + targetRole, unique categories/skills
    │   ├── schemas/cv.schemas.ts                 # target role rule reused by the edit body
    │   ├── services/cv-editor.service.ts         # targetRole in the same UPDATE
    │   ├── services/cv.service.ts                # result DTO adds targetRole
    │   ├── services/clarification.service.ts     # SKILLS scope content (categories)
    │   └── clarification/answer-patch.ts         # SKILLS patch applies per category
    ├── pdf/export/cv-pdf.document.tsx            # (004) skills from skillCategories, grouped, names preserved
    │   (+ cv-pdf-renderer.service.spec.ts, test/cv-export.e2e-spec.ts moved to v2 fixtures)
    └── ai/
        ├── catalogue/skill-categories.ts         # NEW: thin typed accessor (names) over the shared catalogue JSON
        ├── schemas/llm-cv-output.schema.ts       # skillCategories with category enum
        ├── schemas/answer-patch.schema.ts        # skills patch = additions per category
        └── prompts/{cv-draft,answer-patch}.prompt.ts   # v3 / skills scope

apps/web/src/
├── lib/
│   ├── api/cvs.ts                                # v2 draft schema, targetRole in result and save
│   └── cv/
│       ├── draft-form.ts                         # v2 form mapping (+ categories, Present, links)
│       ├── links.ts                              # NEW: LinkedIn / Portfolio / extra links <-> links[]
│       ├── completeness.ts                       # NEW: score + missing items (pure)
│       ├── skills-form.ts                        # NEW: add/remove/move/dedupe operations (pure)
│       ├── skill-catalogue.ts                    # NEW: thin typed accessor over the shared catalogue JSON
│       ├── category-filter.ts                    # NEW: search + keyboard model of the combobox (pure)
│       ├── preview-zoom.ts                       # NEW: zoom steps, fit, page estimate (pure)
│       ├── autosave.ts                           # + targetRole in the saved body
│       └── conflict-review.ts                    # NEW: per-section difference model (pure)
├── components/ui/                                # + Combobox (hand-written), Chip, Dialog wrapper if reused >= 2x
└── app/cvs/
    ├── download-pdf-button.tsx                   # (004) reused as is by the editor header and the full-screen preview
    ├── layout.tsx                                # auth + QueryProvider only (header moves down a level)
    ├── [id]/page.tsx                             # renders AppHeader for generation states, EditorNav for the editor
    └── [id]/…                                    # editor-nav, editor-workspace, completeness-card, ai-assistant,
                                                  # sections/{personal-details,summary,experience,skills,education},
                                                  # preview-panel, fullscreen-preview, conflict-review, mobile switch
```

**Structure Decision**: Keep the `003` layout. The route stays `/cvs/[id]`; the API module keeps its controller and services. New pure logic goes into `apps/web/src/lib/cv/` next to the existing pure modules; new UI goes into `app/cvs/[id]/` (sections in a `sections/` folder, replacing `editor-sections/`). The API gains one small file (`ai/skill-categories.ts`) and one migration; no new module.

## Delivery iterations

Each iteration: tests first, implement, run gates (`tsc`, lint, unit, e2e, `next build`), compare with the Figma frames at desktop and phone width (screenshot geometry and states), then commit. The app stays working after every iteration.

| # | Iteration | Spec | Figma | Contents |
|---|-----------|------|-------|----------|
| 0 | Data foundation | FR-007, FR-010, FR-004 (API) | none | Draft v2 schema, migration + CHECK, generation (prompt v3), SKILLS apply, `targetRole` in result and save, **PDF export reading v2**, minimal web adaptation so the existing editor and preview keep working on v2 |
| 1 | Structured layout and sections | US1 | 05.1, 05.6 | Editor nav, completeness card, always-expanded cards: personal details (links), summary, experience (add/remove, Present, highlights), education (add/remove), sticky preview column |
| 2 | Skills by category | US2 | 05.7 | Category card, combobox, input + Add, suggestions, chips, move up/down, add category, preview grouping |
| 3 | AI Assistant states | US3 | 05.2, 05.3 | Restyled assistant card, unresolved count, answered/applied/dismissed/failed states, complete state |
| 4 | Save state and conflict | US4 | 05.4, 05.5 | Nav save indicator, failure notice with Retry, conflict notice, review both versions (whole-version choice) |
| 5 | Preview controls | US5 | 05.10 | Toolbar, zoom, estimated pages, status line, full-screen dialog |
| 6 | Phone layout | US6 | 05.8, 05.9 | Condensed nav, status row, Edit / Preview switch, sticky Preview CV bar, 320 px pass |

Iteration 0 is the only one that touches the API and the database; iterations 1 to 6 are client-only and can be reordered if the design changes.

## Test Strategy

| Spec requirement | Tests (written first) |
|------------------|-----------------------|
| FR-009 catalogue | Unit (both apps): the JSON is valid, names unique, 4 to 6 suggestions each within draft caps; a malformed file fails fast; the API's category enum equals the file's names |
| FR-010 migration | Migration e2e: executes the migration SQL against seeded rows: clean DB (no rows, no error), v1 drafts with skills (single "Skills" category, order kept, case-insensitive duplicates dropped), v1 with empty skills (no category), already-v2 draft (byte-for-byte unchanged), a second run (no change), a malformed v1 draft (migration fails with a clear error, nothing altered), `updatedAt` and `revision` untouched; CHECK rejects a v1 draft, a draft without `schemaVersion`, a JSON array and a JSON `null`, and accepts SQL `NULL` and a v2 object; the generation lifecycle e2e (`PENDING` -> `PROCESSING` -> `COMPLETED`/`FAILED`, retry, startup sweep) passes unchanged on the migrated schema |
| FR-007 skills model | Unit: draft schema v2 (caps, name length, v1 rejected), edit schema (unique category names, duplicate skills across the CV, total cap, empty category rejected), mapper (ids, dedupe, caps) |
| FR-010 AI | Unit: LLM output schema (category enum, unknown name rejected), prompt v3 snapshot rules (categories listed, fallback "Skills", injection delimiters), generation e2e with the fake generator (grouped draft persisted, malformed output not persisted), SKILLS apply unit + e2e (adds to existing category case-insensitively, creates a new one, never removes, unknown category rejected, empty patch rejected) |
| FR-004 target role | E2e: save with a new target role updates `Cv.targetRole` and the revision in one write; stale revision changes nothing; blank/too long is 400 with a `targetRole` field error; foreign CV is the usual 404; the list and the result show the new role |
| FR-003 completeness | Unit: every item and weight, 100% and 0%, the design example (85%, 2 left), recomputation on edits |
| Links mapping | Unit: LinkedIn/portfolio/extra split and merge round-trip, max 5, no loss of unknown links |
| FR-008/FR-009 skills UI logic | Unit: add (trim, blank, duplicate across CV, too long, cap), remove, move up/down edges, suggestions exclusion, category filter and keyboard model |
| FR-012/FR-013 save and conflict | Existing autosave state-machine tests extended (targetRole in body); conflict-review difference model unit tests; browser run for offline and two-tab conflict (Keep my version, Use saved version) |
| FR-014 preview | Unit: zoom steps and limits, fit, page estimate; browser: zoom, full-screen open/close with Esc and focus return |
| FR-015 phone | Browser at 390 and 320 px: no horizontal scroll, combobox list fits, Edit/Preview keeps unsaved text and scroll |
| FR-016/017 | Existing ownership and log-hygiene e2e extended to `targetRole` |
| FR-018/FR-020 PDF on v2 | Renderer spec and `cv-export.e2e-spec.ts` moved to v2 fixtures (written first): skills grouped with category names preserved, sole default `Skills` shown without a label, `skillCategories: []` shows no heading, Cyrillic and accented text still extracted as text, maximum draft exports with nothing dropped and no orphaned heading, contract unchanged; export of a v1 draft after the migration; manual check on scratch databases; browser: Download PDF in the editor header and the full-screen preview saves pending edits first |
| SC-004 | Per iteration: Figma comparison of structure and geometry at desktop and phone width; results recorded in the acceptance checklist |

## Complexity Tracking

No constitution violations. Three points of weight are justified in [research.md](./research.md): the schema version bump with a DB CHECK (D-3, required by "support only the new shape"; verified not to break the generation lifecycle), the data-only workspace package (D-10, required by "one centralized list"; a spike task proves it and a fallback is recorded) and the hand-written combobox (D-11, because a native `<select>` or `<datalist>` cannot match the design or the keyboard behaviour and no dependency is allowed).
