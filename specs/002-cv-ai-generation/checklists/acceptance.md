# Final Verification: CV Input and AI Generation Lifecycle (T054)

**Date**: 2026-10-05 | **Branch**: `claude/festive-sagan-8kv8tr` (PR #1) | **Spec**: [../spec.md](../spec.md)

Traceability of every acceptance criterion (AC) and success criterion (SC) to evidence. Legend:
**[x]** met and proven by automated tests or a recorded manual run; **[~]** the contract is met and
proven with a test double, but the behaviour of the **real model** is not yet verified because the
real-Anthropic smoke test (T040) has not been run; **[ ]** not met.

## Fresh runs on the final tree

| Check | Result |
|-------|--------|
| API unit (`pnpm --filter api test`) | 171 passed (14 files) |
| API e2e on real PostgreSQL, `ANTHROPIC_API_KEY` unset | 120 passed (12 files) |
| API `tsc`, lint (0 warnings), `nest build` | clean |
| Web unit (`pnpm --filter web test`) | 23 passed (4 files) |
| Web `tsc`, lint, `next build` | clean |
| Browser run (Chromium, 320/390/1280 px, seeded states) | about 65 checks, 0 failures, no horizontal overflow |
| Create latency, local | `POST /api/cvs` 202 in 8 to 27 ms; PDF upload with inline extraction 202 in 172 ms (small text PDF) |

## Acceptance criteria

- [x] **AC-001** free text + role returns `202` / `PENDING` immediately. `cv-input` e2e (accepts free text, persisted `PENDING` before any AI call, generator called 0 times).
- [x] **AC-002** valid PDF + role returns `202` / `PENDING`. `cv-input` e2e (PDF part), browser run.
- [x] **AC-003** neither/both sources, missing role, blank or short text, non-PDF, oversize all `400`, nothing created. `cv-input` e2e (table of cases, renamed non-PDF, 5 MiB + 1 byte, `source` error), schema unit tests; web form schema tests.
- [x] **AC-004** state persisted; a fresh read after reload matches. `generation-lifecycle` e2e (reads at each stage), browser reload during `PROCESSING`.
- [x] **AC-005** `PENDING` → `PROCESSING` → `COMPLETED` with a structured draft. `generation-lifecycle` e2e with a held (gated) generator call.
- [x] **AC-006** failures end `FAILED` with a safe reason; nothing stays `PROCESSING`; startup interrupts and retry works. `generation-failures` e2e (provider errors, timeout, stale result discarded, `failInterrupted`, `failTimedOut`, retry after `INTERRUPTED`), `generation-startup` e2e (real autorun path), the built app restarted with a seeded `PROCESSING` row.
- [x] **AC-007** invalid output never stored; at most one retry. `generation-failures` e2e (malformed, wrong types, missing section, unsupported contact, unsupported organisation; 2 calls, `draft` null, no questions), domain validation unit tests.
- [~] **AC-008** missing/vague facts become persisted questions, never invented values; partial draft + questions is `COMPLETED`. Proven with a test double (`generation-lifecycle` e2e, mapper and validation unit tests). The real model's compliance with "null plus a question" needs T040.
- [x] **AC-009** an unusable PDF returns `422 PDF_EXTRACTION_FAILED`, creates no CV or generation, no OCR. `cv-input` e2e (corrupt, image-only, over-long; row count unchanged), `pdf-text-extractor` unit tests, browser run.
- [~] **AC-010** source with embedded instructions is sent as separated data with an explicit ignore rule. Proven on the constructed request (`cv-draft.prompt.spec.ts`, delimiter look-alikes neutralised), as the spec requires. Whether the real model obeys needs T040 (the smoke test includes an injection case).
- [x] **AC-011** no read, retry or detection of another user's generation, draft or questions. `cv-ownership` e2e (byte-identical `404` for status, result and retry versus a missing id; `userId` ignored in body, query, header and form; identical `401` matrix), web run (foreign id shows the same not-found page).
- [x] **AC-012** all AI calls use Anthropic; tests make no real request. The SDK is imported only in `anthropic-cv-generator.ts` (and its spec); `createTestApp` always overrides the `CvGenerator` port; the whole suite passes with no key.
- [x] **AC-013** create, in-progress, completed and failed screens work at phone width, update by themselves and survive reload. Browser run at 320 and 390 px (no overflow even with long unbroken strings), polling and reload checks.

## Success criteria

- [x] **SC-001** in-progress state within 3 seconds. Measured above: 8 to 27 ms (text), 172 ms (small PDF). The 5 MB worst-case extraction was not timed.
- [x] **SC-002** every generation reaches a final state, including after restart. Failure, timeout and startup-sweep e2e tests; sweep observed on the built app (fails a stale row about 32 s after start).
- [x] **SC-003** reload always shows persisted state. Lifecycle e2e reads, browser reload during `PROCESSING` and `FAILED`.
- [x] **SC-004** 0 invalid outputs stored. Parameterised invalid-output e2e cases plus the persist-failure case; the only write path is the fenced transaction.
- [x] **SC-005** invalid inputs rejected clearly, unusable PDFs get the extraction error, none creates a CV. `cv-input` e2e, web form tests, browser run.
- [~] **SC-006** missing facts stay empty and get a question; 0 invented values. Contract proven with a test double; deterministic checks reject unsupported contacts and organisations. Real-model behaviour needs T040.
- [x] **SC-007** 0 cases of reading or detecting another user's data. `cv-ownership` e2e.
- [x] **SC-008** 0 real AI requests in tests; suite passes with no key. See AC-012.
- [x] **SC-009** screens fine at 320 px without horizontal scrolling. Browser run.
- [x] **SC-010** the tests listed under Required Automated Test Coverage exist and pass. See the fresh runs above and the mapping in `plan.md` (Test Strategy).

**Result**: 20 of 23 criteria fully met; 3 (AC-008, AC-010, SC-006) are met at the contract level and
wait on the real-Anthropic smoke test. None is unmet.

## Constitution check

- **V. Secure authentication and ownership**: met. Every CV operation loads through `CvService.findOwnedOrThrow` (`WHERE id AND userId`) or a retry update constrained by owner and status; no handler reads a user id from the request; the web app uses only the HTTP-only session cookie and stores nothing in `localStorage` or `sessionStorage`.
- **VI. AI transforms facts, never invents them**: met by design and by tests with a test double: the prompt forbids invention and requires `null` plus a question, and deterministic checks reject unsupported contacts, names and organisations. The limits (bullets, dates, titles, skills are not mechanically checkable) are documented in `draft-validation.ts` and the plan. Real-model behaviour: see T040.
- **VII. Structured output must be validated**: met. The port returns `unknown`; output goes through the Zod output schema, then domain validation, then a fenced compare-and-set transaction; failure is a controlled `FAILED` or one bounded retry. No unsafe casts.
- **XIV. Owned code**: met. The diff was reviewed after each phase (scope listed in PR #1), tests, typecheck, lint and build ran on every phase and on the final tree, and every non-obvious decision is recorded in `research.md`, `plan.md` and the `tasks.md` header.

The constitution itself was not amended.

## Decisions at the top of tasks.md are reflected in code and tests

1. Unusable PDF is an ingestion failure: `422` / `400`, no CV created. No `SOURCE_*` failure reasons and no `retryable` flag exist (grep of API, Prisma schema, web, contract and data model is empty); `cv-input` e2e asserts the row count is unchanged.
2. One result endpoint: `GET /api/cvs/:id/result` returns the draft with its questions; no separate endpoints in the controller.
3. Restart: `failInterrupted()` marks `PROCESSING` as `FAILED` / `INTERRUPTED` and never `PENDING`; `PENDING` is processed; the 30 s sweep fails `PROCESSING` past the timeout; every transition is a compare-and-set that also matches the `generationAttempts` fencing token (mutation-tested).
4. `POST /api/cvs` is the real generation-start contract; ownership tests use the new shape.

## Known gaps carried forward

- Real-Anthropic smoke test (T040) not run: required before delivery.
- Spec FR-033 / US4 scenario 7 name "an abbreviation" as accepted reformatting; the accepted analysis fix removed abbreviation and acronym heuristics. `spec.md` is untouched; see `research.md` D-8.
- Web deviations from Figma (icons from `lucide-react`, 5 MB instead of 10 MB, no progress percentage, no "My CVs" list) are listed in the PR and the `tasks.md` notes.
