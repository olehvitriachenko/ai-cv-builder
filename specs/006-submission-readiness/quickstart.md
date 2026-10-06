# Quickstart: Validate Submission Readiness

Scenarios that prove the spec. Details: [plan.md](./plan.md), [contracts/run-configuration.md](./contracts/run-configuration.md), [data-model.md](./data-model.md).

## 1. Clean-checkout run (US1, SC-001, SC-003)

1. Clone the repository into a new folder (or use a clean worktree) with no `.env`, no `node_modules`, no database volume.
2. `cp .env.example .env`; set `ANTHROPIC_API_KEY` (your own).
3. `docker compose up --build`. Expected: the database becomes healthy, the API applies the migrations and becomes healthy, the web app starts; no manual step.
4. Open `http://localhost:3000`, register, create a CV from free text with a target role. Expected: generation completes and the CV opens in the editor.
5. `docker compose down`, then `docker compose up`; sign in. Expected: the CV is still there.
6. Record the elapsed time of steps 1 to 4 (target: under 10 minutes).

## 2. No key (US1 scenario 3, SC-002)

1. With `ANTHROPIC_API_KEY` empty, start the stack. Expected: it starts; sign-up, My CVs, the editor on an existing CV and PDF download work.
2. Create a CV. Expected: it ends in the failed state with a retry, within the generation time limit, with no crash.

## 3. Ports and secrets (FR-002, FR-005)

1. Set `WEB_PORT=3100` (and `API_PORT`) in `.env`, start. Expected: the app is on 3100 and works (sign-in keeps its session).
2. `git ls-files | xargs grep -l "sk-ant"` returns nothing; `.env` is ignored by Git.

## 4. README walk-through (US2, SC-004)

1. Follow only the README: run, then each verification command. Expected: all work as written.
2. Find, by headings, the answers to: how to run, how to test, architecture, major decisions, hallucination prevention and its limits, what was simplified, next steps, how AI tools were used.

## 5. PDF preparation message (US3, SC-005, SC-006)

1. Open a CV, open the full-screen preview, press Download PDF. With the request delayed (browser network throttling or a slow response): after about 0.3 s the preview dims and the message shows "Preparing your PDF…", the line, the file name; the button reads "Preparing…" and ignores clicks.
2. When the file arrives: it downloads and the message goes (after at least 0.7 s of being shown).
3. A fast response: no message appears. Failure (stop the API): the message goes and the usual error shows. Close the preview while preparing: it closes and the file still downloads.
4. At 390 px and 320 px the message fits the width.

## 6. Gates (US4, FR-013, FR-014, SC-007)

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build` all pass; none calls the real AI. Locate any one product area's code in one place under `apps/web/src/features`.
