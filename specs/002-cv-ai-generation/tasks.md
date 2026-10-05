---

description: "Task list for CV Input and AI Generation Lifecycle"
---

# Tasks: CV Input and AI Generation Lifecycle

**Input**: Design documents from `/specs/002-cv-ai-generation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/cv-generation-api.md](./contracts/cv-generation-api.md), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED (spec "Required Automated Test Coverage", constitution X). Inside each story phase, write the tests first and confirm they fail, then implement (`.claude/rules/testing.md`). **No test ever calls the real Anthropic API**, and the suite must pass with `ANTHROPIC_API_KEY` unset.

**Organization**: Tasks are grouped by user story. Strict TypeScript everywhere: no `any`, no `@ts-ignore`, no casts used as validation; untrusted input (HTTP, multipart parts, model output, database JSON) is `unknown` until Zod parses it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1..US6, mapping to the user stories in spec.md
- Paths are relative to the repository root. `API` = `apps/api`, `WEB` = `apps/web`.

## Decisions these tasks implement exactly (stakeholder review)

1. **Unusable PDF is an ingestion failure.** Wrong type (no PDF signature, including a renamed file), oversize file, or malformed request -> `400 VALIDATION_ERROR`. A file accepted as a PDF whose text cannot be parsed or is unusable (corrupt, password-protected, image-only, empty, below 50 or above 20,000 characters) -> `422 PDF_EXTRACTION_FAILED`. In both cases **no CV is created**. There is no failed-at-creation CV, no `SOURCE_UNREADABLE` / `SOURCE_TOO_LONG` reasons and no `retryable` flag.
2. **One result endpoint**: `GET /api/cvs/:id/result` returns the draft with its clarification questions.
3. **Restart**: at application start every `PROCESSING` row becomes `FAILED` / `INTERRUPTED` (never back to `PENDING`); `PENDING` rows are processed; a 30 s sweep picks up `PENDING` and fails `PROCESSING` older than the 5-minute timeout; every state change is a conditional (compare-and-set) update so a stale or duplicate worker cannot overwrite a terminal state; the owner retries explicitly.
4. **`POST /api/cvs` evolves** into the real generation-start contract; the existing ownership tests move to the new valid request shape (done in US1 so the suite is never red).

## Adjustments to plan.md (small, listed so nothing is silent)

- `GenerationOptions` also carries `transientRetryDelayMs` (default 2000; tests use 0) so the transient-retry pause does not slow tests.
- Until the real adapter exists (US4, second part), `AiModule` provides an interim `CvGenerator` that always throws `NOT_CONFIGURED`. This keeps the app bootable and gives the "no key -> `FAILED` / `PROVIDER_NOT_CONFIGURED`" behavior end to end; the adapter task replaces it.
- User Story 4 is split across two phases to follow the plan's order: first the pure domain rules and result retrieval (Phase 5), then the real Anthropic provider (Phase 7, after the lifecycle in Phase 6).
- E2E files: `cv-input`, `cv-result`, `generation-lifecycle`, `generation-failures`, and the extended `cv-ownership`.


## Backend session: accepted analysis fixes and where they changed these tasks

Applied before implementation (backend phases 1-8 and the backend part of 10 are done; the web phase T042-T051 and T054 are not):

1. **`generationAttempts` is a fencing token.** The claim returns the incremented value; *every* terminal write (completion and failure) matches `generationStatus = 'PROCESSING' AND generationAttempts = <claimed>`. Therefore a retry **does not reset** `generationAttempts` (T035; the contract and data model said "attempts reset" and were corrected).
2. **Clarification questions are inserted only after a successful completion CAS, in the same transaction** (T032).
3. **Async runner rejections are caught and logged** (`kick()`, job tasks, the interval timer) (T033).
4. **Unicode-aware normalization** (NFKC + lower-casing; tokens of letters, digits and marks of any script) (T025).
5. **Proper names are preserved exactly**: stated in the prompt (T038) and reflected in matching: no diacritic stripping.
6. **Acronym and abbreviation heuristics removed** (T025): `MIT` does not match `Massachusetts Institute of Technology`, `Univ.` does not match `University`. The legal-suffix and article rules stay. *Note: spec FR-033 / US4 scenario 7 list "an abbreviation" among accepted reformatting; this is a conscious, stakeholder-accepted gap for now, not an oversight.*
7. **Local token-window matching** for organisations: every significant token must occur within a window of `tokens + 2` source tokens (T025/T026), instead of anywhere in the document. The full-name check uses the same window rule.
8. **Migration via `prisma migrate dev --create-only`, SQL edited, then applied** (T005). **M1:** legacy `Cv` rows are development data and are deleted by the migration; no backfill. Consequently `targetRole`, `sourceType`, `sourceText` and `generationStatus` are `NOT NULL`, and the CHECKs are: `COMPLETED <=> draft`, `FAILED <=> failureReason`, `PROCESSING => processingStartedAt` (the "pending/processing implies sourceText" check is implied by NOT NULL).
9. **Real Anthropic adapter only**; tests override the `CvGenerator` port. The interim `UnconfiguredCvGenerator` of T034 was **never created**. With no key the adapter's `generate` throws `NOT_CONFIGURED` and the app boots (T034, T039).
10. **`CvGenerator` exposes `modelId`** (and, as a small addition, `promptVersion`, so the stored version is the one the generator actually used) (T008, T032).
11. **SDK request timeout**: `ANTHROPIC_TIMEOUT_MS` (default 120000) is set on the client and per request; two attempts fit inside `GENERATION_TIMEOUT_MS` (T003, T039).
12. **Real-API smoke test required before delivery, never automated**: `pnpm --filter api test:smoke` (T040).

---

## Phase 1: Setup

**Purpose**: Dependencies, configuration and test environment the rest relies on.

- [x] T001 In `apps/api`, run `pnpm add unpdf @fastify/multipart` (research D-1, D-2). Confirm both install without build scripts and import under ESM in Node 24.
- [x] T002 Throwaway spike (delete the files afterwards, keep only the notes): in `apps/api`, prove (a) `unpdf` `getDocumentProxy` + `extractText(..., { mergePages: true })` run under **Vitest** and that the `isEvalSupported: false` option is accepted (research D-1: confirm it is forwarded), and (b) `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod` builds an `output_config.format` object from a Zod 4 schema containing nullable strings, arrays and an enum, offline. Record both results as "Verified (T002)" notes under D-1 and D-5 in `specs/002-cv-ai-generation/research.md`. Depends on T001.
- [x] T003 Extend `apps/api/src/config/env.ts` (Zod): `ANTHROPIC_API_KEY` (optional; an empty string is treated as absent), `ANTHROPIC_MODEL` (default `claude-opus-5-5`), `GENERATION_TIMEOUT_MS` (coerced positive integer, default `300000`), `GENERATION_CONCURRENCY` (integer 1 to 10, default `2`), `GENERATION_AUTORUN` (accepts `true`/`false`, default `true`). Add the variables with placeholder values (no secrets) to `apps/api/.env.example`. Add `apps/api/src/config/env.spec.ts` covering the defaults, the empty key becoming absent, and rejection of a non-positive timeout or an invalid autorun value.
- [x] T004 [P] Test environment: in `apps/api/test/setup-env.ts` delete `ANTHROPIC_API_KEY` from `process.env` and set `GENERATION_AUTORUN=false` (SC-008: the suite passes with no AI credential and timers never run in tests); in `apps/api/vitest.config.e2e.ts` set `fileParallelism: false` (lifecycle tests share rows; plan "Test Strategy").

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, shared types and test helpers every story needs.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Data model migration. In `apps/api/prisma/schema.prisma` add enums `GenerationStatus` (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`), `SourceType` (`FREE_TEXT`, `PDF`), `FailureReason` (`PROVIDER_UNAVAILABLE`, `PROVIDER_NOT_CONFIGURED`, `INVALID_OUTPUT`, `TIMED_OUT`, `INTERRUPTED`, `UNKNOWN`; **no** source-related reasons), `QuestionSection` (`CONTACT`, `SUMMARY`, `EXPERIENCE`, `EDUCATION`, `SKILLS`), `QuestionStatus` (`OPEN`, `RESOLVED`). Add to `Cv`: `generationStatus` (not null), `sourceType` (nullable), `sourceText` (text, nullable; "trimmed, 50 to 20,000 characters; always set for new CVs; null only for pre-feature rows"), `failureReason` (nullable), `failureDetail` (text, nullable, "at most 200 characters", safe tokens only), `generationAttempts` (int, default 0), `processingStartedAt` (nullable), `finishedAt` (nullable), `draft` (Json, nullable), `promptVersion` (nullable), `aiModel` (nullable), a `questions` relation, and `@@index([generationStatus, createdAt])`. Add model `ClarificationQuestion` (`id` cuid, `cvId` FK `ON DELETE CASCADE`, `section`, `itemId` nullable, `missing` "at most 300 characters", `question` "at most 300 characters", `status` default `OPEN`, `position` int, `createdAt` default now, `@@index([cvId])`). Generate with `pnpm --filter api prisma:migrate:dev --name cv_generation`, then **edit the generated SQL** so that existing rows are backfilled first (`generationStatus = 'FAILED'`, `failureReason = 'UNKNOWN'`, `finishedAt = now()`) and then add three CHECK constraints: `COMPLETED` implies `draft IS NOT NULL`; `FAILED` implies `failureReason IS NOT NULL` and a non-`FAILED` row has `failureReason IS NULL`; `PENDING` or `PROCESSING` implies `sourceText IS NOT NULL`. Run `pnpm --filter api prisma:generate`. Verify the migration applies to the dev database and (through the e2e global setup) the test database.
- [x] T006 [P] Create `apps/api/src/modules/cv/generation/draft.schema.ts` with the persisted `CvDraft` Zod schema and inferred types, per data-model: `schemaVersion: 1`; `contact` (`fullName` <= 120, `email` <= 254, `phone` <= 40, `location` <= 120, all nullable; `links` <= 5 items each <= 200); `summary` nullable <= 1200; `experience` <= 30 entries (`id`, `employer` <= 200, `title` <= 200, `location` <= 120, `startDate` <= 40, `endDate` <= 40, all nullable; `bullets` <= 12 items each <= 300, non-empty); `education` <= 10 entries (`id`, `institution` <= 200, `qualification` <= 200, `startDate`, `endDate`, `details` <= 300, all nullable); `skills` <= 60 items each <= 60. Invariants: an experience entry has at least one of `employer`/`title`; an education entry has at least one of `institution`/`qualification`; no empty strings (null instead). Add `draft.schema.spec.ts`: accepts a full and a minimal valid draft, rejects each cap exceeded by one, rejects empty strings and entries missing their required pair, allows nulls.
- [x] T007 [P] Create `apps/api/src/modules/ai/llm-cv-output.schema.ts`: the **model-facing**, id-free Zod schema (same sections as `CvDraft` without ids and without the strict caps, all fact fields nullable) plus `questions[]` (`section` enum of the five sections, `itemIndex` integer or null, `missing`, `question`). It must stay within what structured output accepts (verified in T002). Add `llm-cv-output.schema.spec.ts`: accepts valid output with and without questions, rejects a missing section, wrong types and a bad `section` value.
- [x] T008 [P] Create the AI port in `apps/api/src/modules/ai/cv-generator.ts` (**no SDK import**): abstract class `CvGenerator` with `generate(request: CvGeneratorRequest): Promise<unknown>`; `CvGeneratorRequest = { sourceText: string; targetRole: string; feedback?: string[]; signal?: AbortSignal }`; `ProviderError extends Error` with `kind: 'NOT_CONFIGURED' | 'TRANSIENT' | 'REFUSED' | 'BAD_REQUEST'` and an optional safe `detail` (HTTP status or error class name only). Returning `unknown` is deliberate: the validation boundary cannot be skipped.
- [x] T009 [P] Create `apps/api/src/modules/cv/generation/generation.options.ts`: `GENERATION_OPTIONS` DI token, `GenerationOptions = { timeoutMs; concurrency; autorun; transientRetryDelayMs }`, and a factory that builds it from `ConfigService` (`transientRetryDelayMs` default 2000).
- [x] T010 [P] Test helpers under `apps/api/test/helpers/`: `pdf.ts` (builds small valid PDFs at test time with no binary fixtures: a text PDF from given lines, an empty-text PDF, and a helper that returns bytes starting `%PDF-` but corrupt), `multipart.ts` (builds a `multipart/form-data` body and boundary header for `app.inject()` from fields and an optional file part), `fake-cv-generator.ts` (a `CvGenerator` test double with a scripted queue of outputs or errors, an optional gate promise to hold a call in flight, an honored `AbortSignal`, and a call log recording each request's `feedback` but nothing sensitive).
- [x] T011 Update `apps/api/test/helpers/create-test-app.ts` to accept `{ generator?: CvGenerator; generation?: Partial<GenerationOptions> }` and apply them with `overrideProvider` for the `CvGenerator` and `GENERATION_OPTIONS` tokens (defaulting to the fake generator and `{ autorun: false, transientRetryDelayMs: 0 }`). Depends on T008, T009, T010.

**Checkpoint**: Migration applied, schemas and helpers exist; `pnpm --filter api test` and `test:e2e` still pass.

---

## Phase 3: User Story 1 - Start a CV from free text (Priority: P1) 🎯 MVP

**Goal**: A signed-in user submits free text and a target role; the CV is persisted as `PENDING` before any AI work and the response returns at once. The placeholder `POST /api/cvs` evolves into this contract.

**Independent Test**: `POST /api/cvs` with `{ targetRole, sourceText }` returns `202` with a `PENDING` status resource and a stored source; invalid input returns `400` and creates nothing; `GET /api/cvs/:id` returns the status resource.

### Tests for User Story 1 (write first; confirm they fail)

- [x] T012 [P] [US1] Update `apps/api/src/modules/cv/cv.schemas.spec.ts` for the new `createCvSchema`: `targetRole` required, trimmed, 1 to 200 characters (201 rejected); `sourceText` required, trimmed, 50 to 20,000 characters (49 and 20,001 rejected); non-strings rejected; an extra `userId` key is stripped. Keep the `cvIdSchema` tests.
- [x] T013 [P] [US1] Create `apps/api/test/cv-input.e2e-spec.ts` (free-text part, using `registerUser`): (a) valid body returns `202` with exactly the `CvStatus` fields from the contract (`id`, `targetRole`, `sourceType: "FREE_TEXT"`, `status: "PENDING"`, `failureReason: null`, `createdAt`, `updatedAt`, `startedAt: null`, `finishedAt: null`) and **no** `sourceText`, `userId` or `failureDetail`; (b) the database row is `PENDING`, `sourceType FREE_TEXT`, owned by the caller, with the trimmed text stored, and the fake generator was called 0 times (persisted before any AI work); (c) a short table of representative invalid bodies (missing role, blank role, missing text, too-short text, wrong types, empty JSON body, malformed JSON) each returns `400 VALIDATION_ERROR` and the user's CV count is unchanged (exact limits belong to T012); (d) unauthenticated request returns `401`; (e) a `userId` in the body is ignored; (f) `GET /api/cvs/:id` returns the same status resource.

### Implementation for User Story 1

- [x] T014 [US1] Update `apps/api/src/modules/cv/cv.schemas.ts`: replace `createCvSchema` with `{ targetRole: trimmed 1..200, sourceText: trimmed 50..20000 }` (unknown keys stripped) and export a shared `targetRoleSchema` reused by the upload route; keep `cvIdSchema`. Depends on T012.
- [x] T015 [US1] Update `apps/api/src/modules/cv/cv.service.ts`: remove the old `create`; add `createFromText(userId, input)` (creates the row with `generationStatus PENDING`, `sourceType FREE_TEXT`, `sourceText`, `targetRole`, owner from the argument only) and a pure `toStatusResponse(row)` mapping to the contract's `CvStatus` (`startedAt` = `processingStartedAt`, never exposing `userId`, `sourceText` or `failureDetail`). Change `findOwnedOrThrow` to select the status fields; it keeps `WHERE id AND userId` and the same `404 CV_NOT_FOUND` for missing and foreign CVs, and stays the single ownership gate.
- [x] T016 [US1] Update `apps/api/src/modules/cv/cv.controller.ts`: `POST /cvs` with `ZodValidationPipe(createCvSchema)` and `@HttpCode(202)` returning the status resource; `GET /cvs/:id` returns the status resource. Depends on T014, T015.
- [x] T017 [US1] Migrate `apps/api/test/cv-ownership.e2e-spec.ts` to the new contract (decision 4): the `createCv` helper posts `{ targetRole, sourceText }` with a valid 50+ character text and expects `202`; update response-shape assertions to `CvStatus`; remove the cases that only existed for the placeholder (a CV without `targetRole` stored as null, blank-`targetRole` cases, which now live in T013); keep the owner-from-session, read-own, cross-user identical-404, ignored-`userId` (body, query, header), malformed-id `400`, and the identical-401 matrix for both routes. Depends on T016.

**Checkpoint**: A user can start a CV from free text and read its status; the whole suite is green on the new contract.

---

## Phase 4: User Story 2 - Start a CV from an uploaded PDF (Priority: P1)

**Goal**: A signed-in user uploads one PDF (at most 5 MiB) and a target role. Only extracted text is kept; an unusable PDF is rejected at ingestion and creates nothing.

**Independent Test**: A valid text PDF returns `202` `PENDING` with extracted text stored; a renamed non-PDF, an oversize file, both sources or no file return `400`; a corrupt, image-only, empty or over-long PDF returns `422 PDF_EXTRACTION_FAILED`; none of the rejections creates a CV.

### Tests for User Story 2 (write first; confirm they fail)

- [x] T018 [P] [US2] Create `apps/api/src/modules/pdf/pdf-text-extractor.service.spec.ts` using the T010 PDF helpers: a valid text PDF returns trimmed text; bytes starting `%PDF-` but corrupt throw `unreadable`; an empty-text page and text shorter than 50 characters throw `empty`; text above 20,000 characters throws `too_long`; a password-protected case throws `encrypted` (mock `unpdf` with `vi.mock` to throw a `PasswordException`-named error); `hasPdfSignature` is true when `%PDF-` appears in the first 1,024 bytes and false for any other bytes (including a renamed text file). Assert no error message or log contains the document text.
- [x] T019 [P] [US2] Extend `apps/api/test/cv-input.e2e-spec.ts` (PDF part, using the T010 multipart helper against `POST /api/cvs/upload`): (a) valid text PDF plus `targetRole` returns `202` `PENDING`, `sourceType "PDF"`, and the row's `sourceText` contains the PDF's text; (b) `400 VALIDATION_ERROR` (and no CV) for: a text file named `.pdf` sent with `application/pdf`, a file of 5 MiB + 1 byte (error on `file`), both a file and a `sourceText` field (error key `source`, exactly one source is allowed), no file, missing or blank `targetRole`; (c) `422 PDF_EXTRACTION_FAILED` (and **no CV created**: the user's CV count is unchanged) for a corrupt-with-signature PDF, an empty-text PDF, and a PDF whose text exceeds 20,000 characters, each with a safe, distinct message and no `fieldErrors`; (d) unauthenticated upload returns `401`.

### Implementation for User Story 2

- [x] T020 [US2] Create `apps/api/src/modules/pdf/pdf-text-extractor.service.ts` and `pdf.module.ts`: `hasPdfSignature(buffer)`; `extract(buffer)` calls `unpdf` (`getDocumentProxy(new Uint8Array(buffer), { isEvalSupported: false })`, `extractText(..., { mergePages: true })`), trims, and returns the text, or throws a typed `PdfExtractionError` with `kind` `unreadable` (`InvalidPDFException`), `encrypted` (`PasswordException`), `empty`, or `too_long`. Usable text is "trimmed, 50 to 20,000 characters". Never log document content. Depends on T018.
- [x] T021 [US2] Register `@fastify/multipart` in `apps/api/src/app.setup.ts` with `limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 4 }` and `throwFileSizeLimit: false` (oversize is detected from the truncated stream, not a generic error). Depends on T001.
- [x] T022 [US2] Add the upload reader in `apps/api/src/modules/cv/cv-upload.ts`: iterate `request.parts()`, collect the `targetRole` field (validated with `targetRoleSchema`), an optional `sourceText` field, and at most one `file` part into a buffer, noting truncation. Produce `ApiError(400, 'VALIDATION_ERROR', ..., fieldErrors)` for: no file (`file`), a `sourceText` field next to a file (`source`: exactly one source is allowed), a truncated/oversize file (`file`: 5 MB limit), a file without the PDF signature (`file`: only PDF files are accepted), invalid role (`targetRole`). Never trust the file name or declared content type.
- [x] T023 [US2] Add `CvService.createFromPdf(userId, { targetRole, buffer })` in `apps/api/src/modules/cv/cv.service.ts`: call the extractor; map `PdfExtractionError` to `ApiError(422, 'PDF_EXTRACTION_FAILED', <safe message per kind>)` (unreadable, password-protected, no readable text with a note that scanned images are not supported, too long with the 20,000 limit); on success create the row exactly like `createFromText` with `sourceType PDF` and the extracted text. The buffer is discarded when the request ends; the original PDF is never stored. Depends on T015, T020.
- [x] T024 [US2] Add `POST /cvs/upload` to `apps/api/src/modules/cv/cv.controller.ts` (`@Req()` plus `@HttpCode(202)`, authenticated by the global guard before the body is read, no body pipe) using T022 and T023; import `PdfModule` in `apps/api/src/modules/cv/cv.module.ts`. Depends on T021, T022, T023.

**Checkpoint**: Both entry points work; unusable files are rejected without creating anything.

---

## Phase 5: User Story 4 - Validated draft and clarification questions (domain rules and result) (Priority: P1)

**Goal**: Everything that makes a draft trustworthy, independent of any AI call: deterministic grounding checks, structural validation, mapping with stable ids and question references, and retrieval of a persisted result.

**Independent Test**: Unit tests prove the validator rejects fabricated contacts and organisations while accepting reformatted names, and that structural and question rules hold; seeded `COMPLETED` rows return a draft with its questions, and non-completed rows return `409`.

*Phase order note: the Anthropic provider (the other half of this story) comes after the lifecycle, in Phase 7, matching the plan.*

### Tests and implementation for User Story 4 (rules first)

- [x] T025 [P] [US4] Create `apps/api/src/modules/cv/generation/source-matching.spec.ts`, then `source-matching.ts` (pure, no AI, no fuzzy matching). Normalisation: NFKD, strip diacritics, lower-case, `&` to `and`, drop punctuation, collapse whitespace. Tests and code for: email present in the normalised source; phone digits contained in the source's digit string (formatting ignored); links matched ignoring scheme, `www.` and trailing slash; full name token-supported (every name token of 2+ letters appears); organisation names (employers and institutions) **tolerant**: drop legal suffixes (`inc`, `llc`, `ltd`, `gmbh`, `corp`, `corporation`, `co`, `plc`, `sa`, `ag`, `bv`, `limited`, `company`) and articles, expand a small abbreviation list (`univ`, `inst`, `intl`, `tech`), require every remaining significant token in the source token set, or accept an acronym match in either direction. Cases that must pass: "Acme Inc." vs "Acme", "ACME Corporation" vs "Acme Corp", "Univ. of Oslo" vs "University of Oslo", reordered tokens, "MIT" vs "Massachusetts Institute of Technology". Cases that must fail: a name with no counterpart, one missing significant token, a single-token name absent from the source. No literal-substring requirement.
- [x] T026 [US4] Create `apps/api/src/modules/cv/generation/draft-validation.spec.ts`, then `draft-validation.ts` (pure): `validateGeneration(output, sourceText)` returns issues as **rule ids and JSON paths only, never values**. Rules: structure (all sections present, caps and lengths from `draft.schema.ts`, no empty strings or empty entries); questions (at most 10, valid section, `itemIndex` only for `EXPERIENCE`/`EDUCATION` and within range, non-empty `missing` and `question` each at most 300 characters, duplicates removed); contacts via `source-matching` (email, phone, links strict; full name token-supported; location structure-only); employer and institution names via the tolerant check. Tests assert each rule fires, that tolerant variants pass, and that issues never contain draft or source text. Not checked mechanically (documented in the file header): bullets, dates, titles, skills, summary wording. Depends on T025.
- [x] T027 [P] [US4] Create `apps/api/src/modules/cv/generation/draft-mapper.spec.ts`, then `draft-mapper.ts` (pure): converts validated model output into a `CvDraft` (`schemaVersion 1`, unique server-generated ids for every experience and education entry; the model never supplies ids) and question rows (`itemIndex` converted to `itemId`, `position` assigned in order, `status OPEN`). Tests: ids are unique and stable within the draft, a question's `itemId` equals the entry at its index, section-level questions have `itemId` null, order is preserved. Depends on T006, T007.
- [x] T028 [P] [US4] Create `apps/api/test/cv-result.e2e-spec.ts` with **seeded** rows (create CVs through the API, then set state with Prisma; no generator involved): (a) a `COMPLETED` row with a valid `draft` and two `ClarificationQuestion` rows returns `200 { id, status: "COMPLETED", draft, questions }` with questions ordered by `position` and each carrying `id`, `section`, `itemId`, `missing`, `question`, `status`; (b) `PENDING`, `PROCESSING` and `FAILED` rows return `409 GENERATION_NOT_READY` with no draft; (c) a `COMPLETED` row whose stored JSON is invalid returns a generic `500 INTERNAL_ERROR` with no stored content in the body (the database JSON boundary is validated, constitution II); (d) a malformed id returns `400`; (e) the result is identical when fetched twice (reload-safe).
- [x] T029 [US4] Add `CvService.getResult(userId, cvId)` and `GET /cvs/:id/result` (`apps/api/src/modules/cv/cv.service.ts`, `cv.controller.ts`): load through `findOwnedOrThrow`; if the status is not `COMPLETED` throw `ApiError(409, 'GENERATION_NOT_READY', ...)`; otherwise parse the `draft` column with the `CvDraft` schema (T006) and load the questions ordered by `position`, returning `{ id, status, draft, questions }`. One endpoint serves both the draft and the questions. Depends on T006, T015, T028.

**Checkpoint**: The grounding and structure rules are proven in isolation and a stored result can be read back.

---

## Phase 6: User Story 3 - Generation survives reload and never hangs (Priority: P1)

**Goal**: A persisted, reload-safe lifecycle driven by the database: claim, process in the background, terminal states, timeout, restart behavior, explicit retry, no overwrites of terminal states.

**Independent Test**: With the scripted fake generator, a created CV moves `PENDING` -> `PROCESSING` -> `COMPLETED` with the draft and questions stored; failures end `FAILED` with a safe reason; a `PROCESSING` row found at startup becomes `FAILED` / `INTERRUPTED`; a late result cannot overwrite a terminal state; retry works only from `FAILED`.

### Tests for User Story 3 (write first; confirm they fail)

- [x] T030 [P] [US3] Create `apps/api/test/generation-lifecycle.e2e-spec.ts` (autorun off; drive only the CV each test created through `runner.runCv(id)`; the runner is read from the app): (a) persisted before AI: after create the row is `PENDING` and the fake was called 0 times; (b) `PENDING` -> `PROCESSING` -> `COMPLETED` with a gated fake: while the call is held, the row is `PROCESSING` with `processingStartedAt` set and `generationAttempts` 1 and `GET /api/cvs/:id` reports `PROCESSING` (reload-safe read); after release it is `COMPLETED` with `draft`, `finishedAt`, `promptVersion`, `aiModel` set and the status endpoint and `/result` agree; (c) a partial draft plus clarification questions is stored together with `COMPLETED` (questions carry section, `itemId`, `missing`, `question`, status `OPEN`, `position`); (d) invalid output on the first call and valid on the second yields `COMPLETED` after exactly 2 generator calls, and the second call received `feedback` made only of rule ids and paths (no source or draft text); (e) two concurrent `runCv(id)` calls call the generator once.
- [x] T031 [P] [US3] Create `apps/api/test/generation-failures.e2e-spec.ts` (same driving approach): (a) output invalid twice (malformed JSON text, wrong types, missing section, a contact detail absent from the source, an organisation with no counterpart; parameterized) ends `FAILED` / `INVALID_OUTPUT` after 2 calls with `draft` null, no questions, `failureDetail` containing only rule ids and paths (assert it does not contain any substring of the source), and the row otherwise unchanged; (b) transient provider error then success ends `COMPLETED`, transient twice ends `FAILED` / `PROVIDER_UNAVAILABLE`; (c) `NOT_CONFIGURED` ends `FAILED` / `PROVIDER_NOT_CONFIGURED` after 1 call (no retry); (d) `REFUSED` ends `FAILED` / `INVALID_OUTPUT` with detail `refusal` after 1 call; (e) an unexpected thrown error ends `FAILED` / `UNKNOWN` and the response bodies leak nothing; (f) in-process timeout: a tiny `timeoutMs` and a fake that never resolves (but honors the signal) ends `FAILED` / `TIMED_OUT`; (g) stale completion discarded: hold a call, mark the row timed out through `failTimedOut()` (after backdating `processingStartedAt`), release the call, and assert the row stays `FAILED` / `TIMED_OUT` with no draft; (h) `failInterrupted()`: a seeded `PROCESSING` row becomes `FAILED` / `INTERRUPTED` (never `PENDING`), a seeded `PENDING` row is untouched and is then processed by `runCv`; (i) `failTimedOut()` fails a `PROCESSING` row older than the timeout and leaves a recent one alone; (j) `POST /api/cvs/:id/retry` on a `FAILED` row returns `202` `PENDING` with failure fields and timestamps cleared and then `runCv` completes it, including after an `INTERRUPTED` failure; on `PENDING`, `PROCESSING` or `COMPLETED` rows it returns `409 GENERATION_NOT_RETRYABLE`; two quick retries yield exactly one `202` and one `409`.

### Implementation for User Story 3

- [x] T032 [US3] Create `apps/api/src/modules/cv/generation/generation-processor.service.ts`: `run(cv, signal)` performs at most **2 attempts total** (invalid output or a transient provider error): call the `CvGenerator` port with `{ sourceText, targetRole, feedback?, signal }`; parse the `unknown` result with the LLM output schema; run `validateGeneration` with the source; map with `draft-mapper`; then commit in one transaction a conditional `updateMany WHERE id AND generationStatus = 'PROCESSING'` to `COMPLETED` (draft, `finishedAt`, `promptVersion`, `aiModel`) plus the question rows, and discard the result if zero rows matched. Provider errors: `NOT_CONFIGURED` -> `FAILED` / `PROVIDER_NOT_CONFIGURED` (no retry); `REFUSED` -> `FAILED` / `INVALID_OUTPUT` with detail `refusal` (no retry); `BAD_REQUEST` -> `FAILED` / `UNKNOWN`; `TRANSIENT` -> wait `transientRetryDelayMs` then one retry, else `FAILED` / `PROVIDER_UNAVAILABLE`; abort by the deadline -> `FAILED` / `TIMED_OUT`; any other exception -> `FAILED` / `UNKNOWN`. Every failure write is a conditional update `WHERE generationStatus = 'PROCESSING'`. `failureDetail` is built only from safe tokens (HTTP status, error class name, validation rule ids and paths), at most 200 characters. Log only event name, cv id, attempt, outcome and reason (never source, draft, prompt or output). Writing the validated draft to the JSON column goes through a typed mapper, not an assertion. Depends on T006, T007, T008, T026, T027, T030.
- [x] T033 [US3] Create `apps/api/src/modules/cv/generation/generation-runner.service.ts`: `claim(id)` = `updateMany WHERE id AND generationStatus = 'PENDING'` setting `PROCESSING`, `processingStartedAt = now()`, `generationAttempts + 1`, run only if exactly one row changed; `runCv(id)` (claim, run with an `AbortController` deadline of `timeoutMs`, awaited; the deterministic test hook); `kick()` (`setImmediate`, not awaited, a no-op when `autorun` is false); `drain()` (while in-flight jobs < `concurrency` and an oldest `PENDING` row exists, claim and start it, tracked); `failTimedOut()` (`updateMany WHERE generationStatus = 'PROCESSING' AND processingStartedAt < now() - timeoutMs` -> `FAILED` / `TIMED_OUT`); `failInterrupted()` (`updateMany WHERE generationStatus = 'PROCESSING'` -> `FAILED` / `INTERRUPTED` with `finishedAt`, never back to `PENDING`). On `onApplicationBootstrap`, when `autorun`: `failInterrupted()`, then `drain()`, then start a 30 s `setInterval` that runs `failTimedOut()` and `drain()` (timer `unref()`'d); `onModuleDestroy` clears it. Depends on T032.
- [x] T034 [US3] Wire the lifecycle: in `apps/api/src/modules/cv/cv.module.ts` provide `GenerationRunner`, `GenerationProcessor` and the `GENERATION_OPTIONS` factory (T009) and import `AiModule`; create `apps/api/src/modules/ai/ai.module.ts` providing the `CvGenerator` token with an **interim** `UnconfiguredCvGenerator` that always throws `ProviderError('NOT_CONFIGURED')` (replaced in T039); call `runner.kick()` after the transaction in `CvService.createFromText` and `createFromPdf`. Import `AiModule` in `apps/api/src/app.module.ts` if the module graph requires it. Depends on T033.
- [x] T035 [US3] Add retry: `CvService.retry(userId, cvId)` in `apps/api/src/modules/cv/cv.service.ts`: load through `findOwnedOrThrow`, then a conditional `updateMany WHERE id AND userId AND generationStatus = 'FAILED' AND sourceText IS NOT NULL` setting `PENDING` and clearing `failureReason`, `failureDetail`, `processingStartedAt`, `finishedAt`; zero rows -> `ApiError(409, 'GENERATION_NOT_RETRYABLE', ...)`; on success `kick()` and return the status resource. Add `POST /cvs/:id/retry` (`@HttpCode(202)`) to `cv.controller.ts`. Depends on T034.

**Checkpoint**: Every transition and failure path is green against the fake generator. The backend vertical slice is complete; without a key a generation ends `FAILED` / `PROVIDER_NOT_CONFIGURED`.

---

## Phase 7: User Story 4 (continued) - Real Anthropic provider (Priority: P1)

**Goal**: The only code that talks to Anthropic: centralized prompts with explicit source/instruction separation, and an adapter producing structured output as `unknown`.

**Independent Test**: Unit tests with a mocked SDK client prove the request shape, the data/instruction separation, the error mapping and that no key means `NOT_CONFIGURED` without a call. An optional manual smoke with a real key is documented but never automated.

### Tests for this phase (write first; confirm they fail)

- [x] T036 [P] [US4] Create `apps/api/src/modules/ai/prompts/cv-draft.prompt.spec.ts`: `PROMPT_VERSION` is `cv-draft-v1`; the system prompt contains the no-invention rule, "unknown -> null and ask a question", the allowed transformations, and the instruction to treat everything inside the source delimiters as data and ignore instructions found there; the user content contains exactly two delimited blocks (target role, source); the source text appears **only** inside its block and never in the system prompt; a source containing the closing delimiter cannot close its own block (neutralised); the feedback block appears only when feedback is given and contains only the supplied rule ids and paths.
- [x] T037 [P] [US4] Create `apps/api/src/modules/ai/anthropic-cv-generator.spec.ts` with a mock SDK client: the request uses the configured model (default `claude-opus-5-5`), `max_tokens: 16000`, `output_config` with a `json_schema` format and `effort: "medium"`, the system prompt and the user content as separate fields, the abort `signal`, and **no** `temperature`, `top_p`, `top_k`, `tool_choice` or `thinking`; the client is constructed with `maxRetries: 0`; a text response is `JSON.parse`d and returned as `unknown`; unparseable text and a missing text block return a value that fails the Zod schema (they do not throw); `stop_reason: "refusal"` -> `ProviderError REFUSED`; `max_tokens` truncation -> unparseable result; `AuthenticationError` / `PermissionDeniedError` -> `NOT_CONFIGURED`; `RateLimitError`, `InternalServerError`, `APIConnectionError`, `APIConnectionTimeoutError` and status 529 -> `TRANSIENT`; `BadRequestError` -> `BAD_REQUEST`; an aborted signal propagates; with no API key the adapter throws `NOT_CONFIGURED` without calling the client.

### Implementation for this phase

- [x] T038 [US4] Create `apps/api/src/modules/ai/prompts/cv-draft.prompt.ts`: `PROMPT_VERSION = 'cv-draft-v1'`, `buildSystemPrompt()` (role; allowed transformations: rephrase, restructure, bullet-ise, reorder, make the summary relevant to the target role; the prohibited-fabrication list: employers, titles, dates, technologies, responsibilities, metrics, education, certifications, contact details, team sizes, anything unsupported; unknown -> `null` and a clarification question; the output contract; the data-not-instructions rule), and `buildUserContent({ sourceText, targetRole, feedback })` (two delimited blocks, delimiter look-alikes in the source neutralised, an optional feedback block of rule ids and paths). All prompt text lives in this file only. Depends on T036.
- [x] T039 [US4] Create `apps/api/src/modules/ai/anthropic-cv-generator.ts` (the **only** file importing `@anthropic-ai/sdk`) and finish `apps/api/src/modules/ai/ai.module.ts`: an `ANTHROPIC_CLIENT` DI token created from config only when a key is present (`new Anthropic({ apiKey, maxRetries: 0, timeout })`), `AnthropicCvGenerator implements CvGenerator` calling `messages.create` once with `output_config: { format: zodOutputFormat(<LLM output schema>), effort: 'medium' }`, the model from `ANTHROPIC_MODEL`, the prompt module, and the abort signal; check `stop_reason` before reading content; map SDK error classes as in T037. Replace the interim `UnconfiguredCvGenerator` from T034 with this provider. Depends on T037, T038.
- [ ] T040 [US4] **Optional, cut-first, manual only (never automated, never committed with a key):** with a real `ANTHROPIC_API_KEY` in `apps/api/.env`, run quickstart section 4 (free text -> `COMPLETED`, missing facts become `null` plus questions, an injected instruction is ignored) and record what you observed (and any prompt tweak) in `specs/002-cv-ai-generation/research.md` under D-6.

**Checkpoint**: A real generation works end to end when a key is configured; tests still use only the fake.

---

## Phase 8: User Story 5 - Only the owner can see a generation (Priority: P1)

**Goal**: Status, result, retry and upload are private to the owner and indistinguishable from a missing CV for anyone else.

**Independent Test**: User B receives byte-identical `404 CV_NOT_FOUND` for A's CV and for a missing id across status, result and retry; a client `userId` never changes ownership; all new routes reject unauthenticated callers.

- [x] T041 [US5] Extend `apps/api/test/cv-ownership.e2e-spec.ts` (the new routes' enforcement already exists; this proves it and fixes any gap): (a) B requests A's status, `/result` (on a `COMPLETED` seeded row) and `/retry` (on a `FAILED` seeded row), and the same three for a non-existent well-formed id: the six responses are `404 CV_NOT_FOUND` with byte-identical status and body per route pair, and A's row is unchanged after B's retry attempt; (b) a `userId` in the upload form fields, in the query string and in an `x-user-id` header is ignored on create, upload, status, result and retry; (c) extend the identical-401 matrix (no cookie, garbage cookie, expired session, signed-out session) to `GET /cvs/:id/result`, `POST /cvs/:id/retry` and `POST /cvs/upload` (valid bodies; the upload is refused before its body is read). Then review `apps/api/src/modules/cv/cv.controller.ts` and `cv.service.ts`: every route loads the CV through `findOwnedOrThrow` (or, for retry, a conditional update constrained by `userId`), and no handler reads a user id from the body, query, route or headers. Depends on T035.

**Checkpoint**: All API behavior of the spec is in place and proven.

---

## Phase 9: User Story 6 - Minimal screens that show the lifecycle (Priority: P2)

**Goal**: Create form, status page that polls only while work is in progress, a read-only structured result, and failure recovery, all usable at 320 px.

**Independent Test**: At phone width, create a CV from free text and from a PDF, reload during processing, reach the completed and failed screens, and see an extraction failure on the form without navigation.

*Prerequisite before any WEB code*: `apps/web/AGENTS.md` says this Next.js has breaking changes.

- [ ] T042 [US6] In `apps/web`: read the relevant guides in `apps/web/node_modules/next/dist/docs/` first (async dynamic route `params`, `notFound()`, Client Components and `FormData`, forwarding cookies from Server Components, `redirect()`), then run `pnpm add @tanstack/react-query` and `pnpm add -D vitest`, add a minimal `apps/web/vitest.config.ts` and a `test` script (`vitest run`) in `apps/web/package.json`.
- [ ] T043 [P] [US6] TDD the polling policy: create `apps/web/src/lib/cv/poll.test.ts` then `apps/web/src/lib/cv/poll.ts` exporting `pollInterval(status)` returning `2000` for `PENDING` and `PROCESSING`, and `false` for `COMPLETED`, `FAILED` and `undefined` (frontend rule: poll only while in progress, stop on terminal state). Depends on T042.
- [ ] T044 [P] [US6] Update `apps/web/src/lib/api/fetcher.ts` so `apiFetch` accepts a `FormData` body (no JSON `Content-Type`, no `JSON.stringify`, the browser sets the multipart boundary) while keeping its typed JSON behavior, 204 handling and `ApiError` normalisation.
- [ ] T045 [US6] Create `apps/web/src/lib/api/cvs.ts` with Zod schemas mirroring the contract (`CvStatus`, `CvDraft`, `ClarificationQuestion`, `CvResult`) and typed functions `createCvFromText`, `uploadCvPdf` (builds `FormData`), `getCvStatus`, `getCvResult`, `retryCv`; plus `apps/web/src/lib/cv/server.ts` with a server-side `getCvStatusServer(id)` forwarding the incoming cookie (it surfaces `ApiError` so the page can redirect on `401` and call `notFound()` on `404`). Depends on T044.
- [ ] T046 [US6] Create the create-CV screen: `apps/web/src/components/ui/textarea.tsx` (labelled, same error pattern as `TextField`), `apps/web/src/app/cvs/new/page.tsx` (Server Component) and `new-cv-form.tsx` (Client Component, React Hook Form with a Zod schema discriminated by mode): a two-option switch (free text | PDF), the target role (1 to 200), a text area (50 to 20,000) or a file input (PDF only, 5 MB; client-side checks for fast feedback, the server stays authoritative); free text posts JSON, PDF posts `FormData`; on `202` `router.push('/cvs/<id>')`; map `400` field errors onto fields (including `source` and `file`); show a `422 PDF_EXTRACTION_FAILED` message inline **without navigating** (no CV exists); any other failure shows a generic message; submit disabled while pending; mobile-first classes. Depends on T045.
- [ ] T047 [P] [US6] Create `apps/web/src/app/cvs/[id]/cv-draft-view.tsx`: a simple read-only structured layout of the draft (contact, summary, experience with bullets, education, skills) and the open clarification questions as a secondary list (section, the question), semantic HTML, no editing. Depends on T045.
- [ ] T048 [US6] Create `apps/web/src/app/cvs/[id]/query-provider.tsx` (a `QueryClientProvider` scoped to this page, created once per mount; **not** added to the root layout) and `generation-view.tsx` (Client Component): `useQuery` for the status with `initialData` from the server and `refetchInterval` from `pollInterval`; a second `useQuery` for `/result` enabled only when `COMPLETED`; a retry `useMutation` that writes the returned status into the cache; states: in progress (`PENDING`/`PROCESSING`, with `aria-live` text, the page stays responsive), completed (`CvDraftView`), failed (a safe message per `failureReason` for `PROVIDER_UNAVAILABLE`, `PROVIDER_NOT_CONFIGURED`, `INVALID_OUTPUT`, `TIMED_OUT`, `INTERRUPTED`, `UNKNOWN`; a **Retry** button; a "Start a new CV" link); clear loading and error states; no global client state. Depends on T043, T047.
- [ ] T049 [US6] Create `apps/web/src/app/cvs/[id]/page.tsx` (Server Component): await `params`, load the first status with `getCvStatusServer` (`401` -> `redirect('/login')`, `404` -> `notFound()`), render `QueryProvider` + `GenerationView` with it as initial data. Depends on T045, T048.
- [ ] T050 [US6] Add a "Create a CV" link to `apps/web/src/app/page.tsx` (the signed-in view). Depends on T046.
- [ ] T051 [US6] Verify the web app: `pnpm --filter web test`, `exec tsc --noEmit`, `lint` and `build` pass; then walk quickstart section 5 at 320 px and 390 px (mode switch, validation messages, redirect to the status page, reload during processing, completed and failed views, the `422` message on the form, polling stops in the network tab once terminal, no horizontal scroll). Depends on T043, T046, T049, T050.

**Checkpoint**: The whole feature is usable from the browser.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [x] T052 *(API gates done; the web gates and web grep checks belong to T051 and are not done)* Run every API quality gate and fix failures instead of bypassing them: `pnpm --filter api test`, `pnpm --filter api test:e2e` **with `ANTHROPIC_API_KEY` unset** (`env -u ANTHROPIC_API_KEY`), `exec tsc --noEmit`, `lint`, `build` (confirm `node dist/main` starts under ESM with and without a key). Grep checks: no `any`, `@ts-ignore` or lint-disable in `apps/api/src`, `apps/api/test`, `apps/web/src`; `@anthropic-ai/sdk` is imported only in `apps/api/src/modules/ai/anthropic-cv-generator.ts` (and its spec); no `process.env` reads outside `apps/api/src/config` and the existing Prisma service; **logging review**: every `Logger` call in `apps/api/src` logs only event names, ids, attempt counts and reason codes, never source text, draft content, prompts, raw model output, the API key or cookie values. Depends on T041, T051.
- [x] T053 *(done against the built API without a key, sections 2 and 3; section 4 needs the key, see T040)* Walk `specs/002-cv-ai-generation/quickstart.md` sections 2 and 3 against a running API **without a key** (free-text and upload `202`, validation `400` cases, `422` with an unchanged CV count, `FAILED` / `PROVIDER_NOT_CONFIGURED`, retry and `409`, ownership `404`s, the timeout and the restart-`INTERRUPTED` scenarios) and section 4 if T040 was done; record any mismatch with the contract. Depends on T052.
- [ ] T054 Final review and documentation: tick AC-001 through AC-013 and SC-001 through SC-010; confirm constitution V, VI, VII and XIV; confirm the three decisions at the top of this file are reflected in code and tests (no `SOURCE_*` reasons, no `retryable`, one `/result` endpoint, startup `INTERRUPTED`); append to `specs/002-cv-ai-generation/plan.md` a short "Project-level follow-ups before final delivery" list: the README (constitution XVI) must repeat this feature's trade-offs (no queue and single-instance assumption, restart marks work interrupted, mechanical grounding limits, PDFs not stored, in-process PDF extraction, model cost), and full-stack `docker compose up` with `ANTHROPIC_API_KEY` from the environment (constitution XV) remains outstanding. Do not amend the constitution. Depends on T052, T053.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)** then **Foundational (2)** block everything. Within Setup, T002 follows T001; T003 and T004 are independent.
- **Execution order of stories**: US1 -> US2 -> US4 (rules and result) -> US3 (lifecycle) -> US4 (provider) -> US5 -> US6 -> Polish. This follows the plan (ingestion, domain, lifecycle, adapter, web); US3 needs the US4 rules, so they come first.
- **US6 (web)** can start once the API contract is stable (after US3), in parallel with Phase 7 and Phase 8; it works without a key (the failed state shows `PROVIDER_NOT_CONFIGURED`).
- **Polish (10)** depends on all stories.

### Story dependencies

- **US1**: Phase 2. Also leaves the ownership suite green on the new contract.
- **US2**: US1 (reuses the create pattern, status mapping and `targetRoleSchema`).
- **US4 (rules/result)**: Phase 2 (schemas) and US1 (`findOwnedOrThrow`, status mapping).
- **US3**: US4 rules (validator, mapper), US1 and US2 (create paths call `kick()`).
- **US4 (provider)**: US3 module wiring (replaces the interim generator); its unit tests (T036, T037) can start earlier.
- **US5**: US3 (the retry route) and the seeded-row helpers.
- **US6**: US1 to US3 for the API; US4 (provider) is not required.

### Within each story

1. Tests first and failing.
2. Pure code and schemas, then services, then controller/module wiring.
3. Run that phase's unit and e2e files to green before moving on; keep `tsc` and lint clean.

### Parallel opportunities

- Setup: T004 alongside T003.
- Foundational: T006, T007, T008, T009, T010 are independent files; T011 follows T008, T009, T010.
- US1: T012 and T013 together.
- US2: T018 and T019 together.
- US4 rules: T025, T027 and T028 in parallel (separate files); T026 follows T025 (it imports the matching helpers).
- US3: T030 and T031 together.
- US4 provider: T036 and T037 together.
- US6: T043 and T044 together after T042; T047 alongside T046.

### Parallel example: Foundational

```text
T006 apps/api/src/modules/cv/generation/draft.schema.ts
T007 apps/api/src/modules/ai/llm-cv-output.schema.ts
T008 apps/api/src/modules/ai/cv-generator.ts
T009 apps/api/src/modules/cv/generation/generation.options.ts
T010 apps/api/test/helpers/{pdf,multipart,fake-cv-generator}.ts
```

---

## Implementation Strategy

### MVP first

The smallest demonstrable slice is Phases 1 to 3 (free text -> persisted `PENDING` -> readable status). The smallest useful *product* slice is Phases 1 to 6: both inputs, the full reload-safe lifecycle, validation and persistence of the draft and questions against the fake generator, with the no-key path (`FAILED` / `PROVIDER_NOT_CONFIGURED`) working end to end. Phase 7 swaps in the real model; Phase 9 adds the UI.

### Cut-first list (if time runs short; reliability stays, breadth goes)

1. T040 (manual real-key smoke).
2. T043 (web polling unit test; keep the policy function).
3. The acronym rule inside T025 (keep the suffix, punctuation, abbreviation and token-set rules).
4. Nothing in the lifecycle is cuttable: the startup `INTERRUPTED` sweep and the timeout sweep are the spec's required restart and never-stuck behavior and are one statement each.

### Scope guard

Do not add: listing CVs, editing or exporting a draft, answering or resolving clarification questions, OCR, a queue or scheduler dependency, cloud file storage, model fallbacks, per-user rate limits, translation, or separate draft/questions endpoints. If a task seems to need one of these, stop and raise it.

---

## Notes

- Tick a task only after its tests pass and `tsc` and lint are clean for the touched package.
- Commit at story checkpoints with readable messages; keep the migration (T005) in its own commit.
- Constraint wording in tasks is copied from `data-model.md` and `contracts/cv-generation-api.md`; if they ever disagree, those and `spec.md` win.
