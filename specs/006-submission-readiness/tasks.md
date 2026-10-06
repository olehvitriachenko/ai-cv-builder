---
description: "Task list for Submission Readiness (feature 006)"
---

# Tasks: Submission Readiness

**Input**: Design documents from `specs/006-submission-readiness/` ([plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/run-configuration.md](./contracts/run-configuration.md), [quickstart.md](./quickstart.md))

**Prerequisites**: branch `006-submission-readiness`; Docker with Compose; for the real-generation checks an Anthropic key of your own.

**Tests**: no new automated suite is requested. The spec's checks are the existing gates (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`), the unit test of the file-name rule (done) and the quickstart scenarios run by hand.

**Organization**: by user story. **State when written**: US3 is built (`6e9261b`). The Compose, Dockerfile, `.env.example`, `.dockerignore`, `next.config.ts`, `fetcher.ts` and `README.md` drafts exist in the working tree, uncommitted and not yet verified; the tasks below verify and commit them rather than rewrite them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an open task)
- Paths: `API` = `apps/api`, `WEB` = `apps/web/src`

## Phase 1: Setup

- [x] T001 Confirm `.specify/feature.json` points to `specs/006-submission-readiness` and the working branch is `006-submission-readiness`; list the uncommitted drafts (`git status --short`) and note which belong to this feature (Compose, Dockerfiles, `.env.example`, `.dockerignore`, `README.md`, `WEB/../next.config.ts`, `WEB/shared/api/fetcher.ts`).
- [x] T002 [P] Check `.gitignore` ignores `.env`, `.env.*` (except `*.example`), `**/node_modules`, `**/.next`, `**/dist` and that `git ls-files | xargs grep -l "sk-ant"` finds nothing (FR-002).

---

## Phase 2: Foundational (blocks US1)

- [x] T003 Make the browser reach the API through the web app's own `/api` path and the web server through the internal address: `apps/web/next.config.ts` rewrites `/api/:path*` to `${API_INTERNAL_URL}` (default `http://localhost:3001/api` for host development); `WEB/shared/api/fetcher.ts` uses `NEXT_PUBLIC_API_URL` (`/api` in the container, `http://localhost:3001/api` on the host) in the browser and `API_INTERNAL_URL` on the server. Update `WEB/shared/api/fetcher.test.ts` for both cases (research R2).
- [x] T004 Verify host development still works with the change: start the API and the web app on the host, sign in, open a CV; the session cookie is sent and server-rendered pages load.

**Checkpoint**: both the host and the container address forms work.

---

## Phase 3: User Story 1 - Run the whole product with one command (Priority: P1) 🎯 MVP

**Goal**: `docker compose up --build` starts the database, the API and the web app; register → create CV → editor works; no key means no real generation only.

**Independent Test**: quickstart scenarios 1 to 3.

- [x] T005 [P] [US1] Review `apps/api/Dockerfile`: builds the workspace packages and the API, installs only what the API needs (`pnpm install --frozen-lockfile --filter api...`), starts with `prisma migrate deploy` then `node dist/main.js`, runs as the unprivileged user; a failed migration stops the container (FR-001, research R1).
- [x] T006 [P] [US1] Review `apps/web/Dockerfile`: builds with `NEXT_PUBLIC_API_URL=/api` and `API_INTERNAL_URL=http://api:3001/api`, runs `next start` on `0.0.0.0:3000` as the unprivileged user.
- [x] T007 [P] [US1] Review `.dockerignore` (excludes `.git`, `node_modules`, `.next`, `dist`, `.env*`, the generated Prisma client) so the build context is small and holds no secret.
- [x] T008 [US1] Review `docker-compose.yaml` against [contracts/run-configuration.md](./contracts/run-configuration.md): services `postgres`, `api`, `web`; `postgres` has a readiness health check and a named volume; `api` waits for a healthy database and has a health check that expects `401` from an unauthenticated request; `web` waits for a healthy `api`; ports `${WEB_PORT:-3000}`, `${API_PORT:-3001}`, `${POSTGRES_PORT:-5432}`; `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` come from the environment; `NODE_ENV=development` with the comment that an internet deployment needs HTTPS (FR-001, FR-003, FR-005).
- [x] T009 [US1] Review `.env.example`: it lists `ANTHROPIC_API_KEY` (empty) and `ANTHROPIC_MODEL=claude-sonnet-5-5` with the comments from the contract, and no real secret (FR-002).
- [x] T010 [US1] Run quickstart scenario 1 on a clean checkout (new clone or clean worktree, no `.env`, no `node_modules`, no volume): `cp .env.example .env`, set the key, `docker compose up --build`, register, create a CV from free text, see it in the editor, `docker compose down`, `docker compose up`, sign in and find the CV. Record the elapsed time (target: under 10 minutes) and any fix needed in the files of T003 and T005 to T009.
- [x] T011 [US1] Run quickstart scenario 2 (no key): sign-up, My CVs, the editor on an existing CV and PDF download work; a new CV ends in the failed state with a retry and a clear message within the generation time limit. If anything crashes or waits forever, fix it in `API/src/config/env.ts` or the generation runner and add a regression test (FR-004).
- [x] T012 [US1] Run quickstart scenario 3 (ports and secrets): `WEB_PORT=3100`, `API_PORT=3101` start and work, the session is kept; no secret in `git ls-files` (FR-002, FR-005).
- [x] T013 [US1] Commit the verified stack files separately (`feat: run the whole stack with docker compose`): `docker-compose.yaml`, `.env.example`, `.dockerignore`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/web/next.config.ts`, `WEB/shared/api/fetcher.ts` and its test. Do not commit `.env`.

**Checkpoint**: one command runs the product; US1 is demonstrable on its own.

---

## Phase 4: User Story 2 - Understand the project from the README (Priority: P1)

**Goal**: a reviewer can run, test and understand the project from the README alone.

**Independent Test**: quickstart scenario 4.

- [x] T014 [US2] Make sure `README.md` has these sections, each short and in this order (research R5): Run with Docker; Local development; Verification (every kind of test, which need the database, which need the key, that none of the automated tests call the real AI); Architecture and lifecycle; Ownership and security; AI output and grounding limits; PDF constraints; Trade-offs and next steps with how AI coding tools were used (FR-006, FR-007).
- [x] T015 [US2] Add to the Trade-offs section the choices of features 002 to 005 a reviewer could mistake for defects, in one list (FR-008): skills are prompt-grounded, not mechanically verified; the preview's page count is an estimate; a save conflict is resolved by choosing a whole version, nothing is merged; the migration of drafts is one-way; removing an experience or a category that holds something asks first, everything else is immediate; the answer to a clarification question saves by itself after a pause (800 ms default); one API instance, no queue; no OCR. Source: `specs/002-cv-ai-generation/plan.md` "Project-level follow-ups".
- [x] T016 [US2] Run every command in `README.md` once, exactly as written, on the clean checkout of T010 (run, local development, each verification command, the smoke command described only). Fix every command or sentence that does not work or is out of date (SC-001, SC-004).
- [x] T017 [US2] Read the README once as a stranger and tick the eight questions of constitution XVI by heading (how to run, how to test, architecture, decisions, hallucination prevention and its limits, simplifications, next steps, AI tool use); add what is missing (SC-004).
- [x] T018 [US2] Commit `README.md` (`docs: README for reviewers`).

**Checkpoint**: the README stands alone; US2 is complete.

---

## Phase 5: User Story 3 - See that the PDF is being prepared (Priority: P2)

**Goal**: the full-screen preview shows the preparing message while the PDF is prepared (Figma 10.5).

**Independent Test**: quickstart scenario 5.

- [x] T019 [P] [US3] Expected file name rule `WEB/features/pdf-download/model/pdf-filename.ts` with `pdf-filename.test.ts` (same rule as the API, at most 80 characters) — done in `6e9261b`.
- [x] T020 [US3] Dialog `WEB/features/pdf-download/components/pdf-preparation-dialog.tsx`: dimming, centred surface, spinner, "Preparing your PDF…", "We're formatting your CV for download.", the file name; appears after 300 ms, stays at least 700 ms, polite announcement, never takes focus — done in `6e9261b`.
- [x] T021 [US3] `DownloadPdfButton` reports `onBusyChange` and takes a `busyLabel`; `WEB/features/cv-editor/components/preview/fullscreen-preview.tsx` mounts the dialog and passes "Preparing…" to the navigation action — done in `6e9261b`.
- [x] T021a [US3] Phone variant of the dialog (Figma 10.6 "Mobile390 / PDF download / Preparing", node `92:4619`): the surface is 358 px wide (16 px side margin), 28 px top and 20 px bottom padding, the text block has 20 px padding and 16 px gap, and a full-width disabled primary button "Preparing…" sits under the text with 20 px side padding; the navigation action stays in place, faded ("↓ PDF"). Desktop keeps no button (10.5). Edit `WEB/features/pdf-download/components/pdf-preparation-dialog.tsx` and the phone `DownloadPdfButton` in `WEB/features/cv-editor/components/preview/fullscreen-preview.tsx` (`busyLabel="PDF"`).
- [x] T022 [US3] Browser-verify quickstart scenario 5 on the final tree: the message after about 0.3 s with the three texts, the button "Preparing…" and unclickable (one download only, SC-006), a fast response shows no message (SC-005), a failed request removes the message and shows the usual error, closing the preview mid-preparation still completes the download, and the message fits at 390 px and 320 px with a very long name wrapping inside the surface (edge case). Fix what fails in the files of T020.
- [x] T023 [US3] Record the result in this file's "Verification record" below.

**Checkpoint**: US3 verified on desktop and phone.

---

## Phase 6: User Story 4 - Find code by feature (Priority: P3)

**Goal**: each product area has its code in one place and the checks stay green.

**Independent Test**: quickstart scenario 6, locate one area in one place.

- [x] T024 [US4] Confirm `WEB/features/{auth,cv-list,cv-generation,cv-editor,pdf-download,cv-delete}` each hold their components, model and API calls, shared parts are in `WEB/shared` and `WEB/entities`, and nothing imports across features except through the documented paths in `.claude/rules/file-structure.md` (FR-013). Note any exception; do not move code in this feature.
- [x] T025 [US4] Commit the rule file `.claude/rules/file-structure.md` if it is still staged and unreviewed, as its own commit, or leave it to its author and record that here.

---

## Phase 7: Polish & Cross-Cutting

- [x] T026 Run all gates on the final tree: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` (the API suite uses its own `_test` database; recreate it if a failed-migration record blocks it), `pnpm build`; none may call the real AI (FR-014, SC-007). Record counts.
- [x] T027 [P] Update `specs/006-submission-readiness/checklists/requirements.md` notes with the final state and record the date of the clean-checkout run.
- [x] T028 Fill the "Verification record" below and tick the finished tasks; commit `specs/006-submission-readiness` (`docs(006): verification record`).
- [ ] T029 Push the branch only when its owner agrees: it holds unpushed refactor commits of another author (`git log --oneline origin/005-structured-cv-editor..HEAD`).

---

## Dependencies & Execution Order

- Phase 1 first. Phase 2 (T003, T004) blocks US1. US1 (Phase 3) is the MVP and blocks the README run check (T016, which needs the clean checkout of T010).
- US2 can be drafted in parallel with US1 but is finished only after T010 and T016 prove the commands.
- US3 is built; only its verification (T022) remains and can run any time on the dev servers.
- US4 is a check and needs nothing else.
- Polish last.

### Parallel opportunities

- T002 beside T001; T005, T006, T007 together; T014 and T015 (README) beside T010 (the run); T022 beside everything after Phase 2; T024 beside T022.

## Implementation Strategy

- **MVP**: Phase 1, Phase 2 and US1. If time runs out, the reviewer still gets a product that starts with one command.
- **Then**: US2 (the README is the other required deliverable), then T022 and T026.
- Stop and report at: T010 (the clean-checkout run fails), T011 (no-key behaviour crashes), T029 (the branch holds another author's unpushed commits).

## Verification record

*(filled in at T023 and T028)*

| Check | Date | Result |
|-------|------|--------|
| Clean-checkout run, elapsed time | 2026-10-06 | pass: two clean temp copies (no `.env`, `node_modules` or volume) built and started; register → create CV → `COMPLETED` with the real model on the keyed copy; images built in a few minutes. Not timed end to end by the owner |
| No key | 2026-10-06 | found `UNKNOWN` instead of `PROVIDER_NOT_CONFIGURED` (empty key from Compose), fixed in `ada9dde`; then the CV ends `FAILED PROVIDER_NOT_CONFIGURED` within a second, retry gives the same, sign-in and the list work |
| Ports and secrets | 2026-10-06 | web 3300, API 3301, database 55440 worked and kept the session; both CVs and the account survived `down` and `up`; no key-like string in `git ls-files`; `.env` ignored |
| README commands | 2026-10-06 | pass: Compose commands exercised on clean copies; `typecheck`, `lint`, `test`, `test:e2e`, `build` run as written; limits quoted in the README (50 pages, 5 min, 800 ms) checked in code; the smoke command is described only (it spends tokens); local development `pnpm dev` verified at T003/T004 |
| Preparing message (desktop, 390, 320, fast, failure, close, repeated clicks) | 2026-10-06 | pass (Playwright against the dev servers: shown after 300 ms with the three texts and the file name, the button reads "Preparing…", no message in the first 150 ms, one request for three clicks, closing mid-way still downloads, a failure removes the message and shows the usual error, 358 px surface with the disabled "Preparing…" button at 390 and 288 px at 320, no horizontal overflow) |
| Gates (typecheck, lint, unit, e2e, build) | 2026-10-06 | pass: typecheck and lint clean; unit API 443, web 296; API e2e 292; production build of both apps |

## Notes

- T025: `.claude/rules/file-structure.md` has uncommitted changes by its author; left to them, not committed here.
- T029: not pushed. `006-submission-readiness` has no remote branch and holds another author's unpushed commits; pushing waits for the owner.
