# Implementation Plan: Submission Readiness

**Branch**: `006-submission-readiness` | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-submission-readiness/spec.md`

## Summary

Make the take-home deliverable hand-in ready: one command starts the database, the API and the web app with the AI key read from the environment (US1); a README lets a reviewer run, test and understand the project (US2); the full-screen preview shows a "Preparing your PDF…" message while a PDF is prepared (US3, already built in `6e9261b`); the web code stays organised by feature (US4, done by refactors, kept green). No product behaviour changes besides the preparing message.

Approach: the stack is three Compose services with health-gated start order; the API applies the checked-in migrations on start; the browser talks to the API through the web app's same-origin `/api` path, so no cross-origin setup is needed in the container run; configuration is the existing validated environment of the API plus the three ports and the key. The README is written from the verified commands, not from memory, and every command in it is run once on a clean checkout.

## Technical Context

**Language/Version**: TypeScript (strict), Node.js 24, pnpm 11 workspace

**Primary Dependencies**: existing: NestJS/Fastify, Prisma, Next.js 16, React 19; no new runtime dependency (container images and Compose only)

**Storage**: PostgreSQL 17 in a named volume

**Testing**: Vitest (API unit and e2e on a `_test` database, web unit); real-AI smoke test is manual and separate

**Target Platform**: any machine with Docker/Compose and a browser; local run only

**Project Type**: web application (monorepo: `apps/api`, `apps/web`, `packages/skill-catalogue`)

**Performance Goals**: first start (image build included) under 10 minutes on a typical laptop; later starts under 1 minute (SC-001)

**Constraints**: no secret committed; the key only from the environment; ports overridable; HTTP cookies for the local run; no deployment scope

**Scale/Scope**: one reviewer, one machine

## Constitution Check

*GATE: passed before research; re-checked after design (below).*

| Principle | Result |
|-----------|--------|
| XV Local reproducibility (Compose start, key from the environment, no committed secret) | The point of US1; satisfied by the plan |
| XVI Documentation (the eight reviewer questions) | The point of US2; the README sections map to them (see research R5) |
| III Reliability over breadth | Nothing is added beyond start-up, docs and one message; failure states reuse existing ones |
| X Critical behaviour tested | The preparing message's file name rule has a unit test; the timing is verified in the browser; the container run is verified by a clean-checkout run (quickstart) |
| XII Simplicity | No new service, proxy or orchestration; one rewrite rule and three Dockerfile-based services |
| XIII Scope discipline | No deployment, CI/CD, TLS or production hardening; stated as out of scope in the README |
| VI/VII AI rules | Untouched; the README only describes them |

No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/006-submission-readiness/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/run-configuration.md
├── checklists/requirements.md
└── tasks.md            # created by /speckit-tasks
```

### Source Code (repository root)

```text
docker-compose.yaml           # postgres, api, web; health-gated order; named volume
.env.example                  # the variables Compose reads (key, model; ports optional)
.dockerignore
README.md                     # run, test, architecture, decisions, grounding limits, trade-offs, AI tool use
apps/
├── api/
│   ├── Dockerfile            # build, then deploy migrations and start
│   └── .env.example          # host development settings (exists)
└── web/
    ├── Dockerfile
    ├── next.config.ts        # same-origin /api rewrite to the internal API address
    └── src/features/
        ├── pdf-download/     # preparing dialog, expected file name (+ test)
        └── cv-editor/components/preview/fullscreen-preview.tsx   # mounts the dialog
```

**Structure Decision**: web application layout as it exists; this feature adds files at the root (Compose, environment example, README), one Dockerfile per app and the PDF preparation pieces inside the existing `pdf-download` feature.

## Post-design re-check

Design added no service, dependency or abstraction beyond the plan above. The one open risk is that the container build must work from a clean clone; it is covered by quickstart scenario 1, which is the acceptance gate for US1.
