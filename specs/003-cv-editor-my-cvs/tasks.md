---

description: "Task list for CV Editor, Clarifications & My CVs"
---

# Tasks: CV Editor, Clarifications & My CVs

**Input**: Design documents from `/specs/003-cv-editor-my-cvs/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/cv-editor-api.md](./contracts/cv-editor-api.md), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED (spec "Required Automated Test Coverage", constitution X). Inside each story phase, write the tests first and confirm they fail, then implement (`.claude/rules/testing.md`). **No test ever calls the real Anthropic API**, and the suite must pass with `ANTHROPIC_API_KEY` unset. E2E runs on real PostgreSQL with Fastify `inject()` and a scripted fake for each AI port.

**Organization**: Tasks are grouped by user story. Strict TypeScript everywhere: no `any`, no `@ts-ignore`, no casts used as validation; untrusted input (HTTP bodies, database JSON, raw SQL rows, model output) is `unknown` until Zod parses it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1..US7, mapping to the user stories in spec.md
- Paths are relative to the repository root. `API` = `apps/api`, `WEB` = `apps/web`.
- Tags in brackets after the ID are for filtering: **[SCHEMA]** touches the Prisma schema or a migration, **[AI]** touches Anthropic, a prompt, or model output handling.

## File placement (follows `.claude/rules/file-structure.md`, which landed on this branch after the plan)

The plan's paths are adjusted to the repository's current structure: inside `API/src/modules/cv/` services live in `services/`, Zod schemas in `schemas/`, pure domain logic in a domain folder (`list/`, `clarification/`, `generation/`), and the single controller stays in the module root (`cv.controller.ts` also carries the new routes). In `API/src/modules/ai/` ports stay in the root, adapters go to `services/`, Zod schemas to `schemas/`, prompts to `prompts/`. Where a task names a path that disagrees (for example `editing/cv-editor.service.ts`), use the structure above; this is a placement change only.

## Scope guards (from the plan review; do not exceed)

- **No new tables and no new dependencies** unless a task reveals a concrete blocker (then stop and report). The delete dialog uses the native `<dialog>`.
- **`Cv.revision` changes only when the draft content changes** (manual edit, clarification apply). Answer, dismiss, generation and retry never advance it.
- **AI application is scoped to one section or one entry** and returns an additive patch; it never regenerates or replaces the full CV and never names a path or an operation.
- **The CORS `PUT`/`DELETE` fix is in scope** (T001).
- Do not touch the generation lifecycle (claim, fencing, sweep, retry compare-and-set) other than the shared retry-rule extraction in T008 and the `field` pipeline in US4.
- Out of scope: PDF export, templates, version history, merging, paging, search.

## Dependency overview

```text
Phase 1 Setup ──▶ Phase 2 Foundational ──┬─▶ US1 My CVs (API list + web list) ──────────────┐
                                         ├─▶ US2 Manual editing (API edit + web editor) ──┐ │
                                         │        │                                       │ │
                                         │        └─▶ US3 Answer / dismiss ─▶ US4 Apply ──┤ │
                                         │                                       │        │ │
                                         │                                       └─▶ US5 Safe updates ─┐
                                         ├─▶ US7 Ownership matrix (after US1..US4 endpoints exist)       │
                                         └─▶ US6 Delete (P2; needs the US1 card) ─────────────────────────┴─▶ Polish
```

US1 and US2 are independent after Phase 2 (they may run in parallel). US3 needs US2's editor shell and revision. US4 needs US3. US5 hardens US2 and US4. US7 needs all new endpoints. US6 needs the US1 list and card.

---

## Phase 1: Setup

**Purpose**: Configuration the rest relies on.

- [x] T001 In `API/src/app.setup.ts` change `app.enableCors({ origin, credentials: true })` to also pass `methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE']` (research D-10: `@fastify/cors` 11.3.0 defaults to `GET,HEAD,POST`, so browser `PUT`/`DELETE` preflights fail today). Add `API/test/cors.e2e-spec.ts`: an `OPTIONS` preflight with `Origin: <WEB_ORIGIN>` and `Access-Control-Request-Method: PUT` and another with `DELETE` each answer `204` with `access-control-allow-methods` containing that method and `access-control-allow-credentials: true`; a foreign origin gets no allow-origin header.
- [x] T002 [P] Add `ANSWER_APPLY_TIMEOUT_MS` to `API/src/config/env.ts`: `z.coerce.number().int().positive().default(20_000)` (per-attempt timeout of an AI-assisted apply; at most two attempts, research D-5). Cover the default, string coercion and rejection of `0`/negative in `API/src/config/env.spec.ts`. Add the variable (commented, with default) to `API/.env.example` if that file exists.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: Schema, migration, the question-state rename, the shared retry rule, test seeds and the web query provider. No story can start before this phase is green.

- [x] T003 [SCHEMA] Edit `API/prisma/schema.prisma` per [data-model.md](./data-model.md): `Cv.revision Int @default(0)`; `enum QuestionStatus { UNANSWERED ANSWERED APPLIED DISMISSED }` with `ClarificationQuestion.status @default(UNANSWERED)`; `ClarificationQuestion.answer String?`; new `enum QuestionField { CONTACT_FULL_NAME CONTACT_EMAIL CONTACT_PHONE CONTACT_LOCATION CONTACT_LINK EXPERIENCE_EMPLOYER EXPERIENCE_TITLE EXPERIENCE_LOCATION EXPERIENCE_START_DATE EXPERIENCE_END_DATE EDUCATION_INSTITUTION EDUCATION_QUALIFICATION EDUCATION_START_DATE EDUCATION_END_DATE }` and `ClarificationQuestion.field QuestionField?`. Add doc comments (revision advances only on draft change; `field` is the single plain value an answer fills). No new table, no new index.
- [x] T004 [SCHEMA] Create the migration with `pnpm --filter api exec prisma migrate dev --create-only --name cv_editor_my_cvs`, then edit `API/prisma/migrations/<timestamp>_cv_editor_my_cvs/migration.sql` (data-model.md "Migration mapping" and "Constraints"): use the enum-swap pattern (new type, `ALTER COLUMN "status" TYPE ... USING (CASE "status"::text WHEN 'OPEN' THEN 'UNANSWERED' WHEN 'RESOLVED' THEN 'APPLIED' END)::"QuestionStatus_new"`, drop old, rename; reset the column default to `'UNANSWERED'`), add `revision`, `answer`, `field`, and these hand-written CHECKs verbatim: `CHECK (revision >= 0)`; `CHECK (status <> 'ANSWERED' OR answer IS NOT NULL)`; `CHECK (status <> 'UNANSWERED' OR answer IS NULL)`; `CHECK (answer IS NULL OR char_length(answer) <= 1000)`; `CHECK (field IS NULL OR left(field::text, length(section::text) + 1) = section::text || '_')`. `APPLIED` must NOT require an answer. Apply with `pnpm --filter api prisma:migrate:deploy`.
- [x] T005 [SCHEMA] Verify the migration (record the results in the PR): (a) on a clean database `prisma migrate deploy` succeeds and `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` reports no drift; (b) on a database that holds 002 data (a `Cv` with an `OPEN` question) every former `OPEN` row is `UNANSWERED`, `revision` is `0`, `field`/`answer` are `NULL`; (c) each CHECK rejects a violating `UPDATE` (the four statements in quickstart.md). Run `pnpm --filter api prisma:generate`.
- [x] T006 Fix every compile and test break from the enum rename: in `API/src/modules/cv/generation/draft-mapper.ts` change `QuestionRow.status` to `'UNANSWERED'` (and the `status: 'OPEN'` literal in `mapQuestions`); update `API/src/modules/cv/generation/draft-mapper.spec.ts`, `API/src/modules/cv/generation/draft-validation.spec.ts`, `API/test/cv-result.e2e-spec.ts` and `API/test/generation-lifecycle.e2e-spec.ts` from `OPEN` to `UNANSWERED`. Run `pnpm --filter api exec tsc --noEmit` and the API unit + e2e suites: green before moving on.
- [x] T007 Extend `CvResultResponse` and `getResult` in `API/src/modules/cv/cv.service.ts`: add `revision: number` to the result and `answer: string | null` plus the four-state `status` to each question (select `revision` and `answer`; never select or return `field`). Update the shape assertions in `API/test/cv-result.e2e-spec.ts` (revision `0`, `answer: null`, `status: 'UNANSWERED'`).
- [x] T008 [P] Create `API/src/modules/cv/retry-rule.ts` exporting `canRetryGeneration(status: GenerationStatus): boolean` (true only for `FAILED`; research D-8, no new failure reason and no `retryable` flag) with `API/src/modules/cv/retry-rule.spec.ts` (all four statuses). Refactor `CvService.retry` in `API/src/modules/cv/cv.service.ts` to use it instead of the inline `!== 'FAILED'` check; keep the compare-and-set update and the `generationAttempts` fencing exactly as they are. The existing retry e2e tests must stay green unchanged.
- [x] T009 [P] Extend `API/test/helpers/seed.ts` with `seedQuestion(prisma, cvId, overrides)` (defaults: section `SUMMARY`, `missing`, `question`, `position` next free, `status` `UNANSWERED`, `answer` null, `field` null, `itemId` null) and `seedCompletedWithQuestions(prisma, cvId, questions)`; keep `sampleDraft()` entry ids `exp-1`/`edu-1`. Add a small `API/test/helpers/second-user.ts`-style helper only if `users.ts` has no way to register two users with cookies (reuse it otherwise).
- [x] T010 [P] WEB foundation: move the TanStack `QueryProvider` from `WEB/src/app/cvs/[id]/query-provider.tsx` to `WEB/src/app/cvs/query-provider.tsx` and wrap children in `WEB/src/app/cvs/layout.tsx` (so the list and the editor share one client); update the import in `WEB/src/app/cvs/[id]/generation-view.tsx`. In `WEB/src/lib/api/cvs.ts` update `clarificationQuestionSchema` (`status: z.enum(["UNANSWERED","ANSWERED","APPLIED","DISMISSED"])`, `answer: z.string().nullable()`) and `cvResultSchema` (`revision: z.number().int().nonnegative()`); keep `WEB/src/app/cvs/[id]/clarification-questions.tsx` compiling (it is replaced in US3). Run web `tsc`, lint, `vitest`, `next build`.

**Checkpoint**: API unit + e2e green, migration verified, web builds. Stories can start.

---

## Phase 3: User Story 1 - My CVs (Priority: P1)

**Goal**: `/cvs` lists only the user's CVs, newest update first, with display status, candidate name, role, time, message, unresolved count and the right actions; it polls only while a CV is active; it is the authenticated landing page.

**Independent Test**: With two users each owning CVs in every state, user A sees exactly A's CVs in `updatedAt` order with correct statuses, names (`Untitled CV` fallback), counts and actions; B's CVs never appear; an empty account sees the empty state; sign-in lands on `/cvs`.

### Tests first (US1)

- [x] T011 [P] [US1] `API/src/modules/cv/display-status.spec.ts`: `toDisplayStatus(status, unresolvedCount)` for every combination: `PENDING`/`PROCESSING` -> `PROCESSING`; `FAILED` -> `FAILED`; `COMPLETED` with 1+ unresolved -> `DRAFT`; `COMPLETED` with 0 -> `COMPLETED` (the unresolved count is irrelevant for non-`COMPLETED`).
- [x] T012 [P] [US1] `API/test/cv-list.e2e-spec.ts` (real PG, two users): only own CVs; ordered `updatedAt DESC` (touch one CV and see it move first; ties by id); `displayStatus` for each state; `candidateName` equals `draft.contact.fullName` and is `null` for blank, missing, `PENDING`, `PROCESSING` and `FAILED` CVs; `openQuestionsCount` counts only `UNANSWERED` and `ANSWERED` (seed all four states); `canRetry` is true exactly for `FAILED` and `POST /retry` accepts it while a non-`FAILED` CV answers `409`; `failureReason` non-null exactly for `FAILED`; each item has exactly the DTO keys (no `userId`, `sourceText`, `failureDetail`, draft body or question text); a `userId` in body, query or header is ignored; `401` unauthenticated; empty account -> `{ items: [] }`; reading the list does not change any `updatedAt`.
- [x] T013 [P] [US1] `WEB/src/lib/cv/list-poll.test.ts`: `listPollInterval(items)` returns `5000` while any item has status `PENDING` or `PROCESSING` and `false` otherwise (empty list, only `COMPLETED`/`FAILED`).
- [x] T014 [P] [US1] `WEB/src/lib/cv/card-copy.test.ts`: `cardMessage(displayStatus, openQuestionsCount)` returns the Figma copy ("N questions to strengthen your CV" with singular for 1, "Reviewed and ready to share", "Structuring your experience…", "Generation stopped. Your source is safe."), `cardActions(item)` returns Open for Draft/Completed, View progress for Processing, Try again only when `canRetry`, Delete only for `COMPLETED`/`FAILED`, and Download PDF (disabled) only for Draft/Completed.

### Implementation (US1, API)

- [x] T015 [US1] Create `API/src/modules/cv/display-status.ts` (pure function from T011).
- [x] T016 [US1] Create `API/src/modules/cv/cv-list.query.ts`: one parameterised `prisma.$queryRaw` (tagged template, user id as a parameter) selecting `c.id`, `c."targetRole"`, `c."generationStatus"`, `c."failureReason"`, `c."updatedAt"`, `NULLIF(btrim(c.draft #>> '{contact,fullName}'), '') AS "candidateName"` and `(SELECT count(*)::int FROM "ClarificationQuestion" q WHERE q."cvId" = c.id AND q.status IN ('UNANSWERED','ANSWERED')) AS "openQuestionsCount"` from `"Cv" c WHERE c."userId" = ${userId} ORDER BY c."updatedAt" DESC, c.id DESC`. Parse rows with a Zod row schema (database rows are an external boundary) and map to `CvListItem` (`id, targetRole, status, displayStatus, failureReason, canRetry, updatedAt, candidateName, openQuestionsCount`) using `toDisplayStatus` and `canRetryGeneration`. No new index (research D-9).
- [x] T017 [US1] Add `CvService.list(userId)` in `API/src/modules/cv/cv.service.ts` and `@Get() list(@CurrentUser() user)` returning `{ items }` in `API/src/modules/cv/cv.controller.ts` (declared before `:id` routes). The owner is only `user.id`.

### Implementation (US1, web)

- [x] T018 [US1] Inspect Figma with `get_design_context` (and `get_screenshot` where useful) for `6:6128` ("02 · My CVs"), `2:7459` (populated), `2:7573` (empty), `2:8854` (mobile, not inspected before) and the App navigation in `2:8680`; record in the PR the tokens, copy, spacing, the privacy note text and where Download PDF appears on a card. If the Figma connector is unreachable, say so and use the earlier-recorded structure from plan.md without guessing new details.
- [x] T019 [P] [US1] `WEB/src/lib/api/cvs.ts`: add `cvListItemSchema` (including `displayStatus: z.enum(["PROCESSING","FAILED","DRAFT","COMPLETED"])`, `candidateName: z.string().nullable()`, `openQuestionsCount`, `canRetry`), `listCvs(cookie?)` (`GET /cvs`, parsed with `z.object({ items: z.array(...) })`). Types come from the schemas; no casts.
- [x] T020 [P] [US1] Create `WEB/src/lib/cv/list-poll.ts` and `WEB/src/lib/cv/card-copy.ts` (T013, T014). Add the "Draft" variant to `WEB/src/components/ui/status-badge.tsx` (accepts a display status: Processing, Failed, Draft, Completed) using the Figma Draft style from T018; keep the existing generation-status badge behaviour for `/cvs/[id]`.
- [x] T021 [P] [US1] Create `WEB/src/components/nav-link.tsx` (client, `usePathname`, `aria-current="page"` when active) and add the "My CVs" item to `WEB/src/components/app-header.tsx` (the brand link goes to `/cvs`).
- [x] T022 [US1] Create `WEB/src/app/cvs/page.tsx` (Server Component: loads the list server-side with the forwarded session cookie via `WEB/src/lib/cv/server.ts`, renders the heading, a "New CV" `ButtonLink` to `/cvs/new`, the privacy note and `<CvList initialItems>`); `WEB/src/app/cvs/cv-list.tsx` (client; `useQuery` with `initialData` and `refetchInterval: listPollInterval`, loading skeleton, error state with retry, empty state); `WEB/src/app/cvs/cv-list-empty.tsx`; `WEB/src/app/cvs/cv-list-skeleton.tsx`; `WEB/src/app/cvs/loading.tsx`. Desktop is a card grid, mobile is a single column; no horizontal scroll at 320 px.
- [x] T023 [US1] Create `WEB/src/app/cvs/cv-card.tsx` (reuse `Card`, `StatusBadge`, `Button`/`ButtonLink`): candidate name or `Untitled CV`, target role (wraps long unbroken text with `[overflow-wrap:anywhere]`), relative last-updated time in a `<time>` element, message from `card-copy`, Open (`/cvs/:id`), View progress (`/cvs/:id`), Try again (calls `retryCv`, then invalidates the list; a `409` shows a conflict message and refetches), disabled Download PDF with an accessible explanation (`aria-disabled`/`disabled` plus title text; no click behaviour). Delete is added in US6.
- [x] T024 [P] [US1] Navigation: `WEB/src/app/page.tsx` redirects an authenticated user to `/cvs` (unauthenticated to `/login`, as before) and keeps no marketing content; `WEB/src/app/login/login-form.tsx` and `WEB/src/app/register/register-form.tsx` `router.replace("/cvs")`; `WEB/src/app/cvs/new/page.tsx` back link, `WEB/src/app/cvs/[id]/generation-progress.tsx` ("Back to home" -> "Back to My CVs" linking `/cvs`; "Start a new CV" stays) and `WEB/src/app/cvs/[id]/cv-not-found.tsx` (adds a "Back to My CVs" `ButtonLink` next to "Start a new CV").
- [x] T025 [US1] Run: API `tsc`/lint/unit/e2e, web `tsc`/lint/`vitest`/`next build`. Browser check with seeded data at 320, 390 and 1280 px (every state, empty state, Processing card refreshes by itself and polling stops when no CV is active in the Network tab, sign-in lands on `/cvs`, "My CVs" is active). Fix what fails.

**Checkpoint**: US1 is shippable on its own (list + navigation; editing and deleting not yet).

---

## Phase 4: User Story 2 - Manual editing (Priority: P1)

**Goal**: A `COMPLETED` CV opens in a document-first editor; edits to every section autosave to the server with a true Saving/Saved/Error state and survive reload; a stale save never overwrites newer data.

**Independent Test**: Open a completed CV, change one field in each section, add and remove a bullet, reload and see every change; an invalid value shows a field message and is not saved; the preview updates before the save; a stale revision gets `409` and stores nothing.

### Tests first (US2)

- [x] T026 [P] [US2] `API/src/modules/cv/editing/draft-edit.schema.spec.ts`: the edit body `{ revision, draft }` accepts a valid draft; rejects over-cap values using the existing caps ("name <= 120, summary <= 1200, skills <= 60 items of <= 60 chars, bullets <= 12 items of <= 300 chars", experience <= 30, education <= 10, links <= 5), blank strings, an experience entry with neither employer nor title, an education entry with neither institution nor qualification, a duplicate entry id across experience and education, an invalid `contact.email`, a negative or non-integer `revision`, and `schemaVersion` other than `1`.
- [x] T027 [P] [US2] `API/test/cv-edit.e2e-spec.ts` (real PG): each section saved and read back via `GET /result`; bullet add, edit and remove; `revision` advances by exactly 1 per accepted save and the response is `{ revision, updatedAt }`; invalid body -> `400 VALIDATION_ERROR` with dotted `fieldErrors` keys (`draft.contact.email`, `draft.experience.0.bullets.2`) and nothing stored; `PENDING`, `PROCESSING` and `FAILED` CVs -> `409 CV_NOT_EDITABLE`; stale revision -> `409 REVISION_CONFLICT` and the stored draft is unchanged; two parallel saves on the same revision (`Promise.all`): exactly one `200` and one `409`; `updatedAt` moves on a save and not on `GET`; the generation columns and questions are untouched by a save.
- [x] T028 [P] [US2] `WEB/src/lib/cv/draft-form.test.ts`: `toFormValues(draft)` / `toDraft(values)` round trip (null <-> empty string, skills and links as lists, entry ids preserved, new entries get fresh ids), `cvFormSchema` rejects the same cases as the server for the client-checkable rules (over-cap text, bad email, entry with neither employer nor title) and produces per-field messages.
- [x] T029 [P] [US2] `WEB/src/lib/cv/use-draft-autosave.test.ts` (reducer plus a fake-timer test of the hook): edit -> `dirty`; debounce 1000 ms -> `saving`; success -> `saved` with the new revision; only one request in flight and the newest values sent next; failure -> `error` with the local values kept and a manual retry; `409 REVISION_CONFLICT` -> `conflict` and autosave stops; saves never run out of order; `saved` is never shown for a change the server rejected.

### Implementation (US2, API)

- [x] T030 [US2] Create `API/src/modules/cv/editing/draft-edit.schema.ts`: `cvDraftEditBodySchema` = `{ revision: z.number().int().nonnegative(), draft: cvDraftSchema }` plus refinements for unique entry ids and a valid email when set (reuse `cvDraftSchema` unchanged; research D-1, data-model "Edit validation").
- [x] T031 [US2] Create `API/src/modules/cv/editing/cv-editor.service.ts` (`updateDraft(userId, cvId, body)`): one `updateManyAndReturn` on `{ id, userId, generationStatus: 'COMPLETED', revision: body.revision }` setting `draft` and `revision: { increment: 1 }`; on zero rows load through the ownership gate and throw `404 CV_NOT_FOUND`, `409 CV_NOT_EDITABLE` (status not `COMPLETED`) or `409 REVISION_CONFLICT`. Return `{ revision, updatedAt }`. Register in `API/src/modules/cv/cv.module.ts`.
- [x] T032 [US2] Add `@Put(':id/draft')` to `API/src/modules/cv/cv.controller.ts` with `ZodValidationPipe(cvDraftEditBodySchema)`; confirm `fieldErrors` keys are dotted draft paths (adjust the pipe only if it does not already join issue paths with `.`).

### Implementation (US2, web)

- [x] T033 [US2] Inspect Figma with `get_design_context`/`get_screenshot` for the editor frames `6:2671` (05.1), `6:2856`, `6:3039` (05.3 saving), `6:3224`, `6:7405`, mobile `6:5741`, `15:2`, `25:81`, and the save indicators in `2:8680`; record layout (488 px left column, A4 preview right, zoom control), section card styles, copy and the header (Back to My CVs, save indicator, disabled Download PDF). Same Figma-unavailable rule as T018.
- [x] T034 [P] [US2] `WEB/src/lib/api/cvs.ts`: add `saveDraft(id, { revision, draft })` (`PUT /cvs/:id/draft`, parsed response `{ revision, updatedAt }`) and map `409` codes `REVISION_CONFLICT` / `CV_NOT_EDITABLE` to a typed error the autosave hook can branch on (using the existing `ApiError` from the fetcher).
- [x] T035 [P] [US2] Create `WEB/src/lib/cv/draft-form.ts` (T028): `cvFormSchema` (Zod, same caps as the API), `toFormValues`, `toDraft`; entry ids from `crypto.randomUUID()`.
- [x] T036 [P] [US2] Create `WEB/src/lib/cv/use-draft-autosave.ts` (T029): reducer states `idle | dirty | saving | saved | error | conflict`, debounce 1000 ms, a single in-flight request, newest values win, revision taken from each response, exposes `saveNow()` (flush, used by apply in US4) and `retry()`. No `localStorage`/`sessionStorage`.
- [x] T037 [P] [US2] Editor section components under `WEB/src/app/cvs/[id]/editor-sections/`, each with labelled controls and RHF field registration: `contact-section.tsx`, `summary-section.tsx`, `skills-section.tsx`.
- [x] T038 [P] [US2] `WEB/src/app/cvs/[id]/editor-sections/experience-section.tsx` (`useFieldArray` for entries with a nested `useFieldArray` for bullets: add/edit/remove entry and bullet, caps enforced, "needs an employer or a title" message) and `education-section.tsx` (`useFieldArray`).
- [x] T039 [P] [US2] `WEB/src/app/cvs/[id]/save-indicator.tsx` (Saving / Saved / Error with retry; `role="status"` live region; text plus icon, never colour alone) using the Figma indicators from T033.
- [x] T040 [US2] Create `WEB/src/app/cvs/[id]/cv-editor.tsx` (client): RHF with `zodResolver(cvFormSchema)`, `useWatch` feeding the existing `CvDocument` in `A4Sheet` as the live preview, `useDraftAutosave`, header with "Back to My CVs", `SaveIndicator` and the disabled Download PDF, a `beforeunload` guard while a save is pending or failed. Desktop: editor left (clarification panel slot reserved), preview right; mobile: single column. Invalid fields block the save and show messages; the last valid server state is kept.
- [x] T041 [US2] Wire `WEB/src/app/cvs/[id]/page.tsx`: for `COMPLETED` the Server Component loads `getCvResult` on the server (forwarded cookie) and renders `<CvEditor initialResult>`; other states keep the generation view. After a generation completes in `generation-view.tsx`, refresh into the editor. Delete `WEB/src/app/cvs/[id]/result-view.tsx` once unused.
- [x] T042 [US2] Run: API `tsc`/lint/unit/e2e, web `tsc`/lint/`vitest`/`next build`. Browser check at 320/390/1280 px: edit each section, add and remove a bullet, preview updates before the save, Saving -> Saved, reload keeps the content, offline -> Error with retry and kept text, no horizontal overflow. Fix what fails.

**Checkpoint**: US2 works with the 002 questions still shown read-only by the old component (replaced in US3).

---

## Phase 5: User Story 3 - Answer or dismiss clarification questions (Priority: P1)

**Goal**: Questions show in the editor with four states; the user answers (saved, CV unchanged) and can dismiss an unanswered or answered question on explicit action.

**Independent Test**: Open a CV with questions; answer one and reload (answer persists, state answered, CV and `revision` unchanged, count unchanged); dismiss one (state dismissed, count drops, CV unchanged, persists); resolved questions are read-only.

### Tests first (US3)

- [x] T043 [P] [US3] `API/src/modules/cv/clarification/question-state.spec.ts`: `canAnswer(status)` true for `UNANSWERED`/`ANSWERED`; `canDismiss` true for `UNANSWERED`/`ANSWERED`; `canApply` true only for `ANSWERED`; `APPLIED` and `DISMISSED` refuse everything; `isResolved`/`isUnresolved`; `answerBodySchema` trims and accepts 1 to 1000 characters and rejects blank and over-long answers ("`answer` at most 1000 characters").
- [x] T044 [P] [US3] `API/test/question-answer.e2e-spec.ts` (real PG): answer saves, question becomes `ANSWERED`, the draft and `revision` are unchanged and `updatedAt` moves; the answer can be replaced while `ANSWERED`; blank and 1001-character answers -> `400` with `fieldErrors.answer`; answering `APPLIED`/`DISMISSED` -> `409 QUESTION_STATE_CONFLICT`; non-`COMPLETED` CV -> `409 CV_NOT_EDITABLE`; dismiss from `UNANSWERED` and from `ANSWERED` -> `DISMISSED`, draft and `revision` unchanged, the answer (if any) kept, `openQuestionsCount` in `GET /cvs` drops by one and the display status of the last unresolved question becomes `COMPLETED`; dismissing a resolved question -> `409 QUESTION_STATE_CONFLICT`; nothing is ever dismissed automatically (an edit that fills the target does not change the question); answering does not conflict with a pending revision (an edit then an answer with no revision succeeds); a question id from another CV of the same user -> `404 QUESTION_NOT_FOUND`.
- [x] T045 [P] [US3] `WEB/src/lib/cv/question-form.test.ts`: the answer form schema (trimmed, 1 to 1000 characters) and `questionView(question)` mapping each state to its label, the actions allowed (answer, dismiss, none) and whether the answer is read-only.

### Implementation (US3, API)

- [x] T046 [US3] Create `API/src/modules/cv/clarification/question-state.ts` (T043) and the Zod `answerBodySchema`.
- [x] T047 [US3] Create `API/src/modules/cv/clarification/clarification.service.ts` with `answer(userId, cvId, questionId, input)` and `dismiss(userId, cvId, questionId)`. Each runs in one `$transaction`: `updateMany` on the CV `{ id, userId, generationStatus: 'COMPLETED' }` setting `updatedAt: new Date()` (zero rows -> ownership gate -> `404 CV_NOT_FOUND` or `409 CV_NOT_EDITABLE`; this does NOT touch `revision`), then `updateManyAndReturn` on the question `{ id: questionId, cvId, status: { in: ['UNANSWERED','ANSWERED'] } }` (zero rows -> `404 QUESTION_NOT_FOUND` if the question is not in this CV, else `409 QUESTION_STATE_CONFLICT`). Return the question DTO without `field`. Logs carry ids and error category only. Register the provider in `cv.module.ts`.
- [x] T048 [US3] Create `API/src/modules/cv/clarification/clarification.controller.ts` (`@Controller('cvs/:id/questions')`, `PUT :questionId/answer`, `POST :questionId/dismiss`, params validated with `cvIdSchema` and a question-id schema, identity only from `@CurrentUser()`); register it in `cv.module.ts`.

### Implementation (US3, web)

- [x] T049 [US3] Inspect Figma `12:67` (05.6 AI clarification active), the AI Assistant card in `6:2671` (Factual clarification Unanswered with answer input, Applied confirmation with "UPDATED SECTION") and the matching mobile frames; record the four visual states (Dismissed is not in the design: use the Applied/muted pattern with a "Dismissed" label and say so in the PR).
- [x] T050 [P] [US3] `WEB/src/lib/api/cvs.ts`: `answerQuestion(cvId, questionId, answer)` (`PUT`), `dismissQuestion(cvId, questionId)` (`POST`), both returning the parsed `clarificationQuestionSchema`.
- [x] T051 [P] [US3] Create `WEB/src/lib/cv/question-form.ts` (T045).
- [x] T052 [US3] Create `WEB/src/app/cvs/[id]/clarification-panel.tsx` and `question-card.tsx` (secondary visual weight, desktop left column under the editor header, mobile below the sections): each card shows the question, the section/entry it concerns (resolved from `itemId` against the current form values), its state, an answer textarea with RHF + Zod and a labelled control, "Save answer" (`useMutation`), "Dismiss" with an explicit button, loading and error states per card, resolved cards read-only. Replace `clarification-questions.tsx` and delete it. The panel keeps its own question state seeded from the server result and updated from each mutation response; it does not use or change the form revision.
- [x] T053 [US3] Run: API `tsc`/lint/unit/e2e, web `tsc`/lint/`vitest`/`next build`. Browser check at 320/390/1280 px: answer, edit the answer, reload, dismiss, reload; counts update in My CVs after returning; no overflow. Fix what fails.

**Checkpoint**: US3 works; Apply is not available yet (the card shows no Apply button).

---

## Phase 6: User Story 4 - Apply an answer (Priority: P1)

**Goal**: An answered question is applied to exactly the section or entry it concerns, atomically with being marked applied: deterministically when it carries a `field`, otherwise through a narrow, validated, additive Anthropic patch. Failures change nothing.

**Independent Test**: With the AI fakes, apply a `field` answer (0 AI calls), apply an AI-path answer (the request contains only the scoped section/entry, question and answer), see only the target change and unrelated manual edits stay; every failure leaves the draft and question unchanged.

### 4a. Generation emits `field` (touches 002 generation; own review gate)

- [ ] T054 [P] [US4] [AI] Tests first: extend `API/src/modules/ai/llm-cv-output.schema.spec.ts` (questions accept `field` as a nullable enum of the 14 `QuestionField` values, reject unknown values), `API/src/modules/cv/generation/draft-validation.spec.ts` (new rule `question_field_mismatch`, path `questions.N.field`: the field prefix must equal the question `section`; an `EXPERIENCE_*`/`EDUCATION_*` field requires a non-null valid `itemIndex`; `CONTACT_*` requires `itemIndex` null; `SUMMARY`/`SKILLS` questions must have `field` null), `API/src/modules/cv/generation/draft-mapper.spec.ts` (`mapQuestions` carries `field`), `API/src/modules/ai/prompts/cv-draft.prompt.spec.ts` (prompt version bumped to `v2`; the prompt tells the model to set `field` only when the answer will be one plain value for exactly that field, otherwise null).
- [ ] T055 [US4] [AI] Implement T054: add `field` to `API/src/modules/ai/llm-cv-output.schema.ts` (`z.enum(QUESTION_FIELDS).nullable()`; export the tuple), bump `PROMPT_VERSION` and add the `field` instructions to `API/src/modules/ai/prompts/cv-draft.prompt.ts`, add `field` to `QuestionRow`/`mapQuestions` in `API/src/modules/cv/generation/draft-mapper.ts`, add the `question_field_mismatch` check to `API/src/modules/cv/generation/draft-validation.ts` (issues carry rule id and path only), and persist `field` where `GenerationProcessor` inserts questions (`API/src/modules/cv/generation/generation-processor.service.ts`). Extend the e2e output helper `API/test/helpers/llm-output.ts` and `API/test/generation-lifecycle.e2e-spec.ts` (a field question is stored with its `field`; a mismatched field is invalid output with at most one retry and nothing stored). Do not change the lifecycle logic.

### 4b. Deterministic apply (pure)

- [ ] T056 [P] [US4] Tests first `API/src/modules/cv/clarification/question-target.spec.ts`: for each of the 14 fields, applying a valid answer to a null target returns the new draft with only that value changed (entry located by `itemId`, others untouched); `CONTACT_LINK` appends (max 5 links, each <= 200 characters); a non-null target -> `{ ok: false, reason: 'TARGET_FILLED' }`; a missing entry id -> `TARGET_MISSING`; the answer is trimmed and validated per field ("`email` must be a valid email, at most 254", name <= 120, phone <= 40, location <= 120, employer/title/institution/qualification <= 200, dates <= 40); the result passes `cvDraftSchema`.
- [ ] T057 [US4] Create `API/src/modules/cv/clarification/question-target.ts` implementing T056 (pure; no Prisma, no AI).

### 4c. AI-assisted apply (adapter, patch schema, validation)

- [ ] T058 [P] [US4] [AI] Tests first `API/src/modules/ai/answer-patch.schema.spec.ts`: per-scope Zod schemas from research D-4 (`CONTACT`: `fullName,email,phone,location` nullable + `links[]`; `SUMMARY`: `summary` nullable; `EXPERIENCE`: `employer,title,location,startDate,endDate` nullable + `bullets[]`; `EDUCATION`: `institution,qualification,startDate,endDate,details` nullable; `SKILLS`: `skills[]`) accept valid patches and reject wrong types, extra keys and a missing section.
- [ ] T059 [P] [US4] [AI] Tests first `API/src/modules/cv/clarification/answer-patch.spec.ts` for `applyAnswerPatch(draft, target, patch, answer)`: scalars fill only null values (a non-null current value in the patch's key -> `would_overwrite` issue); bullets appended up to 12 total, skills appended and de-duplicated up to 60, links up to 5; empty or null patch values leave the draft unchanged; contact `email`, `phone` and `fullName` must be supported by the answer text and `employer`/`institution` by the answer or the entry's existing text (reuse `source-matching.ts`); an unsupported fact -> `unsupported_fact`; the resulting whole draft passes `cvDraftSchema`; issues carry rule ids and paths only (no values).
- [ ] T060 [US4] [AI] Create `API/src/modules/ai/answer-patch.schema.ts` (T058) and `API/src/modules/cv/clarification/answer-patch.ts` (T059; pure).
- [ ] T061 [P] [US4] [AI] Tests first `API/src/modules/ai/prompts/answer-patch.prompt.spec.ts`: the prompt is built only from the scoped section/entry JSON, the question, the answer and the target role (assert it does not contain the other sections, the source text, entry ids or `userId`), states that the answer and CV text are data and not instructions, forbids invention and overwriting, and defines null/empty-list behaviour; delimiter look-alikes in the answer are neutralised as in `cv-draft.prompt.ts`.
- [ ] T062 [US4] [AI] Create `API/src/modules/ai/prompts/answer-patch.prompt.ts` (centralised, versioned `PROMPT_VERSION = 'answer-patch/v1'`) and the port `API/src/modules/ai/cv-answer-applier.ts` (`abstract class CvAnswerApplier { abstract apply(request: { scope: ...; entry?: ...; question: string; answer: string; targetRole: string; signal?: AbortSignal }): Promise<unknown> }`; reuse `ProviderError`).
- [ ] T063 [P] [US4] [AI] Tests first `API/src/modules/ai/anthropic-answer-applier.spec.ts` (injected fake client, as in `anthropic-cv-generator.spec.ts`): builds a request with structured output for the scope's schema, `maxRetries: 0` semantics, returns the parsed content as `unknown`, maps auth/connection/bad-request/refusal errors to `ProviderError` kinds, honours the abort signal, and sends no API key or other sections.
- [ ] T064 [US4] [AI] Create `API/src/modules/ai/anthropic-answer-applier.ts` (reuse `createAnthropicClient`; a second small adapter file beside `anthropic-cv-generator.ts`, no shared abstraction), and register `CvAnswerApplier` in `API/src/modules/ai/ai.module.ts` using `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and `ANSWER_APPLY_TIMEOUT_MS` (without a key the app still boots and `apply` throws `NOT_CONFIGURED`); export it.
- [ ] T065 [P] [US4] [AI] `API/test/helpers/fake-answer-applier.ts` (scripted responses per call, recorded requests, optional hold/delay, can throw `ProviderError`); make `API/test/helpers/create-test-app.ts` override `CvAnswerApplier` with it by default.

### 4d. Apply orchestration (the atomic transaction)

- [ ] T066 [P] [US4] Tests first `API/test/question-apply.e2e-spec.ts` part 1, deterministic path (real PG): a `field` question applied -> `200 CvResult` with only the target changed, `revision` +1, question `APPLIED`, the fake AI called 0 times; unrelated manual edits made before the apply are unchanged; target filled / entry removed -> `409 TARGET_NOT_APPLICABLE`, draft, revision and question unchanged, then `dismiss` succeeds; not `ANSWERED` -> `409 QUESTION_STATE_CONFLICT`; a second apply of the same question -> `409`; non-`COMPLETED` CV -> `409 CV_NOT_EDITABLE`; stale `revision` -> `409 REVISION_CONFLICT`.
- [ ] T067 [P] [US4] Tests first `API/test/question-apply.e2e-spec.ts` part 2, AI path: the recorded applier request contains only the scoped section/entry, the question, the answer and the target role; a valid patch adds bullets (existing bullets untouched), skills (deduplicated) or fills a null field, `revision` +1, question `APPLIED`; `SUMMARY` apply refused when a summary already exists (`TARGET_NOT_APPLICABLE`); invalid/malformed output -> one retry then `422 APPLY_OUTPUT_INVALID`; an unsupported fact or an overwriting patch -> `422`; provider error / not configured / timeout -> `503 AI_UNAVAILABLE`; in every failure the draft, `revision` and question are unchanged; a deterministic apply still works while the applier throws.
- [ ] T068 [US4] Apply preconditions in `API/src/modules/cv/clarification/clarification.service.ts` (`loadApplyContext(userId, cvId, questionId, expectedRevision)`; research D-5 steps 1-4): load the owned CV through the ownership gate (`404 CV_NOT_FOUND`), the question with `WHERE id AND cvId` (`404 QUESTION_NOT_FOUND`), require the CV `COMPLETED` (`409 CV_NOT_EDITABLE`) and the question `ANSWERED` (`409 QUESTION_STATE_CONFLICT`), reject a stale `revision` before any AI work (`409 REVISION_CONFLICT`), and refuse an unavailable target (entry removed, scalar already filled, summary already present) with `409 TARGET_NOT_APPLICABLE` using the pure target checks from `question-target.ts`. Returns the draft snapshot, the question and its target. Covered by the precondition cases of T066.
- [ ] T069 [US4] Deterministic apply path in `clarification.service.ts` (`computeDeterministicDraft`): when the question has a `field`, call `question-target.ts` with the answer on the snapshot, validate the whole result with `cvDraftSchema`, and return the new draft; no `CvAnswerApplier` call is possible on this path (assert 0 fake calls in T066).
- [ ] T070 [US4] [AI] AI apply path in `clarification.service.ts` (`computeAiDraft`): when `field` is null, build the scoped request (only the section or entry, the question, the answer and the target role), call `CvAnswerApplier` for at most two attempts of `ANSWER_APPLY_TIMEOUT_MS` each with `AbortSignal.timeout` (the second attempt only for invalid output or a transient provider error), parse the output with the scope's schema from `answer-patch.schema.ts`, apply it with `answer-patch.ts`, validate the whole result with `cvDraftSchema`; map provider errors, timeout and missing key to `503 AI_UNAVAILABLE` and invalid, unsupported or overwriting output to `422 APPLY_OUTPUT_INVALID`. Nothing is written in this task.
- [ ] T071 [US4] Transactional commit and question state transition in `clarification.service.ts` (`apply`): call T068, then T069 or T070, then ONE `$transaction`: `updateMany` on the CV `{ id, userId, generationStatus: 'COMPLETED', revision: expected }` setting the new `draft` and `revision: { increment: 1 }`, then `updateMany` on the question `{ id, cvId, status: 'ANSWERED' }` -> `APPLIED`; if either count is not 1, throw inside the transaction so both writes roll back and map to `409 REVISION_CONFLICT` / `409 QUESTION_STATE_CONFLICT`. Return the fresh `CvResult`. Never log the draft, answer, prompt or model output. Covered by T066, T067 and the rollback test T077.
- [ ] T072 [US4] Add `@Post(':questionId/apply')` to `API/src/modules/cv/clarification/clarification.controller.ts` with `applyBodySchema` (`{ revision: int >= 0 }`); the handler contains no logic beyond calling the service.

### 4e. Web

- [ ] T073 [P] [US4] `WEB/src/lib/api/cvs.ts`: `applyQuestion(cvId, questionId, revision)` returning the parsed `cvResultSchema`; typed error mapping for `TARGET_NOT_APPLICABLE`, `REVISION_CONFLICT`, `QUESTION_STATE_CONFLICT`, `APPLY_OUTPUT_INVALID`, `AI_UNAVAILABLE`.
- [ ] T074 [P] [US4] Tests first `WEB/src/lib/cv/apply-flow.test.ts`: `applyAnswer({ saveNow, apply })` flushes a pending autosave first, then applies with the latest revision, and returns the server result; if the flush fails the apply is not sent; error codes map to user messages (target not applicable -> "edit the CV or dismiss", AI unavailable -> "try again", output invalid -> "try again or edit by hand").
- [ ] T075 [US4] Create `WEB/src/lib/cv/apply-flow.ts` (T074) and add the **Apply answer** button (answered questions only) to `question-card.tsx`: while pending the card shows a clear pending state and the form is disabled; on success the form is reset from the returned draft and revision (the server is authoritative) and the card shows Applied with "Updated section"; on `TARGET_NOT_APPLICABLE` the card explains and offers Dismiss; on other errors it keeps the question answered and offers retry.
- [ ] T076 [US4] Run: API `tsc`/lint/unit/e2e (suite must pass with no key), web `tsc`/lint/`vitest`/`next build`. Browser check with seeded data: apply a field question (no AI request in the API log), apply with the AI fake (dev-only fake via env is NOT added; use the e2e path and a manual run with a key in T093), see Applied, reload, count and display status in My CVs update. Fix what fails.

**Checkpoint**: US4 complete end to end. Review gate: re-read the diff of T055, T060-T064, T068-T071 for scope (no full-CV regeneration, no arbitrary path, no overwrite).

---

## Phase 7: User Story 5 - Stale or failed writes never destroy work (Priority: P1)

**Goal**: Conflicts and failures are safe and understandable; nothing is lost silently on the client or the server. The server-side rules are implemented in US2 and US4; this phase hardens and proves them.

**Independent Test**: Two sessions on one CV: the stale save gets 409 and the newer content survives; a forced failure between the two writes of an apply leaves content and question unchanged; a double-click apply happens once; the editor offers Load latest / Keep my changes without discarding local text.

- [ ] T077 [P] [US5] `API/test/cv-concurrency.e2e-spec.ts` (real PG): forced failure between the two writes of an apply (inject a failure by overriding `PrismaService` question `updateMany` or via `API/test/helpers/delay-prisma-query.ts`-style hook) rolls back the CV update too (draft, `revision`, question status all unchanged); two parallel applies of one question -> exactly one `200`; an apply started with revision N while an edit lands before it commits (hold the fake applier) -> `409 REVISION_CONFLICT`, nothing stored; two applies of different questions in parallel never overwrite each other (one succeeds, the other `409` and can be retried); a save racing an apply on the same revision -> exactly one wins.
- [x] T078 [P] [US5] (covered by `WEB/src/lib/cv/autosave.test.ts`: `resolveConflict` with and without `keepPending`, no autosave while in conflict) `WEB/src/lib/cv/conflict-actions.test.ts`: `loadLatest` refetches the result and resets the form (local edits discarded only by this explicit action); `keepMine` refetches the latest revision, then saves the local document on it (explicit overwrite, never automatic) and returns to `saved` or `error`; autosave stays stopped while in `conflict`; unsaved local text is retained until one of the two actions completes.
- [x] T079 [US5] Create `WEB/src/lib/cv/conflict-actions.ts` (T078) and `WEB/src/app/cvs/[id]/conflict-banner.tsx` (message that the CV changed elsewhere; buttons "Load latest" and "Keep my changes"; focus moves to the banner; `role="alert"`); mount it in `cv-editor.tsx` and surface the same banner when an apply returns `REVISION_CONFLICT`.
- [x] T080 [US5] Browser check with two tabs on one CV: save in tab A, type in tab B -> conflict banner, both actions behave as specified, newer content is never lost silently; Error state while offline keeps local text. Fix what fails.

---

## Phase 8: User Story 7 - Only the owner can touch a CV (Priority: P1)

**Goal**: Every new operation is owner-only with the existing not-found behaviour.

**Independent Test**: As user B, run every operation against A's CV and questions and compare each response byte for byte with the response for a non-existent id; unauthenticated requests get `401`.

- [ ] T081 [US7] `API/test/cv-editor-ownership.e2e-spec.ts` (real PG, users A and B): as B, `PUT /cvs/:A/draft`, `PUT .../answer`, `POST .../dismiss`, `POST .../apply`, `POST /cvs/:A/retry` and `DELETE /cvs/:A` each return a `404 CV_NOT_FOUND` identical (status, code, message, body) to the same call against a non-existent CV id and A's data is unchanged afterwards; `GET /cvs` as B never contains A's CV; a `userId` in body, query or header never changes whose CVs are listed or edited; a question id that belongs to A's other CV addressed through A's own CV id -> `404 QUESTION_NOT_FOUND`; the `401` matrix for `GET /cvs`, `DELETE`, `PUT draft`, `PUT answer`, `POST dismiss`, `POST apply` with no cookie and with an invalid cookie.
- [ ] T082 [P] [US7] Extend `API/test/logging.e2e-spec.ts` so logs for list, edit, answer, dismiss, apply and delete contain no draft text, answer text, prompt, model output, API key or cookie values (assert on captured log output for a request that includes distinctive sentinel strings).

---

## Phase 9: User Story 6 - Delete a CV (Priority: P2)

**Goal**: The owner deletes a `COMPLETED` or `FAILED` CV after confirming; active generations cannot be deleted.

**Independent Test**: Delete an owned CV through the dialog and see it disappear and show the not-found page; cancel deletes nothing; a processing CV offers no enabled delete and a direct call gets `409`; another user's CV is `404`.

### Tests first (US6)

- [x] T083 [P] [US6] `API/test/cv-delete.e2e-spec.ts` (real PG): `COMPLETED` and `FAILED` CVs deleted -> `204`, the row and its questions are gone (count questions before and after), the CV is absent from `GET /cvs` and `GET /cvs/:id` is `404`; `PENDING` and `PROCESSING` -> `409 CV_GENERATION_ACTIVE` and the CV and questions are intact; another user's and a non-existent id -> identical `404 CV_NOT_FOUND`; delete racing a retry of a `FAILED` CV (parallel) leaves a consistent result (either deleted, or `PENDING` and the delete refused); a second delete of the same id -> `404`.
- [x] T084 [P] [US6] `WEB/src/lib/cv/delete-flow.test.ts`: `canDelete(item)` true only for `COMPLETED`/`FAILED`; the dialog state machine (closed -> confirming -> deleting -> closed on success; error keeps the CV and the dialog open with a message; cancel closes without calling the API; a `409` shows "still generating" and refreshes the list; a `404` is treated as already deleted and refreshes).

### Implementation (US6)

- [x] T085 [US6] `CvService.remove(userId, cvId)` in `API/src/modules/cv/cv.service.ts`: `deleteMany` on `{ id, userId, generationStatus: { in: ['COMPLETED','FAILED'] } }`; one row -> done; zero rows -> ownership gate (`404 CV_NOT_FOUND`) else `409 CV_GENERATION_ACTIVE`. Add `@Delete(':id') @HttpCode(204)` to `API/src/modules/cv/cv.controller.ts`. Questions go through the existing FK cascade.
- [x] T086 [P] [US6] Inspect Figma `2:8680` (07.1 UI kit) for the delete-confirmation dialog and `2:7459` for the card's Delete placement; record copy, button variants (destructive) and focus behaviour.
- [x] T087 [P] [US6] `WEB/src/lib/api/cvs.ts`: `deleteCv(id)` (`DELETE`, `204` handled without JSON parsing, which the fetcher already supports); `WEB/src/lib/cv/delete-flow.ts` (T084).
- [x] T088 [US6] Create `WEB/src/app/cvs/delete-cv-dialog.tsx` (native `<dialog>` with `showModal()`: focus trap and Escape for free, labelled by its title, destructive confirm and a Cancel, pending and error states, focus returns to the card's Delete button) and add the Delete action to `cv-card.tsx` (not enabled for Processing; removes the card and refetches on success).
- [x] T089 [US6] Run: API `tsc`/lint/unit/e2e, web `tsc`/lint/`vitest`/`next build`. Browser check at 320/390/1280 px: dialog usable by keyboard, cancel keeps the CV, confirm removes it, its address shows the not-found page, no Delete on a Processing card.

---

## Phase 10: Polish & verification

**Purpose**: Whole-feature gates, the real-model check, documentation.

- [ ] T090 Full gates on the final tree: `pnpm --filter api test`, `pnpm --filter api test:e2e` (with `ANTHROPIC_API_KEY` unset), `pnpm --filter api exec tsc --noEmit`, `pnpm --filter api lint` (0 warnings), `pnpm --filter api build`, `pnpm --filter web test`, `pnpm --filter web exec tsc --noEmit`, `pnpm --filter web lint`, `pnpm --filter web build`. Record counts.
- [ ] T091 Migration re-verification on the final tree: clean database and a database with 002 data (as T005), including a restart of the API against the migrated database.
- [ ] T092 Browser run (Playwright with the pre-installed Chromium) at 320, 390 and 1280 px over seeded states: every item of quickstart.md section 4 (list states and polling, Failed Try again only when `canRetry`, delete dialog, editor autosave and reload, offline error, two-tab conflict, answer, apply, dismiss, disabled Download PDF), no horizontal overflow, `localStorage` and `sessionStorage` hold no CV content. Record the results.
- [ ] T093 [AI] Real-model checks with `ANTHROPIC_API_KEY` set (manual, never automated): extend `API/test/smoke/anthropic.smoke.ts` with (a) a generation whose output carries a valid `field` for a missing email or date and (b) one AI-assisted apply per scope (bullets, skills, summary-null, contact) asserting the patch passes the schemas and the domain checks; run `pnpm --filter api test:smoke` and record the result. This also closes the still-open 002 smoke test T040 for the generation part. If no key is available, record that explicitly.
- [ ] T094 Code cleanup and scope review: remove dead code left by the replaced read-only result view and old questions component; grep that `OPEN`/`RESOLVED` no longer appear in `API/src`, `API/test`, `WEB/src` (generated Prisma excluded), that no `any`, `@ts-ignore` or unsafe cast was added, that no new dependency or table exists (`git diff --stat` on `package.json`/`pnpm-lock.yaml`/`schema.prisma` shows only the planned changes), and that `Cv.revision` is written only by `CvEditorService.updateDraft` and `ClarificationService.apply`.
- [ ] T095 Create `specs/003-cv-editor-my-cvs/checklists/acceptance.md` mapping AC-001..AC-013 and SC-001..SC-012 to evidence (tests, browser run, smoke), with the fresh-run table, in the format of `specs/002-cv-ai-generation/checklists/acceptance.md`; mark items waiting on T093 as such.
- [ ] T096 Documentation: update `specs/002-cv-ai-generation/contracts/cv-generation-api.md` with a note pointing to `specs/003-cv-editor-my-cvs/contracts/cv-editor-api.md` for the changed `result` shape and question states; add the trade-offs from plan.md (full-document save, additive AI patches, content-only revision, raw-SQL list) to the README follow-ups note in `specs/002-cv-ai-generation/plan.md` ("Project-level follow-ups before final delivery") so the final README repeats them.
- [ ] T097 Update the PR description of olehvitriachenko/ai-cv-builder#2 (feature summary, migration summary, endpoints, test results, deviations from Figma, what remains) and mark the finished tasks `[x]` in this file.

---

## Dependencies & Execution Order

- **Phase 1 -> Phase 2 -> stories.** T003-T005 (schema) block everything; T006-T007 block all e2e work; T010 blocks the web stories.
- **US1** needs T008, T009, T010. **US2** needs T007, T010. US1 and US2 can proceed in parallel.
- **US3** needs US2 (editor shell, revision in the result) and T009. **US4** needs US3 and T002, T065; 4a (T054-T055) can start any time after Phase 2 and is independent of US1-US3; 4b/4c can run in parallel; 4d needs 4a-4c; 4e needs 4d and US2's `saveNow`.
- **US5** needs US2 and US4. **US7** needs the endpoints of US1-US4 (and US6 for delete). **US6** needs the US1 card.
- **Phase 10** needs everything; T093 needs a key.

### Parallel opportunities

- Phase 2: T008, T009, T010 in parallel after T006-T007.
- US1: T011-T014 together; then T019, T020, T021, T024 together; API (T015-T017) in parallel with web (T018-T023).
- US2: T026-T029 together; T034-T039 together after T033; API (T030-T032) in parallel with web.
- US4: 4a (T054-T055), 4b (T056-T057), 4c (T058-T065) are three independent tracks.
- US6 tests (T083, T084) and the Figma task (T086) together.

## Implementation Strategy

- **MVP**: Phases 1-2 plus US1 (list and navigation) and US2 (editing). That already delivers "return later" and manual editing.
- **Then**: US3 (answer, dismiss) -> US4 (apply) -> US5 (hardening) -> US7 (ownership proof) -> US6 (delete) -> Phase 10.
- Every phase ends with typecheck, lint, unit and e2e green and a browser check for UI phases. Stop and report if a task reveals a need for a new table or dependency.

## Notes on task size

Tasks T022 (list page), T040 (editor shell) and T052 (clarification panel) are the largest single units; each is one cohesive file or service with its tests written first in the preceding tasks. If one proves larger than a few hours, split along the seams already listed (T068-T071 are already split into preconditions, deterministic path, AI path and the transaction).
