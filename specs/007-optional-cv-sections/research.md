# Research: Optional CV Sections

## R1 — Where the sections live in the stored draft

- **Decision**: five new top-level arrays on the existing draft — `languages`, `certifications`, `portfolio`, `hobbies`, `customSections` — each defaulting to an empty array; `schemaVersion` stays `2`.
- **Rationale**: a stored draft without them parses unchanged (SC-003), no data migration and no Prisma migration, the edit endpoint keeps taking the whole draft and the revision logic is untouched. The previous shape change (v1 → v2) needed a data migration because it replaced a field; this one only adds.
- **Alternatives**: a generic `sections: [{kind, entries}]` list (one pattern for the code, but loose typing and a harder to validate union); bumping to `schemaVersion: 3` (forces a migration and a coordinated deploy for no benefit).

## R2 — An empty section

- **Decision**: a section with no entries is not stored and not rendered; the editor remembers in the browser which sections the person added so the empty card stays until they fill or remove it. Custom sections are stored only with a title and content.
- **Rationale**: the same behaviour as an empty skill category today; the server never has to represent "added but empty" and a reload cannot show a hollow section in the document.
- **Alternatives**: persist an `enabled` flag per section (extra state and a way for the document to disagree with the editor).

## R3 — Section order in the document

- **Decision**: fixed order after Skills: Certifications, Languages, Portfolio, Hobbies, then custom sections in the order added.
- **Rationale**: spec assumption; no reordering UI to build or test.
- **Alternatives**: user-ordered sections (drag in the editor, an order field in the draft) — later, if asked.

## R4 — Validation of the new values

- **Decision**: limits and shapes live in the server draft schema; uniqueness (language names ignoring case, entry ids across all optional sections) and link validity in the edit-body schema, like skills and email today. The web form schema mirrors them for early messages. The link rule is "a web address with or without `https://`, no spaces, http(s) only", the same as the editor's existing `linkError` rule, now also enforced on the server for these fields.
- **Rationale**: the server stays the authority (constitution II) and the editor gives messages before saving.
- **Alternatives**: client-only validation (rejected: the server must not trust the client).

## R5 — Editor structure

- **Decision**: a new `components/sections/` folder with the **Add a section** card and one card per section kind, all built from the existing primitives (`SectionCard`, fields, `RemoveButton`, `DatePicker`, confirm dialog) and `useFieldArray` for the lists; offering rules (which options are still available, whether the card is shown) in a pure model file with tests.
- **Rationale**: matches the frontend rules (forms with React Hook Form and Zod, `useFieldArray` for dynamic sections) and keeps logic testable without a DOM.
- **Alternatives**: one config-driven generic section component (less code, but five different field sets make it a form builder — not warranted).

## R6 — Generation (US4) and clarification questions

- **Decision**: extend the structured output with ONE optional list of items (`optionalItems`, a `section` value plus plain strings), not five arrays: the real provider rejected the five-array schema with "The compiled grammar is too large" while each array alone was accepted, and the single list is accepted (probed against the real API); the prompt allows copying and tidying what the source states and forbids creating anything else; a deterministic check requires each language name, certification name, project name, hobby and custom title to be found (normalised) in the source, as for employers today; a value that fails fails the generation as it does now. A missing level is simply `null`. Clarification questions for these sections need new `QuestionSection` values and therefore a Prisma enum migration plus answer-patch targets; they are done only after the rest works, as a separate task, and the spec scenario that needs them (US4 scenario 2 and 5) stays open until then.
- **Rationale**: keeps the AI contract change reviewable and the first deliverable free of database changes (reliability over breadth).
- **Alternatives**: no AI support at all (then sources that list languages lose data silently); questions through the existing `SKILLS` section (misleading targets).

## R7 — Phone layout

- **Decision**: the options stack one per row below 640 px (design `112:4884`, the 288 px variant `112:4920` lists the custom option as a row too); section cards reuse the editor's phone spacing.
- **Rationale**: follows the design; no new breakpoints.
