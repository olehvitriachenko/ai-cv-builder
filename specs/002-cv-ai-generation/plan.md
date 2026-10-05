# Implementation Plan: CV Input and AI Generation Lifecycle

**Branch**: `002-cv-ai-generation` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-cv-ai-generation/spec.md`

## Summary

A signed-in user starts a CV from **exactly one source** (free text, or a PDF of at most 5 MB) plus a target role. The request is saved first, the response returns at once, and the generation runs in the background inside the API process. The `Cv` row **is** the job: its persisted state (`PENDING` -> `PROCESSING` -> `COMPLETED` | `FAILED`) is moved only by compare-and-set updates, so reloads, restarts, timeouts and double clicks cannot produce stuck, duplicated or overwritten work. The runner sends the source and target role to Anthropic behind a small port/adapter, receives structured output, and runs it through **Zod validation, then deterministic domain validation, then persistence**. Only a validated draft (plus clarification questions for anything missing or vague) is stored. The web app adds a create form, a status page that polls only while work is in progress, a read-only structured result view, and a retry action.

The smallest reliable shape, grounded in what exists:

- **No new infrastructure.** No queue, no scheduler library, no file storage. Two new API dependencies (`unpdf`, `@fastify/multipart`); `@anthropic-ai/sdk`, Zod and Prisma are already installed. Web adds `@tanstack/react-query` (polling only) and `vitest` (one tiny unit test).
- **One migration**: lifecycle, source and draft columns on `Cv`, one `ClarificationQuestion` table, CHECK constraints for the invariants.
- **Three modules** following the existing layout: `pdf` (text extraction), `ai` (Anthropic adapter, prompts, LLM output schema), and the existing `cv` module extended with the generation runner, domain validation and the new endpoints. Anthropic is imported in exactly one file.
- **Reuse, not rebuild**: the ownership gate, auth guard, error filter, validation pipe, config and e2e harness are extended, not replaced.

## Technical Context

**Language/Version**: TypeScript (strict) on Node 24, ESM. API: NestJS 12 + Fastify 5. Web: Next.js 16 / React 19.

**Primary Dependencies**: Existing: `@anthropic-ai/sdk` 0.131, Zod 4, Prisma 7 (`@prisma/adapter-pg`). **New (API)**: `unpdf` ^1.8 (PDF text, ESM, zero dependencies), `@fastify/multipart` ^10 (uploads). **New (web)**: `@tanstack/react-query` ^5; dev: `vitest`. Rationale and alternatives: [research.md](./research.md).

**Storage**: PostgreSQL 17. One new migration. The original PDF is never stored; only extracted text.

**Testing**: Vitest 4. Unit tests for pure domain code; e2e on **real PostgreSQL** with Fastify `inject()`; the Anthropic port replaced by a scripted fake; the SDK client mocked in adapter tests. No real Anthropic calls anywhere in the suite, and the suite runs with no API key configured.

**Target Platform**: Linux/macOS Node server; modern mobile and desktop browsers.

**Project Type**: Web application (pnpm monorepo: `apps/api`, `apps/web`).

**Performance Goals**: Create returns in about 1 s or less (PDF extraction inline is tens of ms to ~2 s for 5 MB). A typical generation is one model call of well under a minute. Polling every 2 s against a single indexed row.

**Constraints**: Constitution and `.claude/rules/*`; no `any`, no unsafe casts; all LLM output validated before persistence; no Redis, broker, microservice, OCR, or cloud file storage; no sampling parameters or forced `tool_choice` (rejected by the target models).

**Scale/Scope**: Take-home scale. Five endpoints, one extended table plus one new table, three backend modules touched, two web pages.

## Constitution Check

*GATE: passes before research; re-checked after design.*

| Principle | Status | How this plan satisfies it |
|-----------|--------|----------------------------|
| I. Product contract | Pass | Delivers PDF or free-text input, target role, structured draft (contact, summary, experience, education, skills), clarification questions, persisted CVs. Editing, export and answers follow in later features |
| II. Strict type safety | Pass | All HTTP input, multipart parts, model output and the database JSON column are `unknown` until Zod parses them. No casts as validation. The one known typing friction (writing a validated object to a Prisma JSON column) is solved with a typed mapper, not an assertion |
| III. Reliability over breadth | Pass | Persist-first, background execution independent of the request, explicit terminal states, timeout, restart recovery, compare-and-set transitions |
| IV. Generation lifecycle | Pass | `PENDING`/`PROCESSING`/`COMPLETED`/`FAILED` in PostgreSQL; explicit, testable transitions; stale `PROCESSING` detected; safe retry; duplicate processing prevented |
| V. Auth and ownership | Pass | Every route is guarded; every read, retry and result goes through `CvService.findOwnedOrThrow` (`WHERE id AND userId`); foreign equals missing; no `userId` input |
| VI. AI transforms, never invents | Pass | Prompt forbids invention and requires `null` + a question; deterministic checks reject unsupported contacts and organisations; questions persisted for the rest. Limits of mechanical checking are documented |
| VII. Structured output validated | Pass | source -> prompt -> Anthropic -> structured response -> Zod -> domain validation -> persistence, with nothing stored on failure |
| VIII. Server-first | Pass | Modular monolith; thin controllers; the CV page is a Server Component with a small client component for polling |
| IX. Database integrity | Pass | Enums, FK with cascade, CHECK constraints for the state invariants (raw SQL in the migration), index only for the real runner query, migration-based |
| X. Critical behavior tested | Pass | Every required test in the spec is mapped in [Test Strategy](#test-strategy) |
| XI. User controls the CV | N/A | Editing is a later feature; the draft is stored as an editable document |
| XII. Simplicity | Pass | No queue, scheduler, repository layer, generic document schema, second PDF library or multi-provider abstraction. The spec tensions that add cost are listed below |
| XIII. Scope | Pass | No editor, export, answers, OCR, job tailoring, list screen |
| XIV. Owned code | Pass | Review gates in the implementation order; every non-obvious decision is in research.md |
| XV. Local reproducibility | Partial | Runs locally with `docker compose up -d postgres` + env vars. Full-stack `docker compose up` is still the project-level follow-up recorded in the previous feature; `ANTHROPIC_API_KEY` is read from the environment and is optional for tests |
| XVI. Documentation | Deferred | This feature adds the trade-offs the final README must repeat (see Trade-offs) |

**Post-design re-check**: unchanged; the only additions are four small dependencies and one migration.

## Project Structure

### Documentation (this feature)

```text
specs/002-cv-ai-generation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── cv-generation-api.md
├── checklists/
│   └── requirements.md
└── tasks.md            # created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   ├── schema.prisma                                   # MODIFY: enums, Cv columns, ClarificationQuestion
│   └── migrations/<ts>_cv_generation/migration.sql     # NEW (+ backfill, CHECKs, index)
├── src/
│   ├── app.setup.ts                                    # MODIFY: register @fastify/multipart
│   ├── config/env.ts                                   # MODIFY: ANTHROPIC_*, GENERATION_*
│   └── modules/
│       ├── pdf/
│       │   ├── pdf.module.ts
│       │   └── pdf-text-extractor.service.ts           # unpdf; PDF signature check; typed errors
│       ├── ai/
│       │   ├── ai.module.ts                            # provides the CvGenerator port + SDK client
│       │   ├── cv-generator.ts                         # PORT (abstract class) + ProviderError kinds
│       │   ├── anthropic-cv-generator.ts               # ADAPTER: the only SDK import
│       │   ├── llm-cv-output.schema.ts                 # LLM-facing Zod schema
│       │   └── prompts/cv-draft.prompt.ts              # PROMPT_VERSION, system prompt, user content
│       └── cv/
│           ├── cv.module.ts                            # MODIFY: imports Pdf/Ai modules, new providers
│           ├── cv.controller.ts                        # MODIFY: POST /cvs, POST /cvs/upload, GET :id, GET :id/result, POST :id/retry
│           ├── cv.service.ts                           # MODIFY: create from source, status, result, retry
│           ├── cv.schemas.ts                           # MODIFY: createCvSchema, upload parsing, id param
│           └── generation/
│               ├── generation.options.ts               # timeout, concurrency, autorun (DI token)
│               ├── generation-runner.service.ts        # claim, run, reconcile, timers, lifecycle hooks
│               ├── generation-processor.service.ts     # attempt loop: generate -> validate -> persist
│               ├── draft.schema.ts                     # persisted CvDraft Zod schema + types
│               ├── draft-mapper.ts                     # LLM output -> CvDraft (ids) + questions (pure)
│               ├── draft-validation.ts                 # domain validation (pure)
│               └── source-matching.ts                  # deterministic normalisation helpers (pure)
├── test/
│   ├── helpers/
│   │   ├── pdf.ts                                      # builds small PDFs at test time (no binary fixtures)
│   │   ├── multipart.ts                                # builds multipart bodies for inject()
│   │   └── fake-cv-generator.ts                        # scripted outputs/errors, optional gate
│   ├── cv-input.e2e-spec.ts                            # create validation (text and PDF)
│   ├── generation-lifecycle.e2e-spec.ts                # transitions, failure, retry, timeout, recovery, result
│   ├── cv-ownership.e2e-spec.ts                        # MODIFY: new create contract + status/result/retry ownership
│   └── helpers/create-test-app.ts, setup-env.ts        # MODIFY: provider overrides; autorun off; no API key
└── vitest.config.e2e.ts                                # MODIFY: sequential files (shared-DB background work)

apps/web/
├── src/
│   ├── app/
│   │   ├── page.tsx                                    # MODIFY: link to "Create a CV"
│   │   └── cvs/
│   │       ├── new/{page.tsx,new-cv-form.tsx}          # NEW: mode switch, role, submit
│   │       └── [id]/
│   │           ├── page.tsx                            # Server Component: first status, redirects
│   │           ├── query-provider.tsx                  # QueryClientProvider scoped to this page
│   │           ├── generation-view.tsx                 # client: polling, states, retry
│   │           └── cv-draft-view.tsx                   # read-only structured result + questions
│   └── lib/
│       ├── api/fetcher.ts                              # MODIFY: accept FormData bodies
│       ├── api/cvs.ts                                  # create/upload/status/result/retry + Zod schemas
│       └── cv/poll.ts (+ poll.test.ts)                 # pure polling policy + its test
├── vitest.config.ts, package.json                      # NEW/MODIFY: vitest, @tanstack/react-query
```

**Structure Decision**: keep the `apps/api` + `apps/web` layout and the existing `modules/<name>` convention. The generation code lives **inside** the `cv` module (it operates on a CV and shares its ownership rules) in a `generation/` folder, while PDF and AI are their own modules because they are replaceable boundaries. Prisma stays infrastructure (no repository layer).

## Design

### 1. Data model changes

Full detail in [data-model.md](./data-model.md). In short: lifecycle (`generationStatus`), `sourceType`, persisted `sourceText` (the only copy of the source), `failureReason` enum + a safe `failureDetail`, `generationAttempts`, `processingStartedAt`, `finishedAt`, the validated `draft` JSON, `promptVersion`/`aiModel`, and a `ClarificationQuestion` table (`section`, `itemId`, `missing`, `question`, `status`, `position`). CHECK constraints enforce: completed has a draft, failed has a reason, pending/processing has a source. **Retry** is a conditional update `FAILED -> PENDING` for the owner (only when a stored source exists, which is true for every CV this feature creates), clearing the failure fields and timestamps. Legacy rows from the previous feature are backfilled to `FAILED`/`UNKNOWN` so none sits `PENDING` forever.

### 2. Background execution

**Mechanism**: a `GenerationRunner` provider inside the API process, driven by the database. No queue, no extra process.

```text
request:   validate -> persist CV as PENDING -> return 202 -> kick() (not awaited)
kick():    drain(): while inFlight < concurrency and an oldest PENDING row exists:
              claim = updateMany(WHERE id AND status=PENDING -> PROCESSING, startedAt=now, attempts+1)
              if claim.count == 1: start runJob(id) (tracked, not awaited)
runJob:    GenerationProcessor.run(cv, deadline)      -> section 4/5
              success: updateMany(WHERE id AND status=PROCESSING -> COMPLETED) + draft + questions (one transaction)
              failure: updateMany(WHERE id AND status=PROCESSING -> FAILED, reason, detail)
timer 30s: failTimedOut(): updateMany(WHERE status=PROCESSING AND startedAt < now - timeout -> FAILED, TIMED_OUT)
           drain(): pick up PENDING (a missed kick, a restart)
startup:   failInterrupted(): updateMany(WHERE status=PROCESSING -> FAILED, INTERRUPTED)
              (the in-flight Anthropic request died with the process; NEVER moved back to PENDING)
           then drain(): existing PENDING rows are processed normally
```

**Lifecycle and failure cases** (the behavior the spec's FR-014 to FR-020 require):

| Situation | What happens |
|-----------|--------------|
| Browser closes or reloads | Nothing: the row is persisted and the job is independent of the request. The next status read shows the true state |
| Normal success | Draft and questions committed with `COMPLETED` in one transaction |
| Provider slow or down | In-process deadline aborts the request (AbortController passed to the SDK) -> `TIMED_OUT`; a transient error gets the single bounded retry, then `PROVIDER_UNAVAILABLE` |
| Provider not configured / invalid key | Immediately `FAILED` / `PROVIDER_NOT_CONFIGURED`; no retry; the API still starts |
| Invalid model output | One automatic retry with violated-rule feedback; then `FAILED` / `INVALID_OUTPUT` and **nothing stored** |
| API restarts or crashes mid-job | The row is left `PROCESSING`. On the next start `failInterrupted()` marks it `FAILED` / `INTERRUPTED` (it is never silently resumed); the user can retry. `PENDING` rows are processed. If a process never restarts, the timeout sweep of any running instance fails the stale row as `TIMED_OUT` |
| Job finishes after being timed out | Its completion compare-and-set matches zero rows and is discarded; `FAILED` is never overwritten |
| Database error while saving the result | Caught; compare-and-set to `FAILED` / `UNKNOWN` if possible, otherwise the sweep fails it as `TIMED_OUT` |
| Two retries or two claimers race | Compare-and-set lets exactly one win; only one generation runs per CV |
| Stale or duplicate worker finishes late | Every terminal write is `WHERE status = PROCESSING`; it matches zero rows and is discarded, so a terminal state is never overwritten |
| Unexpected exception | Caught at the top of `runJob`; `FAILED` / `UNKNOWN`; only the error class is logged |

**Defaults**: `GENERATION_TIMEOUT_MS` 300000 (5 minutes), `GENERATION_CONCURRENCY` 2, sweep every 30 s, timers are `unref()`'d so they never keep the process alive. `GENERATION_AUTORUN=false` disables timers, the startup interruption sweep and the post-create kick (tests).

### 3. PDF ingestion

- `@fastify/multipart` registered once with limits (5 MiB, one file, four fields) and `throwFileSizeLimit: false`; the handler streams the single file part into a buffer and reads the truncation flag, so oversize is reported as our `VALIDATION_ERROR` (`file`), not a generic error.
- Exactly one source: a `sourceText` field next to a file, or no file, is `VALIDATION_ERROR` (`source`/`file`).
- **PDF-only by content**: the buffer must start with the PDF signature (`%PDF-` within the first 1,024 bytes). The file name and declared content type are ignored.
- `PdfTextExtractor.extract(buffer)` calls `unpdf` and returns trimmed text or throws a typed error: `unreadable` (`InvalidPDFException`: the bytes start like a PDF but the structure is corrupt or truncated), `encrypted` (`PasswordException`), or `empty` (no or too little text), or `too_many_pages` (more than 50 pages, checked from the document's page count **before** any text is extracted). Usable means at least 50 usable characters.
- **Two different rejections, neither creates anything** (an ingestion failure, not a generation failure): a file **without the PDF signature** (including a renamed non-PDF), an oversize file or a malformed request is `400 VALIDATION_ERROR` (FR-008). A file **with** the signature whose text cannot be used (`unreadable`, `encrypted`, `empty`, `too_many_pages`, or text outside 50 to 20,000 characters) is `422 PDF_EXTRACTION_FAILED` with a safe message (FR-011). A success saves `sourceText` and creates the CV as `PENDING`. There is no source-less record, no request-time failure reason and no "not retryable" state.
- The buffer lives only for the request. Extracted text is treated as untrusted exactly like free text and never logged. No OCR; image-only PDFs fall into `empty`.
- Hostile-file note: extraction is in-process; the 5 MB limit, the 50-page cap and the 20,000-character cap are the guards (production hardening in Trade-offs). The page cap limits the number of pages processed for text extraction; document parsing and individual pages still have no hard CPU deadline. An isolated worker is not built.

### 4. Anthropic integration

```text
GenerationProcessor ──▶ CvGenerator (port, abstract class)
                           ▲
                  AnthropicCvGenerator (adapter, only file importing the SDK)
                           │ uses
                  ANTHROPIC_CLIENT (DI token)  ◀── tests inject a fake client
```

- **Port**: `generate({ sourceText, targetRole, feedback?, signal }) -> Promise<unknown>`; it throws `ProviderError` with a `kind`: `NOT_CONFIGURED`, `TRANSIENT`, `REFUSED`, `BAD_REQUEST`. Returning `unknown` makes the validation boundary impossible to skip.
- **Adapter**: builds the request with the centralized prompt module, calls `messages.create` once with `output_config: { format: zodOutputFormat(LlmCvOutputSchema), effort: "medium" }`, a request timeout and the abort `signal`, on a client created with `maxRetries: 0` (so the single retry is ours and visible). It checks `stop_reason` (`refusal` -> `REFUSED`, `max_tokens` -> truncated JSON that will fail validation), extracts the text block, `JSON.parse`s it to `unknown`, and returns it. SDK errors are mapped by class: authentication/permission -> `NOT_CONFIGURED`; connection, timeout, rate limit, 5xx and overload -> `TRANSIENT`; 400 -> `BAD_REQUEST` (a bug, logged as `UNKNOWN`). No key -> `NOT_CONFIGURED` without constructing a request.
- **Prompts** (one centralized, versioned module; ai.md rules): system prompt = role, allowed transformations (rephrase, restructure, bullet-ise, reorder, make the summary role-relevant), prohibited fabrication list, "unknown -> null and ask a question", output contract, and the instruction to treat anything inside the source delimiters as data and ignore instructions found there. User message = exactly two delimited blocks: target role and source. Delimiter look-alikes inside the source are neutralised. A retry adds a feedback block of rule ids and paths (no source values). Model default `claude-sonnet-5-5` (env override); thinking is always on for this model, so no `thinking`, no sampling params, and no forced tool choice.
- **Bounded retry** lives in the processor, not the adapter: at most 2 attempts total per run, for invalid output **or** a transient provider error (fixed 2 s pause for transient). Never for not-configured, refusal or bad-request.
- **Logging**: event name, cv id, attempt, outcome and reason code only. Never the prompt, source, raw output or draft.

### 5. Structured CV domain model

The persisted `CvDraft` (versioned JSON: contact, summary, experience, education, skills; entry ids server-generated; nulls for unsupported facts) is defined in [data-model.md](./data-model.md). The model-facing `LlmCvOutputSchema` is deliberately looser and id-free (it must stay within what the structured-output feature accepts); the **strict** caps and invariants live in our own Zod schema and domain validation. `draft-mapper` is a pure function that turns validated model output into `CvDraft` + question rows and assigns ids, so the model cannot invent or collide ids. Writing the validated object to the Prisma JSON column goes through a typed mapper rather than an assertion; reads parse the column with the same Zod schema.

### 6. Clarification questions

Persisted rows (`section`, optional `itemId` pointing at a draft entry, `missing`, `question`, `status` default `OPEN`, `position`), created in the same transaction as `COMPLETED`, at most 10 per CV, deduplicated. A partial draft plus questions is a normal `COMPLETED` result (FR-030). The generation prompt requires a question for each missing, vague or contradictory fact; the domain validator checks that every question names a valid section and an existing entry index. Reads are part of `GET /cvs/:id/result`. **No** answer, update or resolve flow is built; the `RESOLVED` value exists only so the next feature does not need an enum migration.

### 7. Anti-hallucination domain validation

Pure functions in `draft-validation.ts` and `source-matching.ts`, no AI, no fuzzy matching:

1. **Structure** (hard): required sections present, caps on counts and lengths, no empty strings or empty entries, questions valid (section, index, cap). A draft with no summary, experience, education or skills must carry at least one clarification question, otherwise it is rejected as empty (`empty_result`); contact details alone do not count as content.
2. **Contacts** (strict after normalisation): email present in the normalised source; the **full** normalised phone number present as a digit run in the source (formatting ignored; a truncated or partial number is rejected even if its digits occur inside a longer number); links matched ignoring scheme, `www.` and trailing slash; full name token-supported; location structure-only.
3. **Employer and institution names** (tolerant, FR-033): normalise (NFKD, lower-case, strip punctuation, `&` to `and`), drop legal suffixes and articles, expand a small abbreviation list, then require every significant token to appear in the source's tokens, or accept an acronym match in either direction. Order, punctuation, suffix and abbreviation differences are accepted; a name with no counterpart is rejected. Never literal substring containment.
4. **Not checked**: bullets, dates, titles, skills and summary wording. These rely on the prompt contract and on clarification questions.

On any failure the issues are reported as **rule ids and JSON paths only**; they drive the single retry's feedback and the safe `failureDetail`.

### 8. API

Defined in [contracts/cv-generation-api.md](./contracts/cv-generation-api.md): `POST /api/cvs` (free text, JSON, 202), `POST /api/cvs/upload` (PDF, multipart, 202), `GET /api/cvs/:id` (status), `GET /api/cvs/:id/result` (draft + questions, 409 until completed), `POST /api/cvs/:id/retry` (202, 409 when not `FAILED`); `POST /api/cvs/upload` also has a `422 PDF_EXTRACTION_FAILED` outcome. Ownership always comes from `@CurrentUser()`; every read, result and retry loads through `CvService.findOwnedOrThrow`, and retry additionally constrains its update by `userId` and status. Controllers stay thin. `GET /api/cvs/:id/result` is the single endpoint for the draft **and** its clarification questions. `POST /api/cvs` **evolves** from feature 001's placeholder into the real generation-start contract; there is no compatibility requirement yet, so the old empty-CV behavior is not preserved and the existing ownership tests move to the new request shape (Complexity Tracking).

### 9. Frontend

- `/cvs/new`: a two-option switch (free text | PDF), the target role, submit. React Hook Form + Zod with a discriminated schema by mode; PDF type and 5 MB checked client-side for fast feedback, server authoritative. Text posts JSON; PDF posts `FormData` (the typed `apiFetch` gains FormData support). On `202` go to `/cvs/{id}`.
- `/cvs/[id]`: a Server Component loads the first status (forwarding the cookie; `401` -> login, missing -> `notFound()`), and renders a client `GenerationView` inside a `QueryClientProvider` **scoped to this page only**. TanStack Query polls status every 2 s only while `PENDING`/`PROCESSING`, stops on a terminal state, fetches the result once on `COMPLETED`, and retries through a mutation that writes the new status into the cache. Failed state shows a safe message per `failureReason`, a Retry button and a "Start a new CV" link. The create form shows a `422 PDF_EXTRACTION_FAILED` message inline (no CV exists, no navigation). The completed view is a simple read-only layout of the draft sections and the open questions. Reload shows the same state because it is server state. 320 px checked manually. The `/` page links to "Create a CV". There is no CV list.
- Rules honoured: Server Components by default, small client components, no global state, polling stops on terminal state, loading/failure states shown. Read `apps/web/AGENTS.md` and the bundled Next.js docs before writing web code (dynamic route params are async in this version).

### Test Strategy

Real PostgreSQL, real Nest app, `inject()`; the Anthropic port replaced by a **scripted fake** (a queue of outputs and errors, optionally gated on a promise to hold a job in `PROCESSING`); SDK client mocked only in adapter tests; no real network. Background work is driven deterministically: autorun is off in tests and the runner exposes `runCv(id)` (claim and run one specific CV, awaited), `failTimedOut()` and `failInterrupted()`. Because lifecycle tests touch shared rows, **e2e files run sequentially** and each test drives only the CV it created.

| Spec requirement | Test | Level |
|------------------|------|-------|
| Free text + role accepted; PDF + role accepted | `cv-input` | e2e |
| Neither, both, missing/blank/over-long role, bad/short/long text | `cv-input` (representative rows; exact limits in schema unit tests) | e2e + unit |
| Non-PDF, renamed non-PDF, oversize file rejected | `cv-input` | e2e |
| Persist before AI; response returns before generation | `generation-lifecycle` (fake gated; assert `PENDING` row exists first) | e2e |
| `PENDING` -> `PROCESSING` -> `COMPLETED`, draft persisted | `generation-lifecycle` | e2e |
| Failure -> `FAILED` with safe reason; no draft | `generation-lifecycle` | e2e |
| Reload/status fetch observes persisted state | `generation-lifecycle` (read at each stage) | e2e |
| `PROCESSING` found at startup becomes `FAILED` / `INTERRUPTED` (never `PENDING`); a `PENDING` row is processed; stale `PROCESSING` past the timeout fails | `generation-lifecycle` (`failInterrupted`, `failTimedOut` on seeded rows; then a retry succeeds) | e2e |
| In-process timeout -> `TIMED_OUT`; late result discarded | `generation-lifecycle` (fake never resolves, tiny timeout) | e2e |
| Retry only from `FAILED`; single run on double retry; a late result cannot overwrite a terminal state | `generation-lifecycle` | e2e |
| PDF extraction success; corrupt/encrypted/empty/image-only -> controlled failure | `pdf-text-extractor` (built PDFs; `unpdf` mocked for the password case) | unit |
| Unusable PDF (signature present but corrupt, encrypted, empty or over-long text) -> `422 PDF_EXTRACTION_FAILED` and **no CV created** (row count unchanged); a file with no PDF signature, an oversize file, or both sources -> `400` and no CV | `cv-input` | e2e |
| Valid output accepted and stored; questions persisted with section/item/text; partial draft + questions | `generation-lifecycle` | e2e |
| Malformed/wrong-typed/incomplete output rejected; retry once; then `FAILED`; no stored draft | `generation-lifecycle` + `llm-cv-output.schema` | e2e + unit |
| Invalid output never changes stored CV data | `generation-lifecycle` (row unchanged apart from the failure fields) | e2e |
| Contact not in source rejected; name with no counterpart rejected; reformatted name (case, punctuation, legal suffix, abbreviation, acronym) accepted | `draft-validation`, `source-matching` | unit |
| Prompt keeps source in the data block, system prompt has the ignore rule, delimiters neutralised | `cv-draft.prompt` | unit |
| Adapter: request shape, no sampling params, `maxRetries: 0`, error mapping, refusal, truncation, missing key | `anthropic-cv-generator` (mock client) | unit |
| Provider not configured -> `FAILED`, no secret leaked | `generation-lifecycle` | e2e |
| Ownership: foreign status/result/retry identical to missing; `userId` ignored; unauthenticated 401 | `cv-ownership` | e2e |
| No real Anthropic call; suite passes with no key | `setup-env` unsets the key; the fake is the default provider in tests | e2e |
| Polling stops on terminal state | `poll.test` | web unit |

Existing tests in `cv-ownership.e2e-spec.ts` are migrated to the new create contract (a helper creates CVs from free text).

### Implementation Order

Vertical slice early: after step 4 the whole backend lifecycle works against a fake generator; step 5 swaps in the real adapter; step 6 adds the UI.

0. **Prep and spikes** (~0.5 h): add `unpdf` and `@fastify/multipart`; confirm `unpdf` imports and extracts under Vitest; confirm `zodOutputFormat` produces an accepted schema from `LlmCvOutputSchema` offline; extend env + `.env.example`.
1. **Foundation / data model** (~0.75 h): Prisma schema + migration (backfill, CHECKs, index); draft and LLM output Zod schemas and types; schema unit tests.
2. **Ingestion and create** (~1.5 h): multipart registration, `PdfTextExtractor` + tests, input schemas, `CvService` create (persist `PENDING`, or `FAILED` for unusable PDFs), `POST /cvs`, `POST /cvs/upload`, `GET /cvs/:id` as status, migrate the existing ownership tests, `cv-input` e2e. *Checkpoint: create and read status work, no AI yet.*
3. **Pure domain** (~1.5 h): `source-matching`, `draft-validation`, `draft-mapper` with unit tests (the largest unit block).
4. **Generation lifecycle** (~2 h): options/DI, `GenerationProcessor` (attempt loop), `GenerationRunner` (claim, run, timeout sweep, startup interruption), `result` and `retry` endpoints, fake generator, lifecycle e2e. *Checkpoint: every transition and failure path green with the fake.*
5. **Anthropic adapter** (~1.25 h): prompt module + tests, `AnthropicCvGenerator` + mock-client tests, `AiModule` wiring, optional manual smoke with a real key (not automated).
6. **Web** (~2 h): deps, `apiFetch` FormData, API functions and schemas, create form, status page with polling, result view, retry, home link, poll test, manual 320 px check.
7. **Polish** (~0.75 h): log review, quickstart walk, gates (`tsc`, lint, unit, e2e, build, web), diff review against the spec.

**Cut-first list if time runs short** (reliability stays, breadth goes): the web polling unit test; the acronym rule in name matching; the manual real-key smoke. (The startup interruption sweep stays: it is the spec's required restart behavior, and it is one statement.)

### Trade-offs

- **Why no Redis or queue**: one API process and a handful of users; the database already gives durable state and atomic compare-and-set, which is all a queue would add here. A broker brings a new process to run, monitor and secure for no reliability gain at this scale, and the constitution (XII) forbids unjustified infrastructure.
- **Single local API process**: the runner lives in that process and `kick()` is an immediate nudge; the 30 s timer is the safety net. Concurrency is capped (default 2) to protect the provider rate limit and memory.
- **On API restart**: queued (`PENDING`) work is picked up at startup. Jobs that were `PROCESSING` are marked `FAILED` / `INTERRUPTED` immediately, because their in-flight Anthropic request died with the process and silently re-running it could duplicate cost and hide the interruption; the user retries explicitly. The rule assumes a single instance (with several it would fail another instance's live job). On a graceful shutdown (`enableShutdownHooks`), the runner enters a stopping state: it claims and starts nothing new (including the follow-up drain after a job finishes), cancels in-flight calls, and a result that resolves after cancellation is never persisted; the cancelled rows are handled exactly like a crash at the next start.
- **Production hardening (not done)**: lease/heartbeat for multi-instance recovery; a real queue (pg-boss or a broker) when throughput or retries need it; extracting PDFs in a worker thread or subprocess with a timeout; per-user rate limits and daily generation caps; refusal fallbacks and model fallbacks; streaming for very long outputs; encrypting `sourceText` at rest or a retention/deletion policy; structured metrics and alerting; a stricter skills/bullet grounding pass if warranted; translation and non-English prompts.
- **Why original PDFs are not persisted**: FR-012 and privacy. The extracted text is the only needed input, for generation and for retry. Storing files would add storage, cleanup, malware and retention concerns for no benefit. The cost is that an unreadable PDF has to be re-uploaded; since the request is rejected at ingestion, nothing is stored and the user simply uploads a better file.
- **Limits of mechanical hallucination detection**: the deterministic checks catch fabricated contact details and organisations, which are the most damaging inventions, and tolerate legitimate reformatting. They cannot prove that a bullet, a date, a title, a skill or a metric is faithful; the prompt contract and clarification questions carry that. Token-set name matching can in principle accept a different organisation whose name tokens all appear in the source (rare for a user's own text). The user can edit everything, so the draft is a proposal, not a record.

### Decisions Applied During Backend Implementation (analysis fixes)

These supersede any conflicting text above; details are in [research.md](./research.md) and the header of [tasks.md](./tasks.md).

1. `generationAttempts` is a **fencing token**: terminal writes match status and token; retry never resets it; questions are inserted only after a successful completion CAS, in the same transaction.
2. Runner promise rejections are caught and logged; shutdown aborts in-flight calls and leaves the rows for the startup sweep.
3. Matching is **Unicode-aware**, keeps **proper names exact**, has **no acronym/abbreviation heuristics**, and uses **local token windows** for organisations (spec FR-033's "abbreviation" example is deliberately unsupported for now).
4. Migration created with `migrate dev --create-only`, SQL edited, then applied. **M1:** legacy placeholder `Cv` rows are deleted; new generation fields are `NOT NULL`.
5. **Real adapter only**; tests override the `CvGenerator` port; no interim generator. `CvGenerator` exposes `modelId` (and `promptVersion`). SDK request timeout (`ANTHROPIC_TIMEOUT_MS`). Missing key reports `NOT_CONFIGURED` without crashing the app.
6. A real-API smoke test is required before delivery and is manual only (`pnpm --filter api test:smoke`).

### Decisions Applied Before Tasks (stakeholder review)

1. **Unusable PDF** is an ingestion failure: `422 PDF_EXTRACTION_FAILED`, no CV created. Invalid type, size or request is `400`. The source-less failed CV, the request-time failure reasons and the `retryable` flag are gone from the spec, data model, API and tests.
2. **One result endpoint**: `GET /api/cvs/:id/result` returns the draft and its clarification questions; no separate endpoints until a concrete need appears.
3. **Restart**: `PROCESSING` -> `FAILED` / `INTERRUPTED` at startup, never back to `PENDING`; retry is explicit; the 30 s sweep picks up `PENDING` and fails `PROCESSING` past 5 minutes; all with conditional updates so a stale worker cannot overwrite a terminal state.
4. **`POST /api/cvs`** evolves from the placeholder to the real contract; ownership tests move to the new shape.

Still worth knowing (no action needed): FR-036 collapses into the compare-and-set rule (a retry exists only after `FAILED`), and FR-033 name matching is the one rule that can reject valid output; its tolerance is deliberate and the escape hatch is a lenient mode, not more matching code.

## Complexity Tracking

> No constitution violations to justify. Items below are deliberate deviations or additions worth knowing about.

| Item | Why | Simpler alternative rejected because |
|------|-----|--------------------------------------|
| `POST /api/cvs` and `GET /api/cvs/:id` evolve from the 001 placeholder | A CV must have a source and a lifecycle; the empty create existed only for ownership tests and there is no public compatibility requirement | Keeping a source-less CV would need a fifth "no generation" state and ambiguous behavior |
| Raw SQL CHECK constraints in the migration | Prisma cannot express them; they protect the lifecycle invariants at the database | Application-only checks cannot stop a bad write from any other path (constitution IX) |
| Four small dependencies (`unpdf`, `@fastify/multipart`, `@tanstack/react-query`, `vitest`) | Each is the single, checked choice for its job | Hand-rolled PDF parsing, multipart parsing and polling are riskier and larger |
| E2E test files run sequentially | Background work touches shared rows; scoped `runCv(id)` still leaves sweeps global | Per-file databases would add harness complexity for a few seconds saved |
| Startup interruption sweep assumes one API instance | Gives an immediate, explicit outcome after a restart | A lease/heartbeat is the multi-instance answer and is listed as production hardening |

## Project-level follow-ups before final delivery

Recorded at the final review (T054); none of these belongs to this feature's code.

1. **Real-Anthropic smoke test (T040)**: run `ANTHROPIC_API_KEY=... pnpm --filter api test:smoke` and record the outcome. It is the only evidence for the real model's compliance with "null plus a question", name preservation and the injection rule (AC-008, AC-010, SC-006), and for the real request shape.
2. **README (constitution XVI)** must repeat this feature's trade-offs: no queue and a single-instance assumption; a restart marks in-flight work `INTERRUPTED` instead of resuming it; the limits of mechanical grounding checks (bullets, dates, titles and skills are not verified); original PDFs are not stored and text is extracted in-process; model cost and the 5-minute generation limit.
3. **Full-stack `docker compose up` (constitution XV)** with `ANTHROPIC_API_KEY` from the environment is still outstanding (the compose file only runs PostgreSQL).
4. **Spec wording**: FR-033 and US4 scenario 7 name "an abbreviation" as accepted reformatting, but abbreviation and acronym heuristics were removed; either amend the spec or bring a safe heuristic back.
5. **Next features**: the document-first editor with manual editing, answering and applying clarification questions, PDF export, and a CV list. The completed view is read-only until then.
6. **Feature 003 trade-offs** (the final README must repeat them): the editor saves the whole draft in one request (optimistic concurrency on one `revision` integer, no merging, last writer is told to reload or explicitly keep their changes); AI-assisted answers are additive, section-scoped patches that never rewrite existing text, and a question with a known field is applied without any AI call; `revision` changes only on draft edits and applies, so answering or dismissing a question never causes an edit conflict; the My CVs list is one raw SQL query (candidate name and open-question count computed in the database) instead of Prisma relations, and has no paging.

The constitution was not amended.

