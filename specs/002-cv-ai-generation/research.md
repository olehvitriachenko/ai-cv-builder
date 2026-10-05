# Research: CV Input and AI Generation Lifecycle

All technical-context unknowns are resolved below. No `NEEDS CLARIFICATION` remains.

## Repository findings (inspected 2026-10-05)

- The CV foundation exists: `Cv` (id, `userId` FK cascade, nullable `targetRole`, timestamps), `CvService.findOwnedOrThrow(userId, cvId)` as the single ownership gate (`WHERE id AND userId`, same 404 for foreign and missing), a global default-deny auth guard with `@Public()`, `ApiError` + one narrow exception filter, `ZodValidationPipe`, validated env config, and an e2e harness on real PostgreSQL using Fastify `inject()` with `registerUser` / `loginUser` helpers.
- `POST /api/cvs` currently creates a bare CV (optional `targetRole`, returns 201) and `GET /api/cvs/:id` returns `{ id, targetRole, createdAt, updatedAt }`. The previous spec marked this operation as existing only to establish ownership.
- `@anthropic-ai/sdk` 0.131.0 is already a dependency; `zod` 4.6.5; Prisma 7 + `@prisma/adapter-pg`; Vitest 4; `@react-pdf/renderer` (for the later export feature, not used here).
- The web app has Server Components, React Hook Form + Zod, a typed `apiFetch` (JSON only), and **no** TanStack Query or test runner yet.
- Runtime: Node 24, ESM (`"type": "module"`, `module: nodenext`), pnpm 11.

## Decisions

### D-1 PDF text extraction: `unpdf`

- **Decision**: Add exactly one dependency, `unpdf` ^1.8, and call it with `getDocumentProxy` + `extractText(..., { mergePages: true })`.
- **Evidence (checked, not assumed)**:
  - npm metadata: ESM (`"type": "module"`), MIT, **zero dependencies**, 2.5 MB installed, published 2026-08-13 (actively maintained, part of the unjs ecosystem), `engines.node >= 22` (repo runs Node 24). Its only peer, `@napi-rs/canvas`, is declared **optional** and is needed only for rendering pages to images, which this feature never does.
  - Spike in a scratch directory outside the repo, Node 24 ESM: a text PDF extracted to `"Jane Doe - Backend Engineer\nAcme Corp, 2019-2023: built APIs"` in ~50 ms; a page with no text returned `""`; corrupt, truncated and random bytes all threw `InvalidPDFException`. So "unusable text" and "not a real PDF" are two cleanly separable outcomes.
  - It bundles a serverless build of pdf.js, so there is no worker or font configuration to manage in Nest.
- **Alternatives considered**:
  - `pdf-parse` 2.4: ESM and maintained-ish, but pulls `pdfjs-dist` **and** native `@napi-rs/canvas` as hard dependencies, last release Oct 2025. The 1.x line most tutorials use is abandoned.
  - `pdfjs-dist` directly: the engine under both, but needs Node >= 22.13, worker/font setup and a hand-written text-joining step; `unpdf` is that wrapper.
  - `pdf2json`: a different parser that returns positioned glyph runs as JSON, so line reconstruction would be our code.
- **Rule**: no second PDF library, ever, for this feature. Verify in the first task that `unpdf` also imports and runs under Vitest (same check we did for Argon2).
- **Safety notes**: pass `isEvalSupported: false` to pdf.js (it is the documented setting for untrusted PDFs; confirm the option is forwarded by `getDocumentProxy` when implementing). Extraction runs in-process (see D-9 for the accepted risk).

### D-2 File upload transport: `@fastify/multipart`

- **Decision**: Add `@fastify/multipart` ^10 (CommonJS, Fastify 5 compatible, MIT, published 2026-10-04) registered in `configureApp`, with `limits: { fileSize: 5 MiB, files: 1, fields: 4 }` and `throwFileSizeLimit: false` so an oversize file is detected through the stream's truncation flag and reported as our own `400 VALIDATION_ERROR` ("PDF must be 5 MB or smaller") instead of a generic body error.
- **Rationale**: it is the standard Fastify route and Nest's Fastify adapter documents it. The plugin parses lazily (only when the handler iterates parts), and the global auth guard runs before the handler, so an unauthenticated upload body is never read.
- **Alternatives**: base64 inside JSON (+33% size, defeats the size limit's meaning, no streaming); a hand-written multipart parser (security-sensitive code we should not own).
- **Two routes, not one**: free text is JSON and PDF is multipart. One route would need content negotiation and would run Zod before the handler (the pipe would reject the empty multipart body). Two routes match the spec's two "start generation" operations and keep each validation path simple.

### D-3 Where PDF extraction runs, and why the PDF is never stored

- **Decision**: Validate and extract **inline in the upload request**, then persist only the extracted text; discard the file bytes when the request ends.
- **Rationale**: FR-012 forbids retaining or externally storing the file. Extracting later (in the background) would require holding the bytes somewhere between request and worker. A <= 5 MB extraction takes tens of milliseconds to a couple of seconds, so it fits the "returns promptly" requirement (SC-001) and keeps the background worker free of any file handling.
- **Consequence**: unreadable or over-long extraction is known at request time and is an **input** failure, not a generation failure. A file without the PDF signature (for example a renamed non-PDF), an oversize file or a malformed request is `400 VALIDATION_ERROR`; a file accepted as a PDF whose text cannot be parsed or used (corrupt, encrypted, empty, over-long) is `422 PDF_EXTRACTION_FAILED`. Neither creates a CV, so there is no source-less record, no request-time failure reasons and no "not retryable" state.
- **Alternatives**: store the file in the database or on disk (rejected by FR-012 and adds cleanup/privacy work); extract in the worker (needs temporary storage).

### D-4 Background execution: DB-backed in-process worker

- **Decision**: The `Cv` row itself is the job. A `GenerationRunner` service in the API process:
  1. is kicked (not awaited) right after the create/retry request commits `PENDING`;
  2. claims work with a **compare-and-set** `updateMany({ where: { id, generationStatus: 'PENDING' }, data: { PROCESSING, processingStartedAt, attempts + 1 } })` and proceeds only if exactly one row changed (so two claimers can never run the same CV);
  3. runs the pipeline with an in-process deadline (`AbortController`);
  4. finishes with another compare-and-set (`WHERE generationStatus = 'PROCESSING'`), so a result arriving after the job was timed out or failed is discarded and can never overwrite `FAILED`;
  5. has a periodic loop (every 30 s) that picks up `PENDING` rows (covers a missed kick or a restart) and **fails** `PROCESSING` rows older than the timeout;
  6. on application start, marks every `PROCESSING` row `FAILED` (`INTERRUPTED`): the in-flight Anthropic request was lost with the process, so the job is not silently resumed; the user can retry explicitly. `PENDING` rows are processed normally.
- **Rationale**: it needs no new infrastructure, survives reloads and restarts because the state lives in PostgreSQL, and each step is one typed Prisma statement (no raw SQL, no `SKIP LOCKED`). The compare-and-set also makes it safe if a second API process is ever started.
- **Alternatives**: Redis/BullMQ, pg-boss, RabbitMQ (new infrastructure, explicitly forbidden or unjustified at this scale); `@nestjs/schedule` cron (adds a dependency for a `setInterval`); fire-and-forget promise from the request with no persisted state (loses work on restart, violates FR-015/FR-017).
- **Known limit**: the startup "fail every `PROCESSING` row" rule assumes one API process (documented trade-off, see the plan). With several instances it would fail another instance's live job and should become a lease/heartbeat.

### D-5 Anthropic integration: port + adapter, structured output, one retry

- **Decision**:
  - A small port (`CvGenerator`) is the only thing the generation pipeline sees. `AnthropicCvGenerator` is the only code that imports the SDK. It receives the SDK client through a DI token, so tests inject a fake client.
  - Structured output uses `output_config.format` built with the SDK's `zodOutputFormat(schema)` helper, passed to `messages.create` (the SDK documents that it can be passed to `.create()` without auto-parsing). The adapter reads the text block, `JSON.parse`s it into `unknown`, and returns it to the pipeline, which runs **our own** Zod validation. We deliberately do not use `messages.parse()`: its automatic parsing would hide the boundary the constitution requires us to own.
  - The client is created with `maxRetries: 0` and a per-request timeout; the pipeline owns the single bounded retry (the SDK's default of 2 hidden retries would break "at most one retry").
  - Default model `claude-opus-5-5`, overridable with `ANTHROPIC_MODEL`.
- **Constraints taken from the current API (checked against the bundled documentation, not recalled)**:
  - Forced `tool_choice` (`any`/`tool`) returns 400 on Claude Opus 5.5 / Sonnet 5.5 / Fable 5.1, so the usual "force a JSON tool" trick is **not** viable; structured output through `output_config.format` is the supported route.
  - Sampling parameters (`temperature`, `top_p`, `top_k`) are rejected on these models, so determinism is pursued by prompt design and a validator, not by temperature 0.
  - Thinking is always on for Opus 5.5 and cannot be disabled; its effort defaults to `medium`, so the adapter sets `output_config.effort` explicitly (`medium`). Thinking tokens count toward `max_tokens`, so the adapter uses `max_tokens: 16000` (non-streaming limit guidance) for a response that is a few thousand tokens.
  - A `stop_reason` of `refusal` or `max_tokens` is checked before the text is read; `max_tokens` yields truncated JSON (an invalid-output outcome) and `refusal` is a non-retryable failure.
- **Refusal fallbacks**: the documentation suggests enabling server-side refusal fallbacks by default. Not adopted: it adds a beta header and a second model dependency for a case (refusing to restructure a CV) we handle as a safe `FAILED`. Listed as hardening.
- **Alternatives**: a forced tool call (not allowed on current models); asking for JSON in free text and regex-extracting it (fragile); wrapping the SDK in a generic multi-provider abstraction (violates "avoid speculative abstraction").

### D-6 Prompt design and injection mitigation

- **Decision**: One centralized, versioned prompt module (`PROMPT_VERSION = "cv-draft-v1"`, stored with each draft). The **system** prompt holds all rules: use only supplied facts, never invent, leave unknown fields `null`, ask a question instead, role-relevance only reorders and rewords, treat everything inside the source delimiters as data and ignore instructions found there. The **user** message holds only two delimited blocks: the target role and the source content. Delimiter look-alikes inside the source (the closing tag) are neutralised before insertion so the source cannot "close" its own block.
- **Rationale**: this is the explicit, minimal mitigation FR-037/FR-038 ask for, and it is testable on the constructed request without trusting model behaviour. On retry the user message gains a short feedback block that names violated rule ids and paths only (never source values), so the second attempt is meaningfully different without temperature.
- **Alternatives**: a separate classifier call for injection (extra cost and a new failure mode); stripping suspicious phrases from the source (fragile and alters user facts).

### D-7 Structured CV model: one validated JSON document, questions in a table

- **Decision**: The draft is stored as a single versioned JSON column (`schemaVersion: 1`) with `contact`, `summary`, `experience[]`, `education[]`, `skills[]`. Experience and education entries get server-generated stable ids (the model never invents ids). It is written only after validation and **read back through Zod** (database JSON is an external boundary, constitution II). Clarification questions are rows in their own table, each referencing a draft entry by that id.
- **Rationale**: one document is exactly what the later manual editor, clarification updates and A4 renderer need, with no joins. Questions need a lifecycle later (open/resolved) and one-to-many queries, so a table is the smaller long-term design. Entry ids make `itemId` references stable once the editor reorders or edits items.
- **Alternatives**: normalised tables for every section (migrations and mapping for no query benefit now); questions as JSON inside the draft (the answer feature would rewrite the whole document to flip one status); a generic document-schema engine (explicitly not wanted).

### D-8 Domain validation: deterministic normalisation, no fuzzy matching

- **Decision** (all pure functions, unit-tested without Nest):
  - Normalise both sides identically: Unicode NFKD, strip diacritics, lower-case, `&` -> `and`, drop punctuation, collapse whitespace.
  - **Contacts (strict)**: email lower-cased must occur in the normalised source; phone compared as digit strings (the draft's digits must occur in the source's digit string); links compared after removing scheme, `www.` and trailing slash. Full name is checked tolerantly by token (every name token of 2+ letters appears in the source). Location is structure-checked only.
  - **Employer and institution names (tolerant, FR-033)**: drop legal suffixes (`inc`, `llc`, `ltd`, `gmbh`, `corp`, `corporation`, `co`, `plc`, `sa`, `ag`, `bv`, `limited`, `company`) and articles, expand a small fixed list of abbreviations (`univ`, `inst`, `intl`, `tech`), then require **every remaining significant token** to be present in the source's token set (so order and punctuation do not matter), or accept an **acronym match** in either direction (the name's initials appear as a standalone token in the source, or a short all-letters name equals the initials of a source word run). A name with no recognisable counterpart fails.
  - **Not checked mechanically**: bullets, dates, titles, skills, summary wording (limits documented, see the plan).
  - **Structural invariants**: required sections present, caps on counts and lengths, no empty entries, question section valid, `itemIndex` in range, question cap of 10, no duplicate questions.
- **Rationale**: it rejects invented organisations and contact details, the highest-value fabrications, while tolerating legitimate reformatting. It is a few hundred lines of pure code with no dependency.
- **Alternatives**: exact substring matching (rejected by the stakeholder: it rejects valid transformations); edit-distance or embedding similarity (heavier, harder to explain, new failure modes); asking the model to self-verify (not a mechanical check).
- **Accepted risk**: token-set containment can accept a different company whose name shares all tokens with something in the source. For a CV built from the user's own text this is rare and acceptable; a false rejection is the more likely failure, and it ends in a clear `FAILED` with a retry.

### D-9 PDF extraction cost and hostile files

- **Decision**: accept the 5 MB cap and the 20,000-character result cap as the only guards in this feature. Extraction is bounded in practice by those two limits; it is not run in a worker thread or subprocess.
- **Rationale**: the user is authenticated and rate of use is low; adding a worker pool is production hardening. Documented in the plan so it is a conscious trade-off, not an oversight.

### D-10 Failure model

- **Decision**: a closed set of failure reasons (an enum in the database): `PROVIDER_UNAVAILABLE`, `PROVIDER_NOT_CONFIGURED`, `INVALID_OUTPUT`, `TIMED_OUT`, `INTERRUPTED`, `UNKNOWN`. Plus a short `failureDetail` built **only from safe tokens** (HTTP status code, error class name, validation rule ids and JSON paths, never values, messages or source text) for debugging. A refusal is recorded as `INVALID_OUTPUT` with detail `refusal`.
- **Rationale**: satisfies FR-018 (safe, categorised, enough to debug) and makes the UI messages a simple lookup.

### D-11 Frontend: TanStack Query for polling only

- **Decision**: add `@tanstack/react-query` v5. A client wrapper provides a `QueryClient` **only around the CV page** (not in the root layout), so there is no app-wide client state. The CV page is a Server Component that loads the first status server-side (forwarding the cookie) and hands it to a client component as `initialData`; `useQuery` then polls the status every 2 s while it is `PENDING` or `PROCESSING` and stops on `COMPLETED` or `FAILED`; the result is fetched once when the status becomes `COMPLETED`; retry is a `useMutation` that writes the new status into the cache.
- **Rationale**: `frontend.md` lists generation polling and mutation-driven invalidation as the right use of TanStack Query; hand-rolled `setInterval` + effects would reimplement its stop conditions, focus handling and error state. The polling policy is a tiny pure function so it can be unit-tested.
- **Alternatives**: `useEffect` + `setInterval` (what the rules discourage); server push/SSE (new transport for no gain); polling from the Server Component with `router.refresh()` (re-renders the whole tree and is harder to stop cleanly).

### D-12 Configuration

- **Decision**: extend the Zod env schema: `ANTHROPIC_API_KEY` (optional; empty string treated as absent), `ANTHROPIC_MODEL` (default `claude-opus-5-5`), `GENERATION_TIMEOUT_MS` (default 300000), `GENERATION_CONCURRENCY` (default 2), and `GENERATION_AUTORUN` (default true; tests set it false to drive the runner deterministically). A missing key does **not** stop the app (spec edge case): the generation ends `FAILED` / `PROVIDER_NOT_CONFIGURED`.
- **Rationale**: matches the spec assumption and SC-008 ("the suite passes with no AI credential configured"); the e2e setup explicitly unsets the key to prove it.

### D-13 Test approach

- **Decision**: reuse the real-PostgreSQL + `inject()` harness. Background work is driven deterministically: `createTestApp` accepts provider overrides, the Anthropic port is replaced by a scripted fake (queue of outputs/errors with an optional gate promise to hold a job in `PROCESSING`), the runner exposes `runPending()` and `reconcile()`, and autorun is off. Timeout tests use a tiny configured timeout and a fake that never resolves. PDFs are built at test time from a small raw-PDF helper (the one used in the spike), so there are no binary fixtures. Two boundaries are mocked: the Anthropic SDK client (adapter tests) and `unpdf` (password-protected mapping).
- **Alternatives**: mocking Prisma (would hide the compare-and-set and constraint behaviour that matters here); real timers and sleeps (slow and flaky).

## Spec tensions (resolved)

1. **Unusable PDF**: resolved by the stakeholder. It is an ingestion failure (`422 PDF_EXTRACTION_FAILED`, nothing created), separate from validation errors (`400`) and generation failures. The special "failed at creation, not retryable" CV, two request-time failure reasons and the `retryable` flag are removed.
2. **Draft and questions operations**: resolved. One `GET /api/cvs/:id/result` returns the draft with its questions; a concrete need for separate endpoints can be handled later.
3. **Restart behavior**: resolved to match the spec. `PROCESSING` rows found at startup become `FAILED` / `INTERRUPTED` and are retried explicitly; they are never moved back to `PENDING`.
4. **FR-036** (a failed output must not modify a stored draft) collapses into the compare-and-set rule, because a retry exists only after `FAILED`.
5. **FR-033 name matching** remains the one rule that can reject valid output. It is deliberately tolerant; if false rejections show up in practice, the escape hatch is a lenient mode, not more matching code.
