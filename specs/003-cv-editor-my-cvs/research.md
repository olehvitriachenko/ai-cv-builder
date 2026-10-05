# Research: CV Editor, Clarifications & My CVs

Decisions that shape the plan, each with the alternatives rejected. Evidence comes from the 002 code as merged (`3853a07`) unless stated.

## D-1. Whole-document save with one content revision

**Decision**: `PUT /api/cvs/:id/draft` replaces the draft as a single validated document. `Cv.revision` (int, starts at 0) advances only when the draft changes (edit or apply). The write is `UPDATE ... WHERE id AND "userId" AND "generationStatus" = 'COMPLETED' AND revision = :expected`; a zero-row result is explained by one owned read (`404`, `409 CV_NOT_EDITABLE`, `409 REVISION_CONFLICT`).

**Rationale**: reuses `cvDraftSchema` unchanged (spec FR-010); the compare-and-set is the same technique already used for the generation lifecycle; one statement makes the check and the write atomic, so two parallel saves cannot both win.

**Alternatives**: per-section or JSON-patch endpoints (more contract, more validation paths, no gain at this size); `updatedAt` as the version (clock resolution, bumped by unrelated writes such as retry); ETag/`If-Match` headers (the same idea with worse ergonomics for a JSON client and CORS exposure).

## D-2. Answer and dismiss do not use the revision

**Decision**: they change only a `ClarificationQuestion` row and touch `Cv.updatedAt`, in one transaction that also asserts the CV is owned and `COMPLETED`. They are guarded by the question state (`UNANSWERED|ANSWERED` only).

**Rationale**: the user's own autosave would otherwise race with answering (answering advances the revision, the pending autosave then conflicts with the user's own action). Content integrity is what the revision protects, and answering does not touch content.

**Alternatives**: advance the revision on every write (simple rule, but self-conflicts); separate revision for questions (a second counter for no concrete need).

## D-3. Deterministic apply needs a machine-readable target (`field`)

**Finding**: `ClarificationQuestion` stores `section`, `itemId`, and two free-text strings (`missing`, `question`). Nothing says which value an answer fills (for example the end date of an entry).

**Decision**: add a nullable `field` column (enum `QuestionField`, values prefixed by section: `CONTACT_FULL_NAME`, `CONTACT_EMAIL`, `CONTACT_PHONE`, `CONTACT_LOCATION`, `CONTACT_LINK`, `EXPERIENCE_EMPLOYER`, `EXPERIENCE_TITLE`, `EXPERIENCE_LOCATION`, `EXPERIENCE_START_DATE`, `EXPERIENCE_END_DATE`, `EDUCATION_INSTITUTION`, `EDUCATION_QUALIFICATION`, `EDUCATION_START_DATE`, `EDUCATION_END_DATE`). Generation (prompt v2) sets it only when the answer will be a single plain value for exactly that field. A DB CHECK ties the prefix to `section`; domain validation ties it to the presence of `itemIndex`.

**Rationale**: the spec asks for deterministic application of simple fields. The only alternatives that avoid a column are guessing the field from the Anthropic-written `missing` text (fragile and untestable) or sending every answer to the AI (contradicts the spec and spends tokens on a date).

**Alternatives**: a TEXT column validated in code (loses the DB invariant); a JSON `target` object (harder to constrain, no enum safety); a heuristic classifier on `missing` (rejected as unreliable).

**Cost**: touches 002 generation (schema, prompt, mapper, validation, tests). It is small and listed as its own phase. Existing questions keep `field = NULL`.

## D-4. AI is used only for the rest, and only to produce an additive patch

**Decision**: a question with `field = NULL` is applied through a new port `CvAnswerApplier` (sibling of `CvGenerator`). The request contains: the target scope (section and, for an entry, only that entry's JSON), the question, the answer, and the target role. It never contains the other sections, the source text, or any id. The output is parsed with a per-scope Zod schema:

| Scope | Patch shape | Server applies |
|-------|-------------|----------------|
| `CONTACT` | `fullName, email, phone, location` (nullable), `links[]` | scalar only if currently null; links appended up to 5 |
| `SUMMARY` | `summary` (nullable) | only if the current summary is null |
| `EXPERIENCE` (entry) | `employer, title, location, startDate, endDate` (nullable), `bullets[]` | scalars only if currently null; bullets appended up to 12 |
| `EDUCATION` (entry) | `institution, qualification, startDate, endDate, details` (nullable) | only if currently null |
| `SKILLS` | `skills[]` | appended, de-duplicated, up to 60 |

The path is chosen by the server from `section` + `itemId`; the model never names a path or an operation. A scalar for a non-null field in the output is a validation failure (`would_overwrite`), not an overwrite. After the schema, domain checks reuse `source-matching.ts`: email, phone and full name must be supported by the answer text, and organisation names (`employer`, `institution`) by the answer or the entry's existing text. Bullets, dates, titles and skill wording are governed by the prompt and cannot be proven mechanically (the same documented limit as 002).

**Rationale**: additive-only is the simplest rule that makes "never silently overwrite manual edits" true by construction, and it keeps the AI surface small and testable.

**Alternatives**: AI returns the whole section (can drop or rewrite user text); a JSON-patch from the model (arbitrary paths, rejected by the spec); AI rewrites the summary even when present (would overwrite a possibly manual value; the user can edit it by hand).

## D-5. Apply flow and failure mapping

**Decision**: 1) load the owned CV and the question (`WHERE id AND cvId`), 2) require `COMPLETED` and question `ANSWERED`, 3) require `body.revision == cv.revision` (fast reject), 4) refuse when the target is missing or filled (`TARGET_NOT_APPLICABLE`), 5) compute the new draft (deterministic, or the AI call with at most two attempts of `ANSWER_APPLY_TIMEOUT_MS` = 20 s, the second only for invalid output or a transient provider error), 6) validate the whole resulting draft with `cvDraftSchema` (so caps hold), 7) one transaction: `UPDATE Cv ... WHERE id AND userId AND status = 'COMPLETED' AND revision = :expected` then `UPDATE ClarificationQuestion SET status = 'APPLIED' WHERE id AND cvId AND status = 'ANSWERED'`; if either affects zero rows the transaction is rolled back and the conflict is reported.

| Outcome | Response |
|---------|----------|
| Foreign or missing CV | `404 CV_NOT_FOUND` (same as everywhere) |
| Question not in this CV | `404 QUESTION_NOT_FOUND` |
| CV not `COMPLETED` | `409 CV_NOT_EDITABLE` |
| Question not `ANSWERED` (including a second concurrent apply) | `409 QUESTION_STATE_CONFLICT` |
| Stale revision, before or after the AI call | `409 REVISION_CONFLICT` |
| Target removed, filled, or summary present | `409 TARGET_NOT_APPLICABLE` |
| Provider down, not configured, timeout | `503 AI_UNAVAILABLE` |
| Invalid, unsupported or overwriting output after the retry | `422 APPLY_OUTPUT_INVALID` |

**Why synchronous**: the call is one narrow request. A background job would add a lifecycle (a second state machine) that the spec does not ask for. The user sees a pending state on the card and nothing is stored until validation passes.

## D-6. Question state model and the migration

**Decision**: `QuestionStatus` becomes `UNANSWERED | ANSWERED | APPLIED | DISMISSED`; `answer TEXT NULL` (at most 1000 chars). The migration uses the enum-swap pattern (create the new type, `ALTER COLUMN ... TYPE ... USING` with `OPEN -> UNANSWERED`, `RESOLVED -> APPLIED`, drop the old type). It is used instead of `ALTER TYPE ... ADD VALUE` because a CHECK constraint in the same migration cannot reference a value added in the same transaction. CHECKs: `ANSWERED` implies `answer IS NOT NULL`; `UNANSWERED` implies `answer IS NULL`; `field` prefix equals `section`; `char_length(answer) <= 1000`; `revision >= 0`. `APPLIED` does not require an answer in the CHECK so a hypothetical pre-existing `RESOLVED` row (002 produces none) still migrates.

**Rationale**: the DB guards the invariants the service relies on (rule IX); the old `OPEN`/`RESOLVED` names stay out of the codebase.

**Alternatives**: keep `OPEN`/`RESOLVED` and add booleans (two sources of truth); store state as a string (no DB safety).

## D-7. List query: one raw SQL statement

**Finding**: `candidateName` lives inside the `Cv.draft` JSON; Prisma cannot select a JSON path, and selecting the whole draft transfers up to about 100 KB per CV and forces a Zod parse of every draft on every poll (and one malformed draft would break the whole list).

**Decision**: one parameterised `$queryRaw` using `draft #>> '{contact,fullName}'` and a correlated count of unresolved questions; rows are parsed with a Zod row schema; DTO mapping adds `displayStatus` and `canRetry`.

**Alternatives**: `findMany` plus parsing drafts (simple, heavier, brittle); a denormalised `candidateName` column kept in sync by edit, apply and generation (three write paths to keep consistent, rejected as unneeded state); Prisma `_count` for questions plus a second raw query (two queries instead of one).

## D-8. `canRetry` is server-driven and shares the retry rule

**Decision**: one function `canRetryGeneration(status)` returns true for `FAILED`. The retry operation and the list both call it. Retry's compare-and-set (including the attempts fencing token) is unchanged. No new failure reason and no `retryable` flag is introduced (002 deliberately removed it and nothing in the current code needs it).

**Rationale**: the web client must not assume; today the rule is "FAILED". If the rule becomes stricter (for example a non-retryable reason), the list changes in one place with no web change.

## D-9. No new index

**Decision**: no `(userId, updatedAt)` index. The existing `@@index([userId])` serves the filter; the sort is over a user's own handful of rows.

**Alternatives**: add the composite index now (rule: no speculative indexes). Revisit if profiling shows the sort in a plan.

## D-10. CORS must allow `PUT` and `DELETE`

**Finding**: the browser calls the API cross-origin (`NEXT_PUBLIC_API_URL`, default `http://localhost:3001/api`) with credentials, and `@fastify/cors` 11.3.0 defaults to `methods: 'GET,HEAD,POST'`. A `PUT` or `DELETE` preflight would be rejected, and the feature would work in `inject()` e2e tests but fail in a real browser.

**Decision**: `enableCors({ origin, credentials: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'] })`, with an e2e preflight test. Using `POST` for delete or save would hide the problem but would not be REST.

## D-11. Web editor architecture

**Decision**: the CV page stays a Server Component: it loads the status on the server and, for `COMPLETED`, the result (draft, revision, questions) and passes it as initial data to a client `CvEditor`. The form is React Hook Form with a Zod form schema (strings, empty meaning null) and pure mappers `toFormValues(draft)` and `toDraft(values)`; `useFieldArray` for experience, nested bullets, education and skills. The preview (`CvDocument` in `A4Sheet`) reads `useWatch` values. Saving is a small hook `useDraftAutosave` (a reducer: `idle | dirty | saving | saved | error | conflict`, one request in flight, debounce 1 s, newest values win). Mutations use TanStack Query only where it adds clear value (apply, answer, dismiss, delete, retry, and the list refetch); the autosave loop is its own serialized hook because it needs strict ordering. The list page is a Server Component with initial data feeding a client `CvList` using `useQuery` with `refetchInterval` of 5000 only while any item is `PENDING` or `PROCESSING`.

**Conflict UX**: stop autosave, keep local text, show a banner with **Load latest** (refetch and reset the form) and **Keep my changes** (refetch the revision, then save the local document on it; an explicit user choice, never automatic). A `beforeunload` guard is active while a save is pending or failed.

**Before apply**: the panel flushes the pending autosave, then sends apply with the current revision, then replaces the form values with the returned draft; the form is disabled while the apply is running.

**Alternatives**: global client state (rejected by the frontend rules); per-field save requests (more states, more races); optimistic merge (out of scope).

## D-12. Navigation and landing

**Decision**: `/` redirects an authenticated user to `/cvs` (unauthenticated to `/login`, as before); login and registration go to `/cvs`; `AppHeader` gains a "My CVs" link with an active state (a small client `usePathname` link inside the Server Component header); "Back to home" and "Start a new CV" exits become "Back to My CVs" on the failure and not-found views; the creation screen keeps its own entry from the list ("New CV" button and the empty-state action). The query provider moves from `/cvs/[id]` to `/cvs/layout.tsx` so the list and the editor share one client.

## D-13. Display status lives on the server

**Decision**: the DTO carries `displayStatus` (`PROCESSING | FAILED | DRAFT | COMPLETED`), computed by one pure function from generation status and the unresolved count. The web maps it to a badge and copy; it does not recompute.

**Rationale**: one place to test the mapping; matches the rule that the web never inspects drafts or questions to build a card. The list DTO field is named `status` (like the 002 status resource) rather than `generationStatus`, for one consistent vocabulary across the API.

## Open questions

None that block `/speckit-tasks`. One decision needs the owner's awareness (D-3): this feature changes the 002 generation prompt and output schema to emit `field`. It is deliberately small and isolated in its own phase; the alternative is to apply every answer through the AI.
