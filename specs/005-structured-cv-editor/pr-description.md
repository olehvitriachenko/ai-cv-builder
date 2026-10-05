# Structured CV editor (feature 005)

Replaces the accordion editor of `003` with the structured editor from the completed Figma file, moves skills from one flat list to categories, and stores the target role with the draft.

## What changed, by iteration

- **Data foundation (Phase 2)**: the draft is `schemaVersion: 2` with `skillCategories` (no flat `skills`); the target role is saved in the same `PUT /api/cvs/:id/draft` request; generation and the clarification apply work on categories; the PDF (feature `004`) lists skills by category. One migration converts stored drafts and adds a CHECK; it is idempotent and has no model change.
- **1 Structured layout**: sticky navigation, completeness card, AI Assistant card and five always-open section cards with the live A4 preview beside them.
- **2 Skills by category**: category combobox over a shared catalogue (36 names, 216 suggestions), custom names, Add, tap-to-add suggestions, removable chips, pointer/touch and keyboard drag handles, confirmed category removal.
- **3 AI assistant**: the answer saves by itself, Apply to CV only for a saved answer, applying progress, the four apply failures with their own recovery.
- **4 Save state**: Saving, Couldn't save · Retry (offline and retrying forms), Conflict · Review versions, and the Review conflicting versions dialog (no preselection, whole-version choice, nothing merged).
- **5 Preview**: zoom (a percentage of an A4 sheet at 794 px, as drawn), page footer, full-screen preview.
- **6 Phone**: 112 px navigation, Edit and Preview, sticky Preview CV bar that hides with the keyboard, compact completeness card.

## Migration

`20261005210000_draft_skill_categories`: v1 drafts become v2 (`skills` become one category named `Skills`, empty skills become no category), v2 drafts are untouched, `revision` and `updatedAt` do not change, a second run changes nothing, a malformed draft fails the migration and leaves every row unchanged, and a CHECK rejects non-v2 drafts. One-way: an editor tab open during the deploy must reload.

## API contract

See `contracts/structured-editor-api.md`; `003`'s contract points to it. `GET /result` returns `targetRole` and a v2 draft; `PUT /draft` takes `targetRole` and a v2 draft (a v1 body is `400`); answering and applying a SKILLS question works on categories.

## Tests

- API: `tsc`, `lint` clean; 441 unit tests; 292 e2e tests on real PostgreSQL with no real AI request.
- Web: `tsc`, `lint`, `build` clean; 255 unit tests.
- Real-model smoke (`pnpm --filter api test:smoke`): 11 passed, including a skill-grouping case.
- Browser runs (Playwright scripts against the dev servers, throwaway accounts) at 1440, 390 and 320 px; evidence in `checklists/acceptance.md`.

## Deviations from the Figma file (on purpose)

- Desktop skills are one category editor plus an "Added to CV" summary; the frames also draw a block per category on phones. One model is built for every width, and the order and removal controls show on the category being edited.
- A custom-category option is offered beside matches, not only with no matches.
- The transient "Applied · Review" confirmation with the changed text is not built (the server does not return what changed); the collapsed Applied card has "Review in …".
- The read-only editor panel while generating, the feature-flagged "PDF Coming soon" state, the proposed 100-point scoring table and the 30% to 200% zoom bounds are not built (the specification's rules stay; the design marks them "approval required").
- The conflict and failure notices announce themselves but do not take focus, because they appear while the person is typing.
- The answer autosave delay (800 ms) is a default; the design says the delay needs approval.
- The original locked decision "every removal is immediate" was changed: a role that holds something and a category that holds skills ask first, as the completed design shows.

## Trade-offs and what remains

- **Skills are prompt-grounded, not mechanically verified.**
- The preview's page count is an estimate; real pagination belongs to the PDF export.
- Conflicts are resolved by choosing a whole version.
- The catalogue has four unnamed gaps in the owner's list.
- Not run: a real on-screen keyboard (phone or iOS Simulator).
