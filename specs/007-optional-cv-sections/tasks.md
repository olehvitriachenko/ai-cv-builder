# Tasks: Optional CV Sections

**Input**: `specs/007-optional-cv-sections/` (spec, plan, research, data model, contract, quickstart)

Format: `- [x] ID [US] description (file)`. Tests were written with each step; the API steps first, then the web.

## Phase 1 — API shape (US1–US3)

- [x] T001 [US1] Draft schema: `languages`, `certifications`, `portfolio`, `hobbies`, `customSections` with the limits of the data model, defaulting to empty (`apps/api/src/modules/cv/generation/draft.schema.ts`, `draft.schema.spec.ts`)
- [x] T002 [US1] Edit body rules: ids unique across all entries, language names and hobbies unique ignoring case, certification and project links are web addresses (`schemas/draft-edit.schema.ts`, `web-address.ts`, spec)
- [x] T003 [US1] Typed test drafts get the empty arrays (specs and e2e helpers)
- [x] T004 [US1] PDF: the sections after Skills in the fixed order, selectable text, clickable links, line breaks of a custom section (`pdf/export/cv-pdf.document.tsx`, renderer spec)
- [x] T005 [US1] e2e through the edit endpoint: save and read back, a stored draft without the sections, an older client's body, rejected values with dotted paths, another user's CV (`test/cv-edit.e2e-spec.ts`)

## Phase 2 — Web shape

- [x] T006 Web draft schema mirror with empty defaults (`entities/cv/schemas.ts`)
- [x] T007 Form model: form entries, round trip, a blank card is not saved, validation and limits mirroring the server (`model/draft-form.ts`, test)
- [x] T008 Offering rules for the Add a section card and the removal question (`model/optional-sections.ts`, test)
- [x] T009 Text of the sections shared by the preview (`lib/optional-section-text.ts`, test) and the preview document (`preview/cv-document.tsx`)
- [x] T010 Conflict review lists the sections (`model/conflict-review.ts`, test)

## Phase 3 — Editor (US1–US3)

- [x] T011 [US1] Add a section card (design, phone, narrow) (`components/sections/add-section-card.tsx`)
- [x] T012 [US1] Languages card and the orchestrator: add, focus, announce, remove with confirm only when filled (`languages-section.tsx`, `optional-sections.tsx`)
- [x] T013 [US2] Certifications (month picker), Portfolio, Hobbies cards
- [x] T014 [US3] Custom section card, up to three
- [x] T015 Stable ids for custom sections so server and browser markup match (hydration)

## Phase 4 — Generation (US4)

- [x] T016 [US4] Structured output: optional arrays with plain strings (no new union parameters; the 16-union test still passes) (`llm-cv-output.schema.ts`, spec)
- [x] T017 [US4] Mapper: ids, `""` and `Not stated` to null, blank entries dropped, repeats dropped (`draft-mapper.ts`, spec)
- [x] T018 [US4] Grounding: names and links must be in the source (`draft-validation.ts`, spec)
- [x] T019 [US4] Prompt v5: allowed and forbidden transformations for the sections (`cv-draft.prompt.ts`, spec)
- [x] T020 [US4] e2e with the mocked provider: stored with ids, retry feedback carries only rule ids and paths, repeated invention fails the generation (`generation-lifecycle.e2e-spec.ts`)

## Phase 5 — Verification

- [x] T021 Browser (1440, 390, 320 px): add each section, fill, preview order, invalid link message, reload keeps, remove with and without a question, PDF text, no horizontal scrolling, no console errors
- [x] T022 All gates: typecheck, lint, unit, e2e (one existing PDF test fails on 006 independently of this feature, see the report)
- [ ] T023 Real-model check of US4 with a key (manual, spends tokens)
- [ ] T024 Clarification questions for these sections (follow-up, needs a database change)

## Verification record (2026-10-06)

| Check | Result |
|-------|--------|
| API unit | 475 pass, 1 existing failure (`renders the maximum draft`, header overflow since the clickable-links commit on 006) |
| API e2e | 300 pass |
| Web unit | 336 pass |
| Browser | Languages, Certifications, Portfolio, Hobbies, Custom flows pass; PDF text holds all sections in order; no horizontal scroll at 390 and 320 px; no hydration error after the id fix |
