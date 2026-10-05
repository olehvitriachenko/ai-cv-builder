# Research: Structured CV Editor

Decisions behind [plan.md](./plan.md). Each lists the choice, the reason and what was rejected. Facts about the current code were read from the repository on 2026-10-05.

## D-1. Skills model: `skillCategories` replaces `skills`

- **Decision**: draft `schemaVersion` 2 has no `skills` key. It has `skillCategories: [{ id, name, skills: string[] }]`, ordered.
- **Why**: a new key makes the type change obvious (nothing can read the old field by mistake, `tsc` finds every use), and `skills.skills` would read badly. `id` gives React a stable key and lets a category be renamed without losing focus, as entries already do.
- **Rejected**: keeping `skills` and changing its element type (silent breakage of readers); a `category` field on each skill (reordering and empty categories become awkward).

## D-2. Caps and uniqueness

- **Decision**: at most 12 categories; category name 1 to 60 characters; each skill 1 to 60 characters (as now); at most 60 skills in total (as now). Category names are unique case-insensitively and skills are unique case-insensitively across the CV. Uniqueness is a rule of the **write path** (the edit body schema), like unique entry ids in `003`; the stored-draft schema checks shape and caps only, so reading never fails on legacy data.
- **Why**: uniqueness protects what a person can break by hand; the stored schema must accept anything the migration or the AI produced. The migration and the mapper both remove case-insensitive duplicates (first occurrence wins), so stored data satisfies the rule too.
- **Rejected**: DB-level uniqueness inside JSON (not expressible simply, speculative).

## D-3. One-time migration and a CHECK that keeps it that way

- **Decision**: a Prisma migration file with raw SQL. It (1) fails with a clear error when a stored draft is not an object with `schemaVersion` 1 or 2 or when a v1 draft's `skills` is not an array, before changing anything; (2) rewrites every `schemaVersion` 1 draft: removes `skills`, adds `skillCategories` (one category `{ id: "skills-default", name: "Skills", skills: [...] }` with case-insensitive duplicates removed in order, or `[]` when the list is empty) and sets `schemaVersion` 2; (3) leaves version 2 drafts and `NULL` drafts untouched; (4) adds `CHECK (draft IS NULL OR (jsonb_typeof(draft) = 'object' AND COALESCE(draft ->> 'schemaVersion', '') = '2'))`. `revision` and `updatedAt` are not touched (raw SQL does not run Prisma's `@updatedAt`), so list order and open editors' concurrency are unaffected by the data change itself.
- **Why**: the user asked for a one-time, repository-tracked migration and no runtime dual-format code. The CHECK makes "never a v1 draft again" a database guarantee (constitution IX) and makes a second run a no-op by construction.
- **CHECK verified against the lifecycle (2026-10-05, scratch PostgreSQL with the real migrations)**: the draft is written in exactly three places (the generation completion transaction, the manual edit, the clarification apply), always as a v2 object; `NULL` drafts exist for `PENDING`, `PROCESSING` and `FAILED` CVs and nothing ever writes a draft in those states, and retry or the startup sweep never touch `draft`. Replaying the lifecycle by SQL (insert `PENDING` with `NULL` draft, `PROCESSING`, `COMPLETED` with a v2 draft, edit with revision bump, `FAILED`, retry to `PENDING`, `PROCESSING`, sweep to `FAILED/INTERRUPTED`) passed with the constraint in place; a v1 draft, a draft without `schemaVersion`, `"schemaVersion": "2x"`, a JSON array and a JSON `null` literal were all rejected. A first draft of the constraint (`draft ->> 'schemaVersion' = '2'` alone) wrongly **accepted** a draft without `schemaVersion` (the expression is `NULL`, and a CHECK passes on `NULL`); the `COALESCE` and the `jsonb_typeof` guard fix that. Consequence for tests: every existing seed that inserts a v1 draft must move to v2 in the same change (test helpers are the first task of iteration 0).
- **Verification**: executed as a file against seeded rows in an e2e test (clean, v1, empty skills, already v2, second run, malformed) and on scratch databases as in `003`: a clean one and one carrying `002`/`003` data.
- **Deploy note**: an editor tab opened before the migration will save a v1 body and get `400`; the user reloads. Acceptable for this project and documented.
- **Rejected**: lazy conversion on read (dual format in code, rejected by the user); a Node migration script (not run by `prisma migrate deploy`).

## D-4. Target role is saved with the draft

- **Decision**: `PUT /cvs/:id/draft` accepts an optional `targetRole`; the same conditional `UPDATE` (owner, `COMPLETED`, revision) sets `draft`, `targetRole` and increments `revision`. `GET /cvs/:id/result` returns `targetRole`. Rules: trimmed, 1 to 200 characters (the creation rule). The web form includes the role and always sends the current value.
- **Why**: one write, one revision, one conflict path; no new endpoint. `Cv.targetRole` is already `String` (not null).
- **Effect on retry and AI apply**: they already read `Cv.targetRole`; they now see the edited role, which is intended (the role is an input to wording and ordering only, never to facts).
- **Rejected**: a separate `PATCH /cvs/:id` (second revision path); storing the role in the draft (duplicates the column and the list's source).

## D-5. LinkedIn, Portfolio and extra links stay one `links` list

- **Decision**: no model change. A pure client module splits `contact.links` for display: the first link whose host is `linkedin.com` (or a subdomain) is the LinkedIn field; the first remaining link is Portfolio; the rest are extra rows under "+ Add link". On save they merge back in the order LinkedIn, Portfolio, extras, blanks dropped, at most 5 (the existing cap). Unknown links are never lost or reordered beyond that rule.
- **Why**: the design names two fields, the model and the AI need no knowledge of them, and the question-target `CONTACT_LINK` field keeps working.
- **Rejected**: `linkedin`/`portfolio` keys (migration and AI contract change for presentation only).

## D-6. Dates: "Present" and "Currently studying"

- **Decision**: dates stay free text (`startDate`, `endDate`). The end-date control offers **Present** (stored as the string `Present`, case-insensitive on read) or a date text. Education shows "Currently studying · Expected completion in YYYY" and the label "End year (expected)" when the end year is in the future or the end date is `Present`; this is derived, not stored.
- **Why**: matches the existing validated model; no date parsing rules added.

## D-7. AI generation groups skills (prompt v3), governed by the prompt as in 002

- **Decision**: the structured output has `skillCategories: [{ category, skills[] }]` where `category` is an enum of the predefined names plus `Skills` (the fallback). The mapper assigns ids, drops empty categories and case-insensitive duplicates and applies the caps. The prompt (version 3) lists the categories, states that grouping only places skills the source mentions, that nothing is added to fill a category, and that anything unplaceable goes to `Skills`.
- **Trade-off (documented explicitly, not claimed otherwise)**: skills are **prompt-grounded only**. `002` deliberately does not verify skills mechanically ("not checked mechanically: bullets, dates, titles, skills") and this feature keeps that boundary. Nothing in the code proves a generated or applied skill appears in the source; what exists is the prompt rule, the closed category list, the additive patch, and the user's review in an always-editable CV. Real-model behaviour is only observed by the manual smoke test. The limit is stated in the spec (SC-006), here, and in the README follow-ups (task). A mechanical check was rejected because normalisation ("Responsive design" from "responsive layouts") would be refused.
- **Rejected**: letting the model invent category names (unbounded, inconsistent suggestions); a substring check on skills (rejects legitimate normalisation such as "Responsive design").

## D-8. SKILLS clarification apply

- **Decision**: the scope content for the SKILLS section is the list of categories with their skills. The patch schema is strict and additive: `{ additions: [{ category, skills[] }] }`. Applying a patch appends each skill to the category with the same name (case-insensitive) or creates that category at the end when it is a predefined name or `Skills`; any other new category name is an issue (`unknown_category`); duplicates are ignored; nothing is removed or renamed; an empty effective patch is rejected; the whole result must pass the draft schema; the transaction is unchanged.
- **Why**: preserves the `003` guarantees (scoped, additive, atomic).

## D-9. Completeness is a pure client function

- **Decision**: `computeCompleteness(values)` returns `{ percent, missing: [{ id, label, gain }] }` using the fixed table of the spec appendix; it runs on the live form values; "Needs details · N left" uses `missing.length`. Not stored, not sent.

## D-10. One centralized catalogue file shared by both apps (locked)

- **Decision**: a data-only workspace package `packages/skill-catalogue` (the workspace already lists `packages/*`) holds **one** JSON file, `skill-categories.json`: an ordered array of `{ name, suggestions[] }` (4 to 6 suggestions). It has no code and no build step. Each app has one thin typed accessor that imports the JSON and validates it with Zod at module load (a malformed file fails fast at startup/build, and a unit test checks unique names, 4 to 6 suggestions each, lengths within the draft caps). The API uses the names (the model's enum and the SKILLS patch check); the web uses names and suggestions.
- **Why**: the product owner wants a single source; JSON needs no compilation, so Node (API) and Next can both consume it from `node_modules`.
- **Does not block implementation**: the list is data. Missing categories (the four suspected gaps) are added later by editing the one file; nothing else changes because custom names are always allowed and the AI list is only a placement hint. The first task is a **spike** that proves the JSON import in the API build and in the web build; if it fails, the documented fallback is to keep the file in `apps/api` and have the web read it through a small authenticated read-only endpoint (still one file), decided at that task.
- **Rejected**: two copies with a drift test (more than one source); a TypeScript package (needs a build and `transpilePackages` for a list).
- **Phase 1 result (2026-10-05, tasks T001 to T008)**: the Next 16 docs say Turbopack transpiles workspace packages automatically and `transpilePackages` is only for packages that ship TypeScript/JSX, so a JSON-only package needs no Next configuration. The package is `@ai-cv-builder/skill-catalogue` (`exports: { ".": "./skill-categories.json" }`), linked into `apps/api` and `apps/web` as `workspace:*` (the lockfile gains the two importer links and the package entry, nothing else). The API imports it with `import catalogue from '@ai-cv-builder/skill-catalogue' with { type: 'json' }` (no tsconfig change; Node loads it at runtime from `dist`); the web imports it without attributes (`resolveJsonModule` is already on). Each app has one thin accessor (`apps/api/src/modules/ai/catalogue/skill-categories.ts`: names only; `apps/web/src/lib/cv/skill-catalogue.ts`: names and suggestions) and parses the file with Zod at module load. Both builds pass; the fallback endpoint was not needed.

## D-11. Category combobox is hand-written

- **Decision**: a small ARIA 1.2 combobox (input, `listbox`, `option`s, `aria-activedescendant`), arrow/Home/End/Enter/Escape keys, search by case-insensitive substring, "Use "<text>" as a custom category" when nothing matches, a bounded-height scrolling list that stays inside the viewport at 320 px. The filter and keyboard model are a pure module with tests.
- **Why**: a `<select>` cannot search or accept custom names; `<datalist>` cannot be styled to the design and behaves differently per browser; a library would be a new dependency.

## D-12. Reordering is Move up / Move down

- **Decision**: two icon buttons per category (disabled at the ends) swap neighbours; the pure `moveCategory(categories, index, delta)` is tested. The design's drag handle is replaced (user decision).

## D-13. Preview zoom and page count

- **Decision**: zoom is display-only, 50% to 150% in 10% steps with a **Fit page** action that fits the sheet to the available width; default is fit. The preview renders at least one A4 sheet; the page count is estimated as `ceil(contentHeight / A4Height)` and the sheet grows in whole A4 steps with faint page-break guides when the content is longer. Real pagination is the PDF feature's job and the caption says "Page N of M".
- **Why**: avoids a pagination engine; stays honest ("estimated" is documented in the README follow-ups) and keeps the preview a pure render of the form values.

## D-14. Full-screen preview uses a native `<dialog>`

- **Decision**: `showModal()` gives focus trapping, Esc to close, focus return to the opener and a `::backdrop` scrim for free; the dialog contains the same preview component with its own zoom state. Reduced motion: no animation.
- **Rejected**: custom portal with focus management (more code, more bugs).

## D-15. Review both versions: whole-version choice

- **Decision**: on a conflict the client already refetches the latest result (`003`). The review view shows two columns (stacked on phones): "Current local · not saved" from the form and "Saved account version" from the refetched result, with sections that differ highlighted by a pure comparison of the mapped form values. Buttons: **Keep my version** (the existing `keepMine`: save local on the latest revision) and **Use saved version** (the existing `loadLatest`). **Retry connection** (failed network save) is a separate action.
- **Why**: reuses `003` autosave transitions; no merge logic.

## D-16. Editor navigation and the route layout

- **Decision (locked)**: `app/cvs/layout.tsx` keeps authentication and the query provider but no longer renders `AppHeader`; the list and create pages render `AppHeader`, and `[id]/page.tsx` renders `AppHeader` for generation states and the new sticky `EditorNav` for the editor. Nav content: product mark, divider, `← My CVs` breadcrumb, CV title (target role) and owner (candidate name · "Personal CV" per design), save state, disabled **Download PDF**, and a more-options menu with exactly **Back to My CVs** and **Delete CV** (reusing the existing confirmation dialog; on success it returns to `/cvs`). Deleting a whole CV always requires that confirmation.
- **Why**: the Figma editor replaces the global header with its own bar; `003` already renders from a Server Component per page.

## D-17. Phone layout is a view switch, not a route

- **Decision**: below the desktop breakpoint, **Edit** and **Preview** are two views of the same page; both stay mounted (the inactive one is hidden) so form state, focus and scroll position survive; a sticky bottom **Preview CV** button switches views and respects the safe area; the status row shows save state and completeness.
- **Why**: "Preview opens on its own tab. Your edits stay here." in the design is satisfied without a new route or losing unsaved text.

## D-18. Adding and removing entries

- **Decision**: new experience and education entries get a client-generated id (as `003`), start with all fields empty and are saved as soon as they satisfy the schema (an entry needs an employer/title or an institution/qualification); until then the card shows its field messages and the save indicator says what blocks saving instead of reporting "Saved" falsely. Removing an entry, highlight, link, skill or category is immediate and has no confirmation (locked; the autosave stores it). Only whole-CV deletion asks for confirmation.
- **Why**: keeps `Saved` truthful (FR-012) and avoids inventing a pattern the design does not show.
