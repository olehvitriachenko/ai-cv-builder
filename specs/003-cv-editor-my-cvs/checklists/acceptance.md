# Final Verification: CV Editor, Clarifications & My CVs (T095)

**Date**: 2026-10-05 | **Branch**: `003-cv-editor-my-cvs` (PR #2, base `002-cv-ai-generation`) | **Spec**: [../spec.md](../spec.md)

Traceability of every acceptance criterion (AC) and success criterion (SC) to evidence. Legend:
**[x]** met and proven by automated tests or a recorded manual run; **[~]** the contract is met and
proven with a test double, but the behaviour of the **real model** is not verified because the
real-Anthropic smoke test (T093, which also closes 002's T040) has not been run: no
`ANTHROPIC_API_KEY` is available in the build environment; **[ ]** not met.

## Fresh runs on the final tree

| Check | Result |
|-------|--------|
| API unit (`pnpm --filter api test`) | 343 passed |
| API e2e on real PostgreSQL, `ANTHROPIC_API_KEY` unset | 240 passed |
| API `tsc`, lint (0 warnings), `nest build` | clean |
| Web unit (`pnpm --filter web test`) | 82 passed |
| Web `tsc`, lint, `next build` | clean |
| Migration on a clean database and on a database holding 002 data | applies, no drift, 8 CHECK constraints present, `OPEN`→`UNANSWERED` and `RESOLVED`→`APPLIED` mapped |
| Browser run (Chromium, 320/390/1280 px, seeded states) | list 22/22, delete 13/13, editor 36/36, questions 19/19, apply 16/16; no horizontal overflow; no CV content in `localStorage` or `sessionStorage` |
| Real-model smoke (`pnpm --filter api test:smoke`) | **not run** (no key); extended with `field` generation and one AI apply per scope |

## Acceptance criteria

- [x] **AC-001** list is owner-only, `updatedAt DESC`, with name/role/time/status/message/count; `/cvs` is the landing page, "My CVs" is active. `cv-list` e2e (ordering, isolation, DTO fields, no `userId` input), `display-status` unit tests, browser list run, login/register redirect.
- [x] **AC-002** display status mapping for all state combinations; polling while active, stops when none. `display-status` unit tests, `cv-list` e2e (all combinations), `list-poll` unit tests, browser run (card moves to final status without reload).
- [x] **AC-003** Open, View progress, Try again only when `canRetry`, Delete (not enabled while processing), disabled Download PDF; empty state and privacy note. `card-copy` and `retry-rule` unit tests, `cv-list` e2e (`canRetry` per failure reason), browser run at 320/390/1280. Figma nodes 2:7459, 2:7573, 2:8854, 2:8797, 2:8807.
- [x] **AC-004** edits to every section validated, saved, present after reload; true Saving/Saved/Error; live A4-like preview. `cv-edit` e2e, `draft-edit.schema` and `autosave` unit tests, `draft-form` tests, browser editor run (reload, second session, offline Error keeps local text).
- [x] **AC-005** answering leaves the CV and revision unchanged; four states persist; only unanswered/answered count as open; explicit dismiss. `question-answer` e2e, `question-state` unit tests, browser questions run.
- [x] **AC-006** apply changes only the intended section or entry; deterministic for `field` questions, scoped validated AI otherwise; unrelated edits untouched. `question-apply` e2e (each section, unrelated edits preserved, 0 AI calls for field questions), `answer-patch` and `question-target` unit tests, browser apply run.
- [x] **AC-007** failed apply changes nothing; content and `APPLIED` are one transaction. `question-apply` e2e (invalid output, provider failure, revision conflict and state conflict at commit leave draft, revision and question unchanged).
- [x] **AC-008** stale write is `409 REVISION_CONFLICT`; repeated apply takes effect once. `cv-concurrency` e2e (stale save, two concurrent saves, two concurrent applies), `autosave` unit tests, browser two-tab run (Load latest / Keep my changes).
- [x] **AC-009** delete own `COMPLETED`/`FAILED` after confirmation; cascade; cancel deletes nothing; active is `409 CV_GENERATION_ACTIVE`. `cv-delete` e2e (row and question counts), `delete-flow` unit tests, browser delete run.
- [x] **AC-010** every new operation is owner-only with the missing-CV response, 401 when unauthenticated. `cv-editor-ownership` e2e (list, edit, answer, dismiss, apply, delete, byte-identical to a missing id), `logging-editor` e2e.
- [~] **AC-011** all AI calls go to Anthropic with only the relevant scope; no real request in tests. The SDK is imported only in the two adapters; `createTestApp` overrides the `CvAnswerApplier` port; the suite passes with no key; the scope prompt is unit tested. Real-model behaviour of the apply prompt and of `field` generation (prompt v2) needs T093.
- [x] **AC-012** both screens work at 320 px without horizontal scrolling and follow Figma; no CV content in browser storage. Browser run at 320/390/1280 px. Figma nodes 14:1077, 6:2671, 6:5741. Deviations listed in the PR.
- [x] **AC-013** Download PDF is present where Figma shows it and disabled. Browser list and editor runs.

## Success criteria

- [x] **SC-001** any CV reachable in at most two interactions; list shows correct fields for every tested state. `cv-list` e2e, browser list run.
- [x] **SC-002** every tested edit present after reload and from a second session; no "Saved" without storage. `cv-edit` e2e, browser editor run; `Saved` only after the `200`.
- [x] **SC-003** stale writes never overwrite newer content and the writer is told. `cv-concurrency` e2e, browser two-tab run.
- [x] **SC-004** only the intended part changes; failures leave content and question state intact. `question-apply` e2e, `cv-concurrency` e2e.
- [~] **SC-005** invalid AI output never stored, simple fields use 0 AI requests, 0 real requests in tests. Proven with a test double (`question-apply` e2e, `answer-patch` unit tests: unsupported contact and organisation facts, overwrite, empty patch, whole-draft revalidation). Real-model compliance needs T093.
- [x] **SC-006** 0 cross-user list/read/edit/answer/dismiss/apply/retry/delete/detect cases. `cv-editor-ownership` e2e.
- [x] **SC-007** deleted CV and questions gone, cancel deletes nothing, active CV never deleted. `cv-delete` e2e, browser delete run.
- [x] **SC-008** card reaches its final status without reload; polling stops. `list-poll` unit tests, browser run (about 5 s interval, none when no CV is active).
- [x] **SC-009** Saving/Saved/Error matches the true outcome including network failure and conflict. `autosave` unit tests, browser offline and two-tab runs.
- [x] **SC-010** both screens at 320 px without horizontal scrolling, Figma structure on desktop and mobile. Browser run.
- [x] **SC-011** the tests listed under Required Automated Test Coverage exist and pass. See the fresh runs above.
- [x] **SC-012** dismissed stays dismissed after reload, never changes the CV, leaves the open count; no automatic dismissal. `question-answer` e2e, `question-state` unit tests, browser questions run.

**Result**: 23 of 25 criteria fully met; 2 (AC-011, SC-005) are met at the contract level and wait on the real-Anthropic smoke test. None is unmet.

## Scope guards

- **No new tables or dependencies**: `package.json` and `pnpm-lock.yaml` are unchanged; `schema.prisma` adds `Cv.revision`, the two question columns (`answer`, `field`), the four-value `QuestionStatus` and the `QuestionField` enum only.
- **Revision**: written only by `CvEditorService.updateDraft` and `ClarificationService.commitApply`; answer and dismiss touch only `updatedAt`.
- **CORS**: `GET, HEAD, POST, PUT, DELETE` allowed; `cors` e2e covers the preflight for `PUT` and `DELETE`.
- **No `OPEN`/`RESOLVED`** remain in API source, API tests or web source (generated Prisma excluded); no `any`, `@ts-ignore` or unsafe cast was added (the `as keyof` casts were replaced by an `isKeyOf` type guard).
- **Scoped AI only**: the applier receives one section or entry, the question and the answer; the result is a strict per-section additive patch merged into the stored draft, never a replacement of it.

## Known gaps carried forward

- Real-Anthropic smoke test (T093 and 002's T040) not run: required before delivery. Run `ANTHROPIC_API_KEY=... pnpm --filter api test:smoke`.
- Prompt v2 (`field` emission) is unverified against the real model; if the model omits `field`, questions fall back to the scoped AI path, which still works.
- Full-stack `docker compose up` is still outstanding (carried over from 002).
- Figma deviations: icons from `lucide-react`; Download PDF is present but disabled until feature 004. The full list is in the PR description.
