# Implementation Plan: CV Editor, Clarifications & My CVs

**Branch**: `003-cv-editor-my-cvs` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-cv-editor-my-cvs/spec.md` (clarified 2026-10-05)

## Summary

Four user-visible capabilities on top of the completed 002, with no new infrastructure and no new dependency:

1. **My CVs** (`/cvs`): one owner-scoped list query returning a dedicated DTO (`candidateName`, `openQuestionsCount`, server-derived `displayStatus` and `canRetry`), cards with Open / View progress / Try again / Delete / disabled Download PDF, polling every 5 s only while a CV is active, and delete limited to `COMPLETED` and `FAILED` CVs.
2. **Manual editing**: the stored `CvDraft` is replaced as a whole document (`PUT /cvs/:id/draft`) after validation with the existing draft schema, guarded by one per-CV `revision` counter (optimistic concurrency, `409` on a stale save, no merging). The editor autosaves with debounced, serialized saves.
3. **Clarification flow**: question states become `UNANSWERED -> ANSWERED -> APPLIED | DISMISSED`. Answer and dismiss touch only the question. Apply is **deterministic** when the question carries a machine-readable target `field` (new nullable column, emitted by generation from now on) and otherwise uses a **narrow Anthropic call** whose output is an additive, schema-validated patch that the server applies to a path the server chose.
4. **Safe writes**: draft change + `APPLIED` marking are one transaction; every write is a compare-and-set on `(id, userId, status, revision)`; foreign and missing stay indistinguishable.

The smallest shape grounded in what exists:

- **One migration**: `Cv.revision`, the `QuestionStatus` enum swap (`OPEN`/`RESOLVED` -> `UNANSWERED`/`ANSWERED`/`APPLIED`/`DISMISSED`), `ClarificationQuestion.answer` and `.field`, plus CHECK constraints.
- **Reuse**: `CvService.findOwnedRowOrThrow` ownership gate, `ApiError`, `ZodValidationPipe`, the `CvGenerator` port pattern (a sibling `CvAnswerApplier` port), `draft.schema.ts` and `source-matching.ts` for validation, the e2e harness and the web design system (`StatusBadge`, `Card`, `Skeleton`, `Button`, `AppHeader`, `A4Sheet`/`CvDocument`).
- **Client**: the CV page renders the editor for `COMPLETED` CVs (it replaces the read-only result view); `/cvs` becomes the home. TanStack Query is used for list polling and the save/apply mutations only.
- **Findings that shape the work** (details in [research.md](./research.md)): the browser calls the API cross-origin and `@fastify/cors` allows only `GET,HEAD,POST` by default, so `PUT`/`DELETE` need an explicit `methods` list; existing questions carry only a section and free text, so deterministic apply needs the new `field` target; the retry rule is "status is `FAILED`" and is now computed once and shared by retry and the list.

## Technical Context

**Language/Version**: TypeScript (strict), ESM. API: NestJS 12 + Fastify 5 on Node 22/24. Web: Next.js 16 / React 19.

**Primary Dependencies**: Existing only: Prisma 7, Zod 4, `@anthropic-ai/sdk`, `@tanstack/react-query`, React Hook Form, `lucide-react`. **No new dependencies.** The delete confirmation uses the native `<dialog>` element.

**Storage**: PostgreSQL. One new migration ([data-model.md](./data-model.md)). No new table. No new index (see research D-9).

**Testing**: Vitest. Unit tests for pure code (state transitions, edit and patch validation, deterministic apply, display status, autosave state machine, form mapping, list polling policy). E2e on real PostgreSQL with Fastify `inject()`; both AI ports replaced by scripted fakes; no real Anthropic call anywhere (the suite still passes with no key).

**Target Platform**: Linux/macOS Node server; modern mobile and desktop browsers.

**Project Type**: Web application (pnpm monorepo `apps/api`, `apps/web`).

**Performance Goals**: List is one SQL statement (no N+1, no draft transfer). Edit save is one `UPDATE`. A deterministic apply is one transaction. An AI apply is bounded at two attempts of 20 s each, synchronous with the request.

**Constraints**: Constitution and `.claude/rules/*`; no `any`, no unsafe casts; all LLM output validated before persistence; no browser storage of CV content; no new infrastructure.

**Scale/Scope**: Take-home scale: a user owns tens of CVs; one draft is at most about 100 KB (caps in the draft schema).

## Constitution Check

*GATE: passes before research; re-checked after design (still passes).*

| Principle | Status | How this plan satisfies it |
|-----------|--------|----------------------------|
| I. Product contract | Pass | Delivers return-later access (list), manual editing, clarification answering and applying; PDF export is feature 004 |
| II. Strict type safety | Pass | Every request body is parsed by Zod; the stored draft JSON and the raw list rows are parsed on read; model output is `unknown` until validated; no casts as validation |
| III. Reliability over breadth | Pass | Compare-and-set writes, atomic apply, bounded AI call with explicit failure, no stuck state; no breadth beyond the spec |
| IV. Generation lifecycle | Pass | Lifecycle untouched. Delete and edit are gated by status; retry rule is shared so list and retry cannot disagree |
| V. Auth and ownership | Pass | Every new route loads through the ownership gate or constrains the write by `userId`; foreign == missing; question ids are scoped by `cvId`; no `userId` input; cookie-only auth; no browser storage of CV content |
| VI. AI transforms facts, never invents | Pass | Apply is deterministic wherever the answer is a single value; the AI patch is additive, scoped, contact and organisation facts are checked against the answer text, and unsupported output is rejected |
| VII. Structured output validated | Pass | answer + scoped context -> prompt -> Anthropic -> Zod patch schema -> domain checks -> transaction; nothing stored on failure |
| VIII. Server-first | Pass | The list page and the CV page are Server Components that load data on the server; interactive parts are small client components |
| IX. Database integrity | Pass | Enum swap, CHECK constraints for the answer/state and field/section invariants, FK cascade for delete, migration-based; no speculative index |
| X. Critical behavior tested | Pass | Every spec test is mapped in [Test Strategy](#test-strategy) |
| XI. User controls the CV | Pass | Manual edits are authoritative; AI never overwrites a filled value; the user chooses when to apply or dismiss |
| XII. Simplicity | Pass | Full-document save instead of a patch protocol; one counter instead of per-field versions; additive AI patches instead of a general edit language; no repository layer, queue or new dependency |
| XIII. Scope | Pass | No PDF, templates, versioning, merging, paging; Download PDF is disabled |
| XIV. Owned code | Pass | Decisions and alternatives are in research.md; review gate after each phase |
| XV. Local reproducibility | Partial | Unchanged from 002: runs with `docker compose up -d postgres` + env; full-stack compose remains a project-level follow-up |
| XVI. Documentation | Deferred | Trade-offs the final README must repeat are listed under [Trade-offs](#trade-offs) |

## Project Structure

### Documentation (this feature)

```text
specs/003-cv-editor-my-cvs/
├── spec.md
├── plan.md              # This file
├── research.md          # Decisions D-1 .. D-12 with alternatives
├── data-model.md        # Schema changes, state model, derived shapes, invariants
├── quickstart.md        # Run-and-verify guide
├── contracts/
│   └── cv-editor-api.md # Endpoints, shapes, errors
├── checklists/requirements.md
└── tasks.md             # Created by /speckit-tasks (not by this command)
```

### Source Code (changes only)

```text
apps/api/
├── prisma/
│   ├── schema.prisma                              # revision, QuestionStatus, QuestionField, answer, field
│   └── migrations/<ts>_cv_editor_my_cvs/migration.sql
├── src/
│   ├── app.setup.ts                               # CORS: allow PUT and DELETE
│   ├── config/env.ts                              # ANSWER_APPLY_TIMEOUT_MS
│   └── modules/
│       ├── ai/
│       │   ├── cv-answer-applier.ts               # port: CvAnswerApplier (apply -> unknown)
│       │   ├── anthropic-answer-applier.ts        # adapter (sibling of anthropic-cv-generator.ts)
│       │   ├── answer-patch.schema.ts             # per-scope Zod patch schemas
│       │   ├── llm-cv-output.schema.ts            # + questions[].field
│       │   ├── ai.module.ts                       # + provider for CvAnswerApplier
│       │   └── prompts/
│       │       ├── cv-draft.prompt.ts             # prompt v2: emit `field`
│       │       └── answer-patch.prompt.ts         # new, centralised
│       └── cv/
│           ├── cv.controller.ts                   # + GET /cvs, DELETE /cvs/:id, PUT /cvs/:id/draft
│           ├── cv.service.ts                      # + list, remove; getResult adds revision; shared retry rule
│           ├── cv-list.query.ts                   # the one raw SQL statement + row schema + DTO mapping
│           ├── display-status.ts                  # pure: status + unresolved count -> display status
│           ├── editing/
│           │   ├── draft-edit.schema.ts           # edit body schema (draft schema + id uniqueness + email format)
│           │   └── cv-editor.service.ts           # updateDraft: compare-and-set on revision
│           ├── clarification/
│           │   ├── question-state.ts              # pure: allowed transitions
│           │   ├── question-target.ts             # pure: field -> (section, path), deterministic apply
│           │   ├── answer-patch.ts                # pure: validate + apply an AI patch to a draft
│           │   ├── clarification.controller.ts    # answer, dismiss, apply routes
│           │   └── clarification.service.ts       # orchestration and the atomic transaction
│           └── generation/
│               ├── draft-mapper.ts                # QuestionRow.field
│               └── draft-validation.ts            # rule: question_field_mismatch
└── test/
    ├── cv-list.e2e-spec.ts   cv-edit.e2e-spec.ts   cv-delete.e2e-spec.ts
    ├── question-answer.e2e-spec.ts   question-apply.e2e-spec.ts   cv-editor-ownership.e2e-spec.ts
    └── helpers/fake-answer-applier.ts

apps/web/src/
├── app/
│   ├── page.tsx                                   # authenticated -> redirect("/cvs")
│   ├── login/login-form.tsx  register/register-form.tsx   # redirect to /cvs
│   └── cvs/
│       ├── layout.tsx                             # + QueryProvider (moved up from [id])
│       ├── page.tsx                               # My CVs (Server Component, initial data)
│       ├── cv-list.tsx  cv-card.tsx  delete-cv-dialog.tsx  cv-list-skeleton.tsx  cv-list-empty.tsx
│       └── [id]/
│           ├── page.tsx                           # COMPLETED -> editor, else generation view
│           ├── cv-editor.tsx                      # RHF form + live preview + save state
│           ├── editor-sections/ contact, summary, experience (nested bullets), education, skills
│           ├── save-indicator.tsx  conflict-banner.tsx
│           ├── clarification-panel.tsx  question-card.tsx
│           └── (result-view.tsx, clarification-questions.tsx removed)
├── components/
│   ├── app-header.tsx                             # "My CVs" nav item with active state
│   └── ui/status-badge.tsx                        # + Draft variant
└── lib/
    ├── api/cvs.ts                                 # list, delete, saveDraft, answer, dismiss, apply + schemas
    └── cv/ display-status.ts  list-poll.ts  draft-form.ts  use-draft-autosave.ts  (+ tests)
```

**Structure Decision**: extend the existing `cv` module and `ai` module; no new Nest module (the clarification code is a sub-folder of `cv`, because its transactions touch `Cv` and `ClarificationQuestion` together). The CV page is one route that renders the view matching the state.

## Design

Full detail lives in the linked files; this section is the review map.

### Revision and concurrency

- `Cv.revision Int @default(0)`. It advances **only when the draft content changes** (manual edit, clarification apply). Answering, dismissing, generation and retry do not advance it. Existing rows start at 0.
- `PUT /api/cvs/:id/draft` body `{ revision, draft }`: one statement `UPDATE ... SET draft, revision = revision + 1 WHERE id AND "userId" AND "generationStatus" = 'COMPLETED' AND revision = :expected`. Zero rows are then explained by one owned read: missing -> `404 CV_NOT_FOUND`; not `COMPLETED` -> `409 CV_NOT_EDITABLE`; otherwise `409 REVISION_CONFLICT`. Success returns `{ revision, updatedAt }`.
- Apply carries the revision the user is looking at. It is checked before the AI call and again inside the transaction (compare-and-set), so a change made while the AI was working rejects the apply and stores nothing.
- Web autosave: debounce 1 s, one save in flight, always sends the newest values, revision advanced from each response. A conflict stops autosave, keeps the local text, and offers **Load latest** (discard local) or **Keep my changes** (an explicit, user-chosen re-save on the latest revision).

### Clarification state model

```text
UNANSWERED --answer--> ANSWERED --answer (edit)--> ANSWERED
UNANSWERED | ANSWERED --dismiss--> DISMISSED            (explicit user action only)
ANSWERED --apply (draft changed, same transaction)--> APPLIED
APPLIED, DISMISSED: terminal and read-only
```

Unresolved = `UNANSWERED`, `ANSWERED` (this is what `openQuestionsCount` counts). Details, CHECK constraints and the migration mapping are in [data-model.md](./data-model.md).

### Deterministic vs AI application

| Question | Rule |
|----------|------|
| `field` set (a single plain value: contact name, email, phone, location, link; entry employer, title, location, start/end date; education institution, qualification, start/end date) | Deterministic. Answer trimmed and validated per field; written only into a **null** field (links are appended). No AI call |
| `field` null, section `EXPERIENCE`, `EDUCATION`, `CONTACT`, `SUMMARY`, `SKILLS` | AI patch, scoped to that section or entry. Output is an additive patch: scalars may fill only null fields, lists are appended. Facts in contact and organisation fields must be supported by the answer text |
| Target entry removed, target field already filled, summary already present | Refused: `409 TARGET_NOT_APPLICABLE`; nothing changes; the user edits by hand or dismisses |
| AI unavailable / invalid output / unsupported fact | `503 AI_UNAVAILABLE` / `422 APPLY_OUTPUT_INVALID`; question stays `ANSWERED`; draft untouched |

### My CVs list query and DTO

One `$queryRaw` (parameterised by the session user id) selects id, target role, generation status, failure reason, `updatedAt`, `candidateName` (`NULLIF(btrim(draft #>> '{contact,fullName}'), '')`) and `openQuestionsCount` (correlated count of unresolved questions), ordered by `updatedAt DESC, id DESC`. Rows are parsed with Zod; the DTO adds `displayStatus` and `canRetry` (the shared retry rule). The draft body is never transferred. See [contracts/cv-editor-api.md](./contracts/cv-editor-api.md).

### Delete

`DELETE /api/cvs/:id` runs `deleteMany WHERE id AND "userId" AND status IN ('COMPLETED','FAILED')`. One row -> `204` (questions removed by the existing FK cascade). Zero rows -> owned read: missing/foreign -> `404 CV_NOT_FOUND`; otherwise `409 CV_GENERATION_ACTIVE`. Because the delete is one conditional statement, it cannot interleave with the generation claim (`PENDING -> PROCESSING`) or a retry.

### Figma nodes planned

Figma file `eIMIhyfYr4eO9gs2pZxhqJ`. The Figma connector could not be reached while planning (proxy refused the tunnel); the node list comes from the earlier inspection and each node is re-inspected with `get_design_context` at the start of the UI phase.

| Screen | Node |
|--------|------|
| My CVs section | `6:6128` ("02 · My CVs") |
| 02.1 populated desktop (4 cards: Draft, Completed, Processing, Failed) | `2:7459` |
| 02.2 empty state | `2:7573` |
| 02.3 mobile | `2:8854` (not yet inspected) |
| Editor 05.1 desktop (completeness, AI assistant, sections, A4 preview) | `6:2671` |
| 05.2 / 05.3 saving / 05.4 / 05.5 | `6:2856`, `6:3039`, `6:3224`, `6:7405` |
| 05.6 AI clarification active | `12:67` |
| Mobile editor 06.1 / 06.3 / 06.4 | `6:5741`, `15:2`, `25:81` |
| UI kit 07.1 (delete confirmation dialog, Saved / Saving / Error, empty state) | `2:8680` |
| UI kit 07.2 | `14:750` |

Figma icon assets are not downloadable from this environment; `lucide-react` icons are used, as in 002.

## Test Strategy

| Spec area | Level | Where |
|-----------|-------|-------|
| Display status for every status and question-state combination; list ordering | unit + e2e | `display-status.spec.ts`; `cv-list.e2e-spec.ts` (real PG: two users, all states, ordering, `openQuestionsCount` excludes applied and dismissed, no draft or source text in the DTO, `userId` ignored, 401) |
| `canRetry` equals the retry rule | e2e | same file: every `FAILED` CV reports `canRetry` and `POST /retry` accepts it; non-`FAILED` do not and `POST /retry` answers 409 |
| Edit: each section, bullet add/edit/remove, invalid -> field errors and no write, non-`COMPLETED` refused, `updatedAt` moves on write and not on read | unit + e2e | `draft-edit.schema.spec.ts`; `cv-edit.e2e-spec.ts` |
| Concurrency: stale -> 409 and nothing stored; two parallel saves on one revision, one wins | e2e | `cv-edit.e2e-spec.ts` (`Promise.all` on a real DB) |
| Answer / dismiss: no CV change, `revision` unchanged, `updatedAt` moves, blank/over-long rejected, resolved read-only, no automatic dismissal | unit + e2e | `question-state.spec.ts`; `question-answer.e2e-spec.ts` |
| Apply: deterministic with 0 AI calls; AI path with exactly the scoped input; invalid, unsupported-fact, provider failure leave draft and question unchanged; forced failure between the two writes rolls both back; double apply once; stale revision during the AI call rejected; target filled or removed refused then dismiss works; unrelated manual edits untouched | unit + e2e | `question-target.spec.ts`, `answer-patch.spec.ts`; `question-apply.e2e-spec.ts` with `fake-answer-applier.ts` |
| Delete: `COMPLETED`/`FAILED` deleted with questions; `PENDING`/`PROCESSING` -> 409 and intact; foreign == missing | e2e | `cv-delete.e2e-spec.ts` |
| Ownership matrix: list, edit, answer, dismiss, apply, retry, delete as user B against A's CV and questions equals the missing-id response; question from another CV not found; 401 matrix | e2e | `cv-editor-ownership.e2e-spec.ts` |
| Generation emits and validates `field`; mismatch is a validation issue | unit + e2e | existing generation specs updated (`draft-validation.spec.ts`, `llm-cv-output.schema.spec.ts`, `cv-draft.prompt.spec.ts`, lifecycle e2e) |
| CORS allows `PUT` and `DELETE` | e2e | preflight test in `smoke.e2e-spec.ts` |
| Migration: applies on a clean DB; existing `OPEN` rows become `UNANSWERED` | manual + e2e | quickstart; CHECK constraints exercised by an e2e that attempts invalid rows |
| Web: list polling only while active, stops otherwise; display-status mapping; save state machine (Saving, Saved, Error, conflict, serialized saves); form <-> draft mapping round trip; Try again only when `canRetry`; Delete not enabled while active | unit | `list-poll.spec.ts`, `display-status.spec.ts`, `use-draft-autosave.spec.ts`, `draft-form.spec.ts` |
| Browser: 320/390/1280 px, no horizontal overflow, reload keeps edits, conflict in two tabs, apply and dismiss, delete dialog, disabled Download PDF | manual (Playwright) | recorded in the final verification checklist |

## Implementation Order (for `/speckit-tasks`)

1. **Schema and shared rules**: migration and Prisma schema; shared retry rule; CORS methods; env var.
2. **Generation emits `field`**: LLM output schema, prompt v2, mapper, validation rule, tests (touches 002 code, deliberately small).
3. **List and delete** (API): query, DTO, display status, `GET /cvs`, `DELETE /cvs/:id`, tests.
4. **Edit** (API): edit schema, `PUT /cvs/:id/draft`, `revision` in the result, tests.
5. **Questions** (API): state rules, answer, dismiss, deterministic apply, AI port/adapter/patch, apply transaction, tests.
6. **Web foundation**: API client functions and schemas, query provider move, header nav, `/` redirect, login/register redirect, `StatusBadge` Draft.
7. **My CVs UI**: list, cards, polling, delete dialog, empty/loading/error, mobile.
8. **Editor UI**: sections, preview, autosave and save indicator, conflict banner, clarification panel.
9. **Navigation copy and verification**: "Back to My CVs", browser run, final spec verification checklist.

Each phase ends with typecheck, lint, unit and e2e green. Phase 2 and 5 carry the review gates for AI-facing code.

## Trade-offs

- **Full-document save** instead of per-section patches: simpler contract and validation; a conflict is per CV, not per field. Acceptable at this scale; the cost is a larger request body (at most about 100 KB).
- **One revision counter for content only**: answering and dismissing are guarded by question state, so typing in an answer box never conflicts with the user's own autosave.
- **Additive AI patches**: the AI can add bullets, skills and links and fill empty fields, but cannot rewrite or replace a filled value. A question whose target is already filled is dismissed or handled by hand. This is stricter than "improve wording" and is the chosen price of never overwriting manual edits.
- **Generation prompt v2**: existing questions have no `field`, so they take the AI path or are dismissed; only newly generated CVs get deterministic apply. The real-model smoke test (T040 of 002) is still not run and now also covers `field`.
- **Raw SQL for the list**: one place, parameterised, parsed with Zod, in exchange for not transferring drafts or parsing them per poll.
- **No `(userId, updatedAt)` index**: not justified at this scale; add when the list query shows up in a real plan.

## Risks

- Prompt v2 changes real-model behaviour that has not been verified against the live API (T040).
- The enum swap migration rewrites `ClarificationQuestion.status`; it is verified on a clean database and on a database holding 002 rows.
- Figma MCP unavailable at planning time: the UI phase must re-inspect nodes and may adjust copy and spacing.
