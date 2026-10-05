---

description: "Task list for Structured CV Editor"
---

# Tasks: Structured CV Editor

**Input**: Design documents from `/specs/005-structured-cv-editor/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/structured-editor-api.md](./contracts/structured-editor-api.md), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED (constitution X, `.claude/rules/testing.md`). In every phase write the tests first and confirm they fail, then implement. **No test ever calls the real Anthropic API**, and the suites must pass with `ANTHROPIC_API_KEY` unset.

**Organization**: Phase 2 is the data foundation (plan iteration 0) and blocks everything. Each user story phase is one plan iteration (US1 = iteration 1 ... US6 = iteration 6) and ends with a Figma verification task. Strict TypeScript: no `any`, no `@ts-ignore`, no casts used as validation; untrusted input (HTTP bodies, database JSON, raw SQL rows, JSON files, model output) is `unknown` until Zod parses it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1..US6, mapping to the user stories in spec.md
- Paths are relative to the repository root. `API` = `apps/api`, `WEB` = `apps/web`, `CAT` = `packages/skill-catalogue`.
- Tags: **[SCHEMA]** database migration or constraint, **[AI]** Anthropic, a prompt or model-output handling, **[FIGMA]** requires reading the Figma frames with the Figma tools (load the `figma:figma-design-to-code` skill first; always request the screenshot; never leave temporary Figma asset URLs in code), **[RISK]** touches a shared or fragile file (see "Shared and risky files").

## Locked decisions (do not reopen; from the plan review)

1. **More menu** contains exactly **Back to My CVs** and **Delete CV**. Delete CV opens the existing confirmation dialog; whole-CV deletion always requires confirmation.
2. **Removing** an experience entry, education entry, highlight, link, skill or category is **immediate, no confirmation** (autosave stores it).
3. The skill categories and suggestions live in **one** file, `CAT/skill-categories.json`, consumed by both apps through thin typed accessors. An incomplete list never blocks implementation; the four suspected gaps are added later by editing that file.
4. **Skills are prompt-grounded only.** No task may claim, test or document mechanical grounding of skills; the limit is documented (T085).
5. The database CHECK is exactly `CHECK (draft IS NULL OR (jsonb_typeof(draft) = 'object' AND COALESCE(draft ->> 'schemaVersion', '') = '2'))` and must not break the generation lifecycle (verified in T026 and T027).
6. After the migration the application supports **only** the v2 draft shape: no runtime dual-format conversion anywhere.

## Scope guards

- No new table, no external dependency (the internal data-only workspace package `CAT` is the only addition). The combobox, zoom, full-screen view and reordering are hand-written on native elements.
- `Cv.revision` changes only when the draft content or the target role changes through edit or apply, as in `003`. Answer, dismiss, generation and retry never advance it.
- Do not touch the generation lifecycle (claim, fencing, sweep, retry compare-and-set).
- Out of scope: PDF generation, "Improve with AI", templates, drag-and-drop, per-section conflict merge, version history.

## Dependency overview

```text
Phase 1 Setup (catalogue spike)
        │
        ▼
Phase 2 Foundational: data foundation (v2 draft, migration + CHECK, AI, targetRole, web adaptation)
        │
        ▼
Phase 3 US1 Structured layout and sections (05.1, 05.6) ──┬─▶ Phase 4 US2 Skills by category (05.7)
                                                         ├─▶ Phase 5 US3 AI Assistant states (05.2, 05.3)
                                                         ├─▶ Phase 6 US4 Save state and conflict (05.4, 05.5)
                                                         └─▶ Phase 7 US5 Preview controls (05.10)
                                                                       │
Phases 4 to 7 ─────────────────────────────────────────────────────────┴─▶ Phase 8 US6 Phone layout (05.8, 05.9)
                                                                                    │
                                                                                    ▼
                                                                          Phase 9 Polish and delivery
```

US2 to US5 depend on US1 (they fill its layout) but not on each other and can be reordered; US6 needs all of them because it re-flows every card.

---

## Phase 1: Setup (shared catalogue)

**Purpose**: prove the single centralized catalogue file works in both builds before anything depends on it.

- [x] T001 Read the Next.js 16 guidance in `WEB/node_modules/next/dist/docs/` on JSON imports and workspace packages (as `WEB/AGENTS.md` requires) and note in `specs/005-structured-cv-editor/research.md` D-10 anything that changes the plan.
- [x] T002 [P] Create `CAT/package.json` (`"name": "@ai-cv-builder/skill-catalogue"`, `"private": true`, `"version": "0.0.0"`, `"exports": { ".": "./skill-categories.json" }`, no scripts, no dependencies) and `CAT/skill-categories.json`: an ordered array of `{ "name": string, "suggestions": string[] }` holding the 36 categories and their 4 to 6 suggestions exactly as in the spec appendix, in that order (no placeholder rows for the four suspected gaps).
- [x] T003 Add `"@ai-cv-builder/skill-catalogue": "workspace:*"` to the dependencies of `API/package.json` and `WEB/package.json`, run `pnpm install` (the lockfile change is expected), and commit the lockfile with them.
- [x] T004 [P] Write `API/src/modules/ai/catalogue/skill-categories.spec.ts` (failed first): the names come from the shared file, are trimmed, 1 to 60 characters, unique ignoring case and in file order, `FALLBACK_SKILL_CATEGORY` is `"Skills"` and is not itself listed, `isKnownSkillCategory` is case-insensitive and includes the fallback, and `parseSkillCategoryNames` fails fast on a non-array, an empty catalogue, an empty or over-long name, duplicate names and a name that collides with the fallback. The API validates names only (it uses nothing else); suggestions are validated by the web accessor (T005), so the suggestion rules exist once.
- [x] T005 [P] Write `WEB/src/lib/cv/skill-catalogue.test.ts` (failed first): the same assertions through the web accessor, plus `suggestionsFor(name)` is case-insensitive, returns `[]` for an unknown or custom name, and `isPredefinedCategory(name)` is case-insensitive.
- [x] T006 Create `API/src/modules/ai/catalogue/skill-categories.ts` (a domain folder per `.claude/rules/file-structure.md`): imports the JSON (`with { type: 'json' }`), parses the names with Zod at module load, and exports `SKILL_CATEGORY_NAMES` (a non-empty tuple usable in `z.enum`), `FALLBACK_SKILL_CATEGORY = 'Skills'`, `isKnownSkillCategory(name)` and `parseSkillCategoryNames(input)` for tests. No `resolveJsonModule` change was needed.
- [x] T007 Create `WEB/src/lib/cv/skill-catalogue.ts`: same JSON import and Zod parse, exporting `SKILL_CATALOGUE` (ordered `{ name, suggestions }[]`), `suggestionsFor(name)` and `isPredefinedCategory(name)`.
- [x] T008 Spike gate: run `pnpm --filter api build` and start `node API/dist/main.js` (it must boot and import the JSON), `pnpm --filter web build`, and T004/T005 green. Record the result in `research.md` D-10. If either build cannot import the JSON, **stop and report**; the documented fallback (keep the file in `API`, expose it to the web through a small authenticated read-only endpoint) needs a decision before continuing. **Result (2026-10-05): passed.** API `tsc`, oxlint, `nest build` clean and `node dist/modules/ai/catalogue/skill-categories.js` imports the JSON at runtime (36 names); web `tsc`, eslint and `next build` clean, and a temporary server + client component importing the accessor rendered `server:36` and `client:36:React` from `next start` (the temporary route was removed). Unit suites: API 356, web 97 passing.

**Checkpoint**: one catalogue file, two thin accessors, both builds pass.

---

## Phase 2: Foundational: data foundation (blocks all user stories)

**Purpose**: draft v2, migration and CHECK, AI generation and apply on categories, editable target role, and a minimally adapted web app. After this phase the old editor still works on v2 data.

### Tests first (all fail until implementation)

- [ ] T009 [RISK] Move the API test fixtures to the v2 draft: update `API/test/helpers/seed.ts` and `API/test/helpers/llm-output.ts` (and every inline draft in `API/test/*.e2e-spec.ts`) so drafts use `schemaVersion: 2` and `skillCategories: [{ id, name, skills }]` instead of `skills`. This must land before the CHECK exists, because the CHECK rejects v1 seeds.
- [ ] T010 [P] [SCHEMA] Write `API/test/draft-skill-categories-migration.e2e-spec.ts`: read the migration SQL file (glob `API/prisma/migrations/*_draft_skill_categories/migration.sql`) and execute it in an isolated schema so other e2e files are unaffected: `CREATE SCHEMA` a scratch schema, `CREATE TABLE <scratch>."Cv" (LIKE public."Cv" INCLUDING ALL)`, drop the draft CHECK on the copy, set `search_path` to the scratch schema for the session, seed rows, run the file, assert, then drop the schema. Cases: no rows (no error); v1 `skills: ["React","TypeScript","react"]` becomes `schemaVersion` 2 with `skillCategories: [{ id: "skills-default", name: "Skills", skills: ["React","TypeScript"] }]` (case-insensitive duplicate removed, first wins, order kept) and no `skills` key; v1 with `skills: []` becomes `skillCategories: []`; a v2 draft is byte-for-byte unchanged; a `NULL` draft stays `NULL`; `revision` and `updatedAt` unchanged for every row; running the file a second time changes nothing; a v1 draft with `skills: "x"` (not an array) makes the file raise an error and leaves every row unchanged; after the run the CHECK **rejects** a v1 draft, a draft without `schemaVersion`, `"schemaVersion": "2x"`, a JSON array and a JSON `null` literal and **accepts** SQL `NULL` and a v2 object.
- [ ] T011 [P] Write the v2 cases in `API/src/modules/cv/generation/draft.schema.spec.ts`: `schemaVersion` must be 2 (1 is rejected); `skillCategories` is at most 12; a category `name` is trimmed 1 to 60 characters; each skill is trimmed 1 to 60 characters; at most 60 skills in total across categories; a category needs a non-empty `id`; the old `skills` key is not part of the shape; `null` is still allowed for the nullable contact/summary/entry fields and unchanged limits (experience 30, education 10, links 5) still apply.
- [ ] T012 [P] Write the new cases in `API/src/modules/cv/schemas/draft-edit.schema.spec.ts`: category names unique case-insensitively; skills unique case-insensitively across the whole CV; an empty category (no skills) is rejected on write; optional `targetRole` is trimmed, 1 to 200 characters, and absent means unchanged; a body with `schemaVersion: 1` or a `skills` key is rejected; field-error paths are dotted (`targetRole`, `draft.skillCategories.0.name`, `draft.skillCategories.1.skills.3`, `draft.skillCategories`).
- [ ] T013 [P] [AI] Write the grouped-output cases in `API/src/modules/ai/schemas/llm-cv-output.schema.spec.ts` and `API/src/modules/cv/generation/draft-mapper.spec.ts`: `skillCategories` entries are `{ category, skills[] }` with `category` one of the predefined names or `Skills`; an unknown category name is a schema failure; the mapper assigns unique ids, drops empty categories, removes case-insensitive duplicate skills (first wins), keeps order and enforces the 12/60 caps, and produces `schemaVersion` 2; `hasMeaningfulContent` in `API/src/modules/cv/generation/draft-validation.spec.ts` counts skills across categories.
- [ ] T014 [P] [AI] Write the SKILLS cases in `API/src/modules/cv/clarification/answer-patch.spec.ts`, `API/src/modules/ai/schemas/answer-patch.schema.spec.ts` and `API/src/modules/ai/prompts/answer-patch.prompt.spec.ts`: the patch is strict `{ additions: [{ category, skills[] }] }`; applying appends to the category with the same name (case-insensitive) or creates that category at the end when it is a predefined name or `Skills`; an unknown new category is `unknown_category`; duplicates are ignored; nothing is removed or renamed; an empty effective patch is rejected; the whole result must pass the draft schema (caps); the scope content sent to the model lists categories with their skills and keeps the answer in a delimited data block.
- [ ] T015 [P] Write the API contract cases (extend the existing files): `API/test/cv-edit.e2e-spec.ts` (a save with a changed `targetRole` updates `Cv.targetRole` and increments `revision` in one write; a stale revision changes nothing; blank or over 200 characters is `400` with a `targetRole` field error; a v1 body is `400`; absent `targetRole` leaves it unchanged), `API/test/cv-result.e2e-spec.ts` (result carries `targetRole` and a v2 draft), `API/test/cv-list.e2e-spec.ts` (an edited role appears on the card), `API/test/cv-editor-ownership.e2e-spec.ts` and `API/test/logging-editor.e2e-spec.ts` (a foreign CV's role/skills cannot be edited or detected; logs never contain role or skills text), `API/test/generation-lifecycle.e2e-spec.ts` and `API/test/generation-failures.e2e-spec.ts` (a grouped draft is persisted; malformed output persists nothing; `PENDING` to `PROCESSING` to `COMPLETED`/`FAILED`, retry and the startup sweep still work with the CHECK in place), `API/test/question-apply.e2e-spec.ts` (a SKILLS question applies as category additions, atomically with `APPLIED`, never removing skills).

### Implementation

- [ ] T016 [SCHEMA] Create the migration `API/prisma/migrations/20261005210000_draft_skill_categories/migration.sql` (the timestamp must sort after `20261005190000_cv_editor_my_cvs`) following `data-model.md`: (1) a `DO` block that raises an exception, before any change, when any non-null `"Cv".draft` is not a JSON object, has a `schemaVersion` other than 1 or 2, or has a version 1 `skills` that is not an array; (2) an `UPDATE "Cv"` limited to `draft ->> 'schemaVersion' = '1'` that removes `skills`, sets `skillCategories` to one category `{ "id": "skills-default", "name": "Skills", "skills": [...] }` with case-insensitive duplicates removed (first wins, order kept) or `[]` when the list is empty, and sets `schemaVersion` to 2, without touching `revision` or `updatedAt`; (3) `ALTER TABLE "Cv" DROP CONSTRAINT IF EXISTS "Cv_draft_schema_version_check"` then `ADD CONSTRAINT "Cv_draft_schema_version_check" CHECK (draft IS NULL OR (jsonb_typeof(draft) = 'object' AND COALESCE(draft ->> 'schemaVersion', '') = '2'))` so the file is re-executable. Do not edit `API/prisma/schema.prisma` (no model change); confirm `prisma migrate dev` reports no drift. T010 turns green.
- [ ] T017 [RISK] Rewrite `API/src/modules/cv/generation/draft.schema.ts` to v2: `schemaVersion: z.literal(2)`, remove `skills`, add `skillCategories: z.array(skillCategorySchema).max(12)` with `skillCategorySchema = { id: z.string().min(1), name: text(60), skills: z.array(text(60)) }` and a total of at most 60 skills (refine), exporting the `SkillCategory` type; keep every other cap as it is. Every importer must compile (`pnpm --filter api exec tsc --noEmit`). T011 turns green.
- [ ] T018 Update `API/src/modules/cv/schemas/draft-edit.schema.ts`: add optional `targetRole` (reuse the existing target-role rule from `API/src/modules/cv/schemas/cv.schemas.ts`: trimmed, 1 to 200 characters), the write-path checks for unique category names (case-insensitive), unique skills across the CV and no empty category, with dotted issue paths as in T012. T012 turns green.
- [ ] T019 [AI] Update `API/src/modules/ai/schemas/llm-cv-output.schema.ts` (`skillCategories: z.array(z.object({ category: z.enum([...SKILL_CATEGORY_NAMES, FALLBACK_SKILL_CATEGORY]), skills: z.array(z.string()) }))`), `API/src/modules/ai/prompts/cv-draft.prompt.ts` (bump `PROMPT_VERSION` to 3; list the categories; state that grouping only places skills the source mentions, never adds a skill to fill a category, and puts anything unplaceable under `Skills`; keep the source as delimited data), `API/src/modules/cv/generation/draft-mapper.ts` (ids, dedupe, caps, `schemaVersion` 2) and `API/src/modules/cv/generation/draft-validation.ts` (`hasMeaningfulContent`). T013 turns green. Do not add any mechanical skill-grounding check (locked decision 4).
- [ ] T020 [AI] Update `API/src/modules/ai/schemas/answer-patch.schema.ts` (`skillsPatchSchema = z.strictObject({ additions: z.array(z.strictObject({ category: z.string(), skills: z.array(z.string()) })) })`), `API/src/modules/ai/prompts/answer-patch.prompt.ts` (SKILLS scope content = categories with skills), `API/src/modules/cv/clarification/answer-patch.ts` (`applySkills` per D-8 of `research.md`) and `API/src/modules/cv/services/clarification.service.ts` (`scopeOf` for SKILLS). T014 turns green.
- [ ] T021 Update `API/src/modules/cv/services/cv-editor.service.ts` (the same conditional `UPDATE` sets `draft`, `targetRole` when provided, and increments `revision`), `API/src/modules/cv/services/cv.service.ts` (the result DTO adds `targetRole`) and, if needed, `API/src/modules/cv/cv.controller.ts` (the body schema from T018). T015 turns green. Keep the controller thin.
- [ ] T022 [P] Update the web API layer and form mapping to v2: `WEB/src/lib/api/cvs.ts` (draft v2 Zod schema with `skillCategories`, result gains `targetRole`, save body gains optional `targetRole`) and `WEB/src/lib/cv/draft-form.ts` (form shape with `skillCategories` and the role; keep ids; blank-to-null rules unchanged), with the existing tests updated first: `WEB/src/lib/cv/draft-form.test.ts`, `WEB/src/lib/cv/autosave.test.ts`, `WEB/src/lib/cv/question-form.test.ts`, `WEB/src/lib/cv/apply-flow.test.ts` (all fixtures to v2).
- [ ] T023 Minimal web adaptation so the app works end to end on v2 until US1/US2 replace it: make `WEB/src/app/cvs/[id]/editor-sections/skills-section.tsx` edit categories simply (one text-list field per category, no combobox yet), render grouped skills in `WEB/src/app/cvs/[id]/cv-document.tsx`, and fix every other compile error (`WEB/src/app/cvs/[id]/editor-workspace.tsx`, `WEB/src/app/cvs/[id]/generation-progress.tsx` if it reads skills). Mark these edits as temporary in a comment that names the replacing task (T055).
- [ ] T024 [P] [AI] Update `API/test/smoke/anthropic.smoke.ts` and the Anthropic adapter specs (`API/src/modules/ai/services/anthropic-cv-generator.spec.ts`, `API/src/modules/ai/services/anthropic-answer-applier.spec.ts`) to the v2 fixtures and the grouped output. The smoke test is extended but not run here.

### Verification

- [ ] T025 Gates: `pnpm --filter api exec tsc --noEmit`, `pnpm --filter api lint` (0 warnings), `pnpm --filter api test`, `pnpm --filter api test:e2e` (key unset), `pnpm --filter web exec tsc --noEmit`, `pnpm --filter web lint`, `pnpm --filter web test`, `pnpm --filter web build`. Fix what fails.
- [ ] T026 [SCHEMA] Migration verification on scratch PostgreSQL databases exactly as `quickstart.md` section 2 (clean database; a database at the `003` migration holding v1 drafts with skills, empty skills, a v2 draft and a `NULL` draft; second `migrate deploy`; a malformed row; the CHECK cases). Record the results and the row-level before/after in `specs/005-structured-cv-editor/checklists/acceptance.md` (create it with the format of `specs/003-cv-editor-my-cvs/checklists/acceptance.md`).
- [ ] T027 [SCHEMA] Replay the generation lifecycle by SQL against the migrated schema as in `quickstart.md` section 2 step 5 (`PENDING` with `NULL` draft, `PROCESSING`, `COMPLETED` with a v2 draft, edit with a revision bump, `FAILED`, retry to `PENDING`, `PROCESSING`, sweep to `FAILED/INTERRUPTED`) and confirm no statement is rejected; record it in the acceptance checklist. Then run the real lifecycle e2e (`generation-lifecycle`, `generation-failures`, `generation-startup`, `cv-retry` if present) on the migrated schema.
- [ ] T028 Cleanup grep gate: no `skills:`/`.skills` of the flat shape and no `schemaVersion: 1` or `literal(1)` remain in `API/src`, `API/test`, `WEB/src` (generated Prisma excluded), and no code converts between draft shapes at runtime. Commit this phase as `feat(api): categorised skills, draft v2 migration and editable target role`.

**Checkpoint**: v2 everywhere, migration and CHECK verified, the old editor works; the next phases are client-only.

---

## Phase 3: User Story 1 - Edit every part of my CV in one structured screen (Priority: P1) (iteration 1)

**Goal**: sticky editor navigation, completeness card, always-expanded section cards (personal details with links and target role, summary, experience, education) and the sticky preview column, as in frames 05.1 and 05.6.

**Independent Test**: open a completed CV; edit one field in each section, add and remove an experience entry, a highlight, an education entry and a link, change the target role; reload; everything persists and the list shows the new role; the layout matches 05.1/05.6 at 1440 px.

### Tests first

- [ ] T029 [P] [US1] `WEB/src/lib/cv/completeness.test.ts`: the appendix table verbatim (full name 15, email 10 (not blank and valid), phone 10, location 5, LinkedIn 5, summary 15, experience 25 (at least one entry with a title, a company and a start date), education 5 (at least one entry with an institution), skills 10 (at least 5 skills in total)); 100% and 0%; the design example (phone and LinkedIn missing gives 85% and "2 left" with gains `+10%` and `+5%`); `missing` order and labels; the score follows edits.
- [ ] T030 [P] [US1] `WEB/src/lib/cv/links.test.ts`: `splitLinks(links)` returns `{ linkedin, portfolio, extra }` (first host `linkedin.com` or a subdomain is LinkedIn, the first other is Portfolio, the rest extra); `mergeLinks(view)` returns LinkedIn, Portfolio, extras in that order, blanks dropped, at most 5; round trip keeps every non-blank link; unknown hosts are never lost.
- [ ] T031 [P] [US1] Extend `WEB/src/lib/cv/draft-form.test.ts`: the target role maps to and from the form (trimmed, never null); end-date mode (`Present` case-insensitive vs text) and the education "currently studying" derivation (end year in the future or `Present`); adding an experience or education entry creates a unique client id with empty fields; removing entries and highlights; an entry that does not satisfy the schema blocks the save and reports why instead of "Saved".

### Implementation

- [ ] T032 [P] [US1] [FIGMA] Read frames 05.1 (`41:21756`) and 05.6 (`41:23864`) with `get_design_context` per node group (nav `41:21757`, completeness `41:27040`, assistant `41:21794`, sections `41:21837`, preview `41:22099`; the whole frame is too large for one call) plus screenshots; note tokens, sizes and states in the header comments of the new components only where they are not obvious (no separate design document). Reuse existing tokens in `WEB/src/app/globals.css`; add a token only for a value that has no match.
- [ ] T033 [P] [US1] Implement `WEB/src/lib/cv/completeness.ts` (`computeCompleteness(values)` pure, over the form values) until T029 passes.
- [ ] T034 [P] [US1] Implement `WEB/src/lib/cv/links.ts` until T030 passes.
- [ ] T035 [US1] [RISK] Extend `WEB/src/lib/cv/draft-form.ts` (role, end-date mode, education flag, new-entry factories) until T031 passes; `WEB/src/lib/cv/autosave.ts` sends `targetRole` in the save body and treats the schema-blocking state as `unsaved`, not `saved`.
- [ ] T036 [US1] [RISK] Layout split (read the Next 16 layouts guide first): `WEB/src/app/cvs/layout.tsx` keeps authentication and `QueryProvider` but no longer renders `AppHeader`; render `AppHeader` in `WEB/src/app/cvs/page.tsx` and `WEB/src/app/cvs/new/page.tsx`, and in `WEB/src/app/cvs/[id]/page.tsx` for the generation view, the not-found and error states (`generation-view.tsx`, `cv-not-found.tsx`, `error.tsx`); the editor renders its own navigation (T037). The `/cvs` list, create flow and generation views must look unchanged (re-run `s7_list`/`s14_create` style browser checks).
- [ ] T037 [US1] Create `WEB/src/app/cvs/[id]/editor-nav.tsx` (sticky, 80 px desktop): product mark, divider, `← My CVs` breadcrumb link, CV title (target role) and owner line, the save indicator slot (keep the existing `save-indicator.tsx` here; T066 reworks it), disabled **Download PDF**, and the more-options button opening a menu with exactly **Back to My CVs** and **Delete CV**. Adapt `WEB/src/app/cvs/delete-cv-dialog.tsx` so the editor can reuse it (it needs only the CV id and a label; after a successful delete navigate to `/cvs`); the menu is keyboard operable and closes on Escape and outside click like `WEB/src/components/account-menu.tsx`.
- [ ] T038 [P] [US1] Create `WEB/src/app/cvs/[id]/completeness-card.tsx` (percentage, progress track, "Needs details · N left", missing chips with `+N%`), using `completeness.ts`; announce changes politely without chatter (`aria-live="polite"`, update only on settled values).
- [ ] T039 [P] [US1] Create `WEB/src/app/cvs/[id]/sections/section-card.tsx` (heading row, optional count line, body) replacing `editor-sections/section-card.tsx`, and `sections/personal-details.tsx` (target role, full name, email + phone row, location, LinkedIn, Portfolio, "+ Add link" rows with remove, using `links.ts`; field errors from the form; labels as in the design; remove is immediate).
- [ ] T040 [P] [US1] Create `WEB/src/app/cvs/[id]/sections/summary.tsx` (textarea, helper text "Briefly describe your experience, strongest skills and the value you bring. Keep it focused on the role you want.", **no Improve with AI**).
- [ ] T041 [P] [US1] Create `WEB/src/app/cvs/[id]/sections/experience.tsx` (heading with count and the "Highlights appear in the order below" line; per entry: "Company · dates" title, title, company, start date, end date with a **Present** select option, highlights with numbering, remove per highlight, **+ Add bullet**, a labelled **Remove experience** action replacing the unlabelled icon, **+ Add professional experience**, the supporting line "Add a measurable performance result only if you can confirm it. AI will not invent a metric."; all removals immediate).
- [ ] T042 [P] [US1] Create `WEB/src/app/cvs/[id]/sections/education.tsx` (institution, degree/program, start year, end year labelled "(expected)" when ongoing, "Currently studying · Expected completion in YYYY", **Remove**, **+ Add education**; removal immediate).
- [ ] T043 [US1] Rewrite `WEB/src/app/cvs/[id]/editor-workspace.tsx` into the two-column layout (editing column about 584 px, sticky preview column, completeness card above the assistant card, sections in the design's order, closing guidance line "You're in control. Review wording, dates and claims before downloading."); keep skills on the temporary adaptation from T023 until US2, and the preview as it is until US5. Split the file by responsibility if it passes about 250 lines.
- [ ] T044 [US1] Delete the replaced accordion code: `WEB/src/app/cvs/[id]/editor-sections/contact-section.tsx`, `summary-section.tsx`, `experience-section.tsx`, `education-section.tsx`, `section-card.tsx`, `list-text-field.tsx` (keep `skills-section.tsx` until T055). Ensure no import remains.
- [ ] T045 [US1] Verification: gates for `WEB`; a Playwright run (scripts stay in the scratchpad, not committed) at 1440 px against frames 05.1 and 05.6: positions and sizes of nav, completeness card, assistant card, each section card, preview column and the closing line within the 2 px border tolerance already accepted for `003`; all editing, add/remove and persistence-after-reload checks; target role shown in the list; the more menu offers exactly its two items and Delete CV asks for confirmation; `localStorage`/`sessionStorage` empty of CV content. Record in the acceptance checklist and commit as `feat(web): structured editor layout and sections`.

**Checkpoint**: the editor is structured at desktop width; skills and preview still use the temporary versions.

---

## Phase 4: User Story 2 - Organise skills by category (Priority: P1) (iteration 2)

**Goal**: the Skills & Technical Competencies card of frame 05.7.

**Independent Test**: add two categories with skills (typing, Enter, suggestions), remove a skill, reorder categories with Move up/Move down, reload; grouping and order persist in the editor and the preview.

### Tests first

- [ ] T046 [P] [US2] `WEB/src/lib/cv/skills-form.test.ts`: `addSkill` (trim, blank refused, duplicate refused case-insensitively across all categories, over 60 characters refused, 60-skill total refused, returns a typed refusal reason for each), `removeSkill`, `addCategory` (12 maximum, unique names case-insensitive, custom names trimmed 1 to 60), `renameCategory`, `removeCategory`, `moveCategory(index, delta)` (swaps neighbours, first cannot move up, last cannot move down), `dropEmptyCategories` (empty ones are not saved), `suggestionsToShow(categoryName, allSkills)` (only the first suggestions not yet in the CV, hidden once added), `needsMoreSkills(total)` for the "at least 5" hint (never blocks saving).
- [ ] T047 [P] [US2] `WEB/src/lib/cv/category-filter.test.ts`: `filterCategories(query, names)` (case-insensitive substring, order kept), the "custom" option appears only when the query is non-blank and not an exact match, keyboard model `nextActiveIndex(current, key, count)` for ArrowDown/ArrowUp (wrap), Home, End; Enter selects the active option; Escape closes without changing the value.

### Implementation

- [ ] T048 [P] [US2] [FIGMA] Read frame 05.7 (`41:24274`) and the skills block of 05.1 (`41:21994`) and 05.8 (`41:24695`) with `get_design_context`/screenshots; note states: collapsed/expanded card, the combobox closed and open, input + Add (disabled when blank), hint line, suggestion chips (the design's `+` circle), "No items added" dashed state, grouped chips with counts, "+ Add skills".
- [ ] T049 [P] [US2] Implement `WEB/src/lib/cv/skills-form.ts` until T046 passes (pure functions over the form's `skillCategories`, no React).
- [ ] T050 [P] [US2] Implement `WEB/src/lib/cv/category-filter.ts` until T047 passes.
- [ ] T051 [US2] Create `WEB/src/components/ui/combobox.tsx`: hand-written ARIA 1.2 combobox (`role="combobox"` input, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `role="listbox"`/`role="option"`), search placeholder "Search categories…", chevron, highlighted active option, a "Use “…” as a custom category" option, a list with a bounded height that scrolls and stays inside the viewport at 320 px, closes on Escape/outside click/selection, visible focus. It is generic (options in, value out) and imports nothing from the catalogue.
- [ ] T052 [P] [US2] Create `WEB/src/app/cvs/[id]/sections/skill-chip.tsx` (removable chip with an accessible "Remove <skill>" button) and `sections/skill-suggestions.tsx` (suggested chips with the `+`; tapping adds the skill to the category; hidden once added; a note that suggestions are only added when tapped).
- [ ] T053 [US2] Create `WEB/src/app/cvs/[id]/sections/skill-category-card.tsx`: header with **Category Name** combobox (predefined names from `skill-catalogue.ts`, custom allowed), **Move up**/**Move down** icon buttons (disabled at the ends, replacing the drag handle) and **Remove category**; the "Type a skill and press Add" input with the **Add** button (Enter also adds) and the refusal messages from `skills-form.ts` (blank, duplicate, too long, limit) shown as text, never colour alone; the hint "It is suggested to add at least 5 skills"; suggestions; the dashed "No items added" state.
- [ ] T054 [US2] Create `WEB/src/app/cvs/[id]/sections/skills.tsx` (card with heading, "N skills · By category", helper "Organise skills by category (e.g. Technical Skills, Leadership, Soft Skills) for easy reading.", the category cards, the "Added to CV" summary with grouped chips and counts, **+ Add skills**), wired to the form with `useFieldArray` for `skillCategories`; empty categories are dropped before saving.
- [ ] T055 [US2] Replace the temporary skills editor: use `sections/skills.tsx` in `WEB/src/app/cvs/[id]/editor-workspace.tsx`, delete `WEB/src/app/cvs/[id]/editor-sections/skills-section.tsx` and the now-empty `editor-sections/` folder, and make `WEB/src/app/cvs/[id]/cv-document.tsx` render skills grouped by category in the order saved (category name as a run-in label, skills separated by the design's dot), replacing the temporary rendering from T023.
- [ ] T056 [US2] Verification: gates for `WEB`; Playwright at 1440 px and 320 px against 05.7: open/search/pick/custom category, add by button and Enter, the three refusals, tap a suggestion, remove a chip, Move up/Move down at the edges, **+ Add skills**, reload keeps order, the preview groups skills, the open list does not overflow at 320 px, keyboard-only operation of the combobox. Record in the acceptance checklist and commit as `feat(web): skills by category`.

**Checkpoint**: skills are categorised end to end in the editor, the preview and storage.

---

## Phase 5: User Story 3 - Work through AI clarification questions in the structured editor (Priority: P1) (iteration 3)

**Goal**: the AI Assistant card and question cards of frames 05.1, 05.2 and 05.3; behaviour unchanged from `003`.

**Independent Test**: answer a question (Answered, "Answer saved separately. Your CV stays unchanged until you apply it."), apply it (Applied, the right part changes), dismiss another, see the failure states, reload.

- [ ] T057 [P] [US3] [FIGMA] Read frames 05.2 (`41:22159`) and 05.3 (`41:22585`) (assistant `41:22185`..., question cards, actions) with `get_design_context`/screenshots; list every state and string: unresolved count, kind badge (Factual), location "Experience / Kilona", status chips Unanswered/Answered/Applied, answer saved indicator, helper texts.
- [ ] T058 [P] [US3] Tests first: `WEB/src/lib/cv/question-form.test.ts` and `WEB/src/lib/cv/apply-flow.test.ts` gain cases for the presentation model used by the new card: the unresolved count (UNANSWERED + ANSWERED only), the helper text per state, Apply to CV enabled only when ANSWERED and no save is pending, the failure message per apply error code (`REVISION_CONFLICT`, `TARGET_NOT_APPLICABLE`, `ANSWER_INVALID_FOR_FIELD`, `APPLY_OUTPUT_INVALID`, `AI_UNAVAILABLE`) and which actions it offers.
- [ ] T059 [US3] Implement the presentation helpers in `WEB/src/lib/cv/question-form.ts` and `WEB/src/lib/cv/apply-flow.ts` until T058 passes (no behaviour change to the existing transitions).
- [ ] T060 [US3] Restyle `WEB/src/app/cvs/[id]/clarification-panel.tsx` into the AI Assistant card (symbol, title, unresolved count, supporting line "Clarify missing facts and improve your CV", helper "Answer autosaves separately. AI never fills in missing facts.") and `WEB/src/app/cvs/[id]/question-card.tsx` into the design's question card (kind badge, location, status, question, answer field with "Your confirmed technologies…"-style placeholder, answer saved indicator, **Apply to CV** and **Dismiss**), adding the dismissed state, the failed-apply states with their recovery actions (retry, edit the answer, dismiss) and the "all resolved" state of the card when nothing is unresolved. Split `question-card.tsx` (166 lines today) by state if it grows past about 220 lines.
- [ ] T061 [US3] Verification: gates for `WEB`; Playwright at 1440 px and 390 px against 05.2 and 05.3 using seeded questions in every state (including a field question applied without any AI request and an AI-applied SKILLS question using the e2e fake path, not a real key); reload keeps states; completeness and preview reflect an applied answer. Record and commit as `feat(web): AI assistant card states`.

---

## Phase 6: User Story 4 - Trust the save state, even when saving fails (Priority: P1) (iteration 4)

**Goal**: the nav save indicator, failure notice with Retry, conflict notice and "Review both versions" of frames 05.4 and 05.5.

**Independent Test**: go offline and edit (Couldn't save · Retry, local text kept, retry works); edit in two tabs (conflict notice, review, **Keep my version** and **Use saved version**).

### Tests first

- [ ] T062 [P] [US4] `WEB/src/lib/cv/conflict-review.test.ts`: `diffSections(local, saved)` over the mapped form values returns, per section (target role, personal details, summary, experience, skills, education), whether it differs and a short summary of the difference; identical documents report none; order-only skill/category changes count as a difference in skills; the result never contains a merged document.
- [ ] T063 [P] [US4] Extend `WEB/src/lib/cv/autosave.test.ts`: states `saved`/`saving`/`error`/`conflict` and the "blocked by validation" state map to the labels All changes saved / Saving / Couldn't save · Retry / newer saved version / "Fix the highlighted fields to save"; Retry connection re-sends the same body; **Keep my version** saves the local document on the latest revision (existing `keepMine`), **Use saved version** (existing `loadLatest`) discards local edits, and neither runs automatically; no autosave while in conflict; local text is retained until one of the two actions completes.

### Implementation

- [ ] T064 [P] [US4] [FIGMA] Read frames 05.4 (`41:23028`) and 05.5 (`41:23434`) (status text `41:21771`-like instance, the failure notice and the "A newer saved version needs review" block) with `get_design_context`/screenshots; note colours, copy and actions. The "review both versions" view itself is not drawn: build it from the notice's labels ("Current local · not saved", "Saved account version") with the existing card/field styles, and list it as a design deviation.
- [ ] T065 [P] [US4] Implement `WEB/src/lib/cv/conflict-review.ts` until T062 passes; adjust `WEB/src/lib/cv/autosave.ts` only as T063 requires.
- [ ] T066 [US4] Rework `WEB/src/app/cvs/[id]/save-indicator.tsx` for the nav (check mark + "All changes saved", spinner + "Saving…", warning icon + "Couldn't save · Retry" as a button), and `WEB/src/app/cvs/[id]/save-problems.tsx` into the top-of-editor notices: the failure notice ("Your latest edits couldn't be saved", Retry connection, the preview caption "Last saved version") and the conflict notice ("A newer saved version needs review", "Nothing is overwritten automatically", **Review both versions**). Move focus to the notice (`role="alert"`) on appearance.
- [ ] T067 [US4] Create `WEB/src/app/cvs/[id]/conflict-review.tsx`: a dialog (native `<dialog>`) showing "Current local · not saved" and "Saved account version" side by side on desktop and stacked on phones, differing sections highlighted by `diffSections`, buttons **Keep my version** and **Use saved version**, Escape closes without choosing, focus returns to the opener; wired to the existing conflict actions in `WEB/src/app/cvs/[id]/cv-editor.tsx`/`editor-workspace.tsx`.
- [ ] T068 [US4] Verification: gates for `WEB`; Playwright against 05.4 and 05.5 at 1440 px: Saving visible during a delayed save, offline edit shows Couldn't save · Retry and keeps the text, Retry succeeds after reconnect, a two-tab conflict shows the notice, the review dialog, and both choices behave as specified with no silent loss; the preview says "Last saved version" while unsaved. Record and commit as `feat(web): save state, failure notice and conflict review`.

---

## Phase 7: User Story 5 - Check the document at full size (Priority: P2) (iteration 5)

**Goal**: the preview toolbar, status line and full-screen view of frames 05.1 (preview column) and 05.10.

**Independent Test**: zoom in and out to the limits, Fit page, expand, close with the button and Esc; edits unchanged and focus returns.

- [ ] T069 [P] [US5] `WEB/src/lib/cv/preview-zoom.test.ts`: zoom steps of 10 points between 50 and 150 (clamped), `zoomIn`/`zoomOut` disabled at the ends, `fitScale(containerWidth, sheetWidth)` never above 100, the percentage label, `estimatePages(contentHeight, a4Height)` is `ceil` with a minimum of 1, and the status line text ("Up to date · Ready to download" vs "Last saved version · Current edits remain in the editor").
- [ ] T070 [P] [US5] [FIGMA] Read frame 05.10 (`41:28492`: navigation `41:28674`, centred document `41:28695`, viewing controls `41:28739`) and the preview column in 05.1 (`41:22099`: toolbar `41:22100`, stage `41:22110`) with `get_design_context`/screenshots; note the scrim and blur, "Esc" hint, **Close preview**, disabled **Download PDF**, "Page 1 of 1", zoom control, **Fit page**.
- [ ] T071 [P] [US5] Implement `WEB/src/lib/cv/preview-zoom.ts` until T069 passes.
- [ ] T072 [US5] Create `WEB/src/app/cvs/[id]/preview-panel.tsx` (toolbar with "Preview · Classic · A4", "Page N of M", zoom −/+ with the percentage and the expand button; the status line; the sheet scaled with a CSS transform; whole-A4 growth with faint page-break guides when the content is taller; the footers "A clean, selectable-text PDF. No watermarks." and "Preview stays in view while you edit.") and use it in `editor-workspace.tsx`; the document component stays `cv-document.tsx`.
- [ ] T073 [US5] Create `WEB/src/app/cvs/[id]/fullscreen-preview.tsx` on a native `<dialog>` (`showModal`, `::backdrop` scrim, no animation under `prefers-reduced-motion`): top bar with product mark, "Fullscreen preview" and the CV title, "Esc", **Close preview**, disabled **Download PDF**; centred sheet; bottom controls (Page N of M, zoom, **Fit page**) with its own zoom state; focus returns to the expand button.
- [ ] T074 [US5] Verification: gates for `WEB`; Playwright against 05.10 at 1440 px and 390 px: zoom limits, Fit page, expand, Esc and Close, focus return, edits unaffected, a long CV shows more than one page guide and "Page 1 of 2". Record and commit as `feat(web): preview controls and full-screen preview`.

---

## Phase 8: User Story 6 - Edit comfortably on a phone (Priority: P2) (iteration 6)

**Goal**: frames 05.8 (390) and 05.9 (320): one column, condensed nav, status row, Edit/Preview switch, sticky Preview CV action.

**Independent Test**: at 390 and 320 px edit all sections, switch to Preview and back, no horizontal scroll, no lost text.

- [ ] T075 [P] [US6] [FIGMA] Read frames 05.8 (`41:24695`: nav `41:24696`, workspace `41:24718`, sticky actions `41:25046`) and 05.9 (`41:25054`: nav `41:25055`, sticky actions `41:25405`) with `get_design_context`/screenshots; note why the nav heights differ (106 px at 390, 125 px at 320) and the title truncation; list the status row, the segmented Edit/Preview control and the sticky bar ("Preview CV", "Preview opens on its own tab. Your edits stay here.").
- [ ] T076 [P] [US6] `WEB/src/lib/cv/mobile-view.test.ts`: the view state `edit | preview` toggles, the status row text ("All changes saved · 85% ready · 2 missing") is built from the save state and `computeCompleteness`, and the sticky action label per view.
- [ ] T077 [US6] Implement `WEB/src/lib/cv/mobile-view.ts` until T076 passes.
- [ ] T078 [US6] Make the editor navigation responsive in `WEB/src/app/cvs/[id]/editor-nav.tsx`: below the desktop breakpoint show the back arrow with "My CVs" and the title, a compact **PDF** button (still disabled) and the more menu, then the status row under it; truncate long titles; no horizontal overflow at 320 px.
- [ ] T079 [US6] Add the Edit / Preview segmented control and the single-column flow in `WEB/src/app/cvs/[id]/editor-workspace.tsx`: both views stay mounted and the inactive one is hidden (not unmounted) so form state, focus and scroll are preserved; the preview view shows the preview panel (no sticky column); **Preview CV** is a sticky bottom bar (safe-area padding) that switches to the preview and becomes **Edit CV** there.
- [ ] T080 [US6] Responsive pass over every section and card at 390 and 320 px (`sections/*.tsx`, `completeness-card.tsx`, the assistant card, the notices, the combobox list, the conflict review dialog stacked, the full-screen preview): no horizontal scroll, controls at least 44 px tall where the design shows them, the sticky bar never covers a focused field (scroll the focused element into view above it) or the last section's actions.
- [ ] T081 [US6] Verification: gates for `WEB`; Playwright at 390 and 320 px against 05.8 and 05.9: structure and spacing, every section editable, the combobox list fits, Edit/Preview keeps unsaved text and scroll position, the sticky bar behaviour with the keyboard open (viewport resize), no horizontal overflow anywhere (including with long unbroken strings). Record and commit as `feat(web): phone layout for the structured editor`.

---

## Phase 9: Polish and delivery

- [ ] T082 Full gates on the final tree: all API and web checks of `quickstart.md` section 1, plus a repeat of the migration verification (T026) and the lifecycle replay (T027) on the final schema; record fresh counts in the acceptance checklist.
- [ ] T083 Browser run of `quickstart.md` section 4 over every iteration at 1440, 390 and 320 px (all frames 05.1 to 05.10) and the generic checks (no CV content in `localStorage`/`sessionStorage`, a foreign CV id shows the same not-found page, the My CVs list and create flow unchanged); record the results.
- [ ] T084 [AI] Real-model smoke (manual, needs `ANTHROPIC_API_KEY`): extend `API/test/smoke/anthropic.smoke.ts` for grouped skills with known categories and a SKILLS apply, run `pnpm --filter api test:smoke`, record the result. If no key is available, record that explicitly (as for `003`); do not mark skill grounding as verified in either case.
- [ ] T085 Documentation: update `specs/003-cv-editor-my-cvs/contracts/cv-editor-api.md` with a pointer to `specs/005-structured-cv-editor/contracts/structured-editor-api.md` for the v2 draft, `targetRole` and the SKILLS apply; add to the README follow-ups (the note listed in `specs/002-cv-ai-generation/plan.md` "Project-level follow-ups") the 005 trade-offs: **skills are prompt-grounded, not mechanically verified**; the page count in the preview is estimated (real pagination belongs to PDF export); the migration is one-way and an editor tab open during the deploy must reload; removal of entries is immediate; conflicts are resolved by whole-version choice; the catalogue's four possible gaps.
- [ ] T086 Create or complete `specs/005-structured-cv-editor/checklists/acceptance.md` mapping every user-story acceptance scenario and SC-001..SC-007 to evidence (tests, browser runs, migration records), marking the real-model items as waiting on T084.
- [ ] T087 Scope review: `git diff --stat` shows no new external dependency (only the internal workspace package and its lockfile entries), no new table, no Prisma model change; no `any`/`@ts-ignore`/unsafe cast; no `OPEN`/`RESOLVED`; no flat `skills` anywhere; no runtime dual-format code; `Cv.revision` is still written only by `CvEditorService.updateDraft` and `ClarificationService.commitApply`; no log or error contains CV content. Fix what the review finds.
- [ ] T088 Update the PR description of `olehvitriachenko/ai-cv-builder#3` (summary per iteration, migration summary with the verification records, endpoints/contract changes, test results, Figma deviations, what remains) and tick every finished task in this file.

---

## Dependencies and execution order

- **Phase 1** (T001 to T008) first; T008 is a hard gate for Phase 2 (the AI schema and the web accessors import the catalogue).
- **Phase 2**: T009 first (fixtures), then the tests T010 to T015 in parallel, then implementation in this order: T016 (migration) and T017 (schema) before T018 to T021; T022 and T023 after T017; T024 anytime after T019/T020; T025 to T028 last. T009 must precede T016 because the CHECK rejects v1 seeds.
- **Phase 3 (US1)** needs Phase 2; T036 (layout split) precedes T037 and T043. US2, US3, US4, US5 need US1's layout (T043) and are independent of each other. US6 needs US2 to US5. Phase 9 needs everything.
- Within a phase: tests (fail first) → pure modules → components → verification.

### Parallel opportunities

- Phase 1: T002, T004, T005 together; then T006 and T007 together.
- Phase 2: T010 to T015 together after T009; T018, T019, T020 together after T017; T022 with API work after T017.
- US1: T029 to T031 together; T033 and T034 together; T038 to T042 together after T035 and T036.
- US2: T046, T047, T048 together; T049 and T050 together; T052 beside T051.
- US3 to US5 can be developed in parallel once US1 is merged; their verification tasks run in sequence on one dev server.

## Shared and risky files

| File | Why it is risky | Tasks |
|------|-----------------|-------|
| `API/src/modules/cv/generation/draft.schema.ts` | Imported by generation, edit, apply, result and every spec; the version bump breaks all fixtures at once | T009, T011, T017 |
| `API/test/helpers/seed.ts`, `llm-output.ts` | Every e2e file uses them; v1 seeds fail once the CHECK exists | T009 |
| `API/prisma/migrations/*_draft_skill_categories` | Irreversible data change plus a CHECK on a hot table; must stay re-executable and idempotent | T010, T016, T026, T027 |
| `API/src/modules/cv/services/cv-editor.service.ts` | The conflict-safe write path; `targetRole` must stay in the same `UPDATE` | T021 |
| `API/src/modules/cv/services/clarification.service.ts`, `clarification/answer-patch.ts` | Atomic apply with the revision compare-and-set | T020 |
| `WEB/src/lib/cv/draft-form.ts`, `autosave.ts` | Every editor section and the save state machine depend on them | T022, T035, T063, T065 |
| `WEB/src/app/cvs/layout.tsx` and page headers | Moving `AppHeader` touches the list, create and generation pages | T036 |
| `WEB/src/app/cvs/[id]/editor-workspace.tsx` | Rewritten in US1, edited in US2, US5, US6 | T043, T055, T072, T079 |
| `WEB/src/app/cvs/[id]/cv-document.tsx` | The preview; grouped skills, then zoom/pages | T023, T055, T072 |
| `WEB/src/app/globals.css` | Tokens shared by all pages | T032 |
| `pnpm-lock.yaml`, `API/package.json`, `WEB/package.json` | The workspace package link | T003 |

## Implementation strategy

- **MVP**: Phases 1 and 2 (data foundation, verified) plus US1. After that the product has the structured editor with categorised data underneath; US2 then makes categories editable (without it, skills show one editable list per category from T023).
- **Incremental delivery**: one phase = one commit group and one verified slice; the app builds and the suites pass after each phase. Never start a user-story phase before the previous phase's verification task is recorded.
- **Stop-and-report points**: T008 (catalogue wiring fails), T026/T027 (migration or CHECK problem), any task that needs a new external dependency or a change to the generation lifecycle.
