# Tasks: CV PDF Export

**Input**: Design documents from `/specs/004-pdf-export/` (spec.md, plan.md, research.md, data-model.md, contracts/cv-pdf-api.md, quickstart.md)

**Prerequisites**: the three decisions in plan.md ("Decisions needed before implementation") are confirmed. Tasks marked **GATE** must not start before that confirmation. The two web tasks that edit files the other agent is redesigning (T021 `editor-workspace.tsx`, T022 `cv-card.tsx`) also need an explicit go-ahead (T024).

**Format**: `[ID] [P?] [Story] Description with file path`. `[P]` = can run in parallel (different files, no dependency). Tests are part of each phase and written before the code they cover where practical. All paths are repository-relative.

User stories (priorities from spec.md): **US1** download from the editor (P1), **US2** owner-only and finished-only access (P1), **US3** readable output for any CV (P1), **US4** download from My CVs (P2).

---

## Phase 1: Setup (shared infrastructure)

- [ ] T001 **GATE** Add `react@19.2.8` and `@types/react` to `apps/api/package.json` (same React version as `apps/web`; peer of `@react-pdf/renderer`) and update `pnpm-lock.yaml`; add `"jsx": "react-jsx"` to `apps/api/tsconfig.json`. Commit as a standalone config commit.
- [ ] T002 **GATE** Vendor the embedded fonts into `apps/api/assets/fonts/`: Inter Regular, Medium, SemiBold and Lora Regular, Italic as static `.ttf` (Latin and Cyrillic coverage), each with its SIL OFL licence text. Record source and version in `apps/api/assets/fonts/README.md`.
- [ ] T003 Add the `assets` option to `apps/api/nest-cli.json` so `assets/fonts/**` is copied to `dist/assets/fonts`; verify with `pnpm --filter api build` that `apps/api/dist/assets/fonts/*.ttf` exists and that `dist/src/modules/pdf/export/` resolves `../../../../assets/fonts` to it.

**Checkpoint**: the API compiles `.tsx`, fonts exist in source and in the build output.

---

## Phase 2: Foundational (renderer and file name, no HTTP yet)

**Purpose**: prove A4, selectable text, margins and pagination before any endpoint exists. Blocks US1 to US4.

### Tests first

- [ ] T004 [P] [US3] Write `apps/api/src/modules/pdf/export/pdf-filename.spec.ts`: path separators, quotes, control characters, emoji and very long input are removed or bounded (80 characters before `.pdf`); whitespace becomes `-`; Cyrillic is kept in the percent-encoded `filename*` and replaced by an ASCII-safe fallback in `filename`; empty or unusable input gives `CV.pdf`; the extension is always `.pdf`; the `Content-Disposition` value is built correctly (FR-017).
- [ ] T005 [P] [US3] Write `apps/api/src/modules/pdf/export/cv-pdf-renderer.service.spec.ts`. Render with the real renderer and read the bytes back with `unpdf` (`getDocumentProxy`, `getTextContent`). Cases: output starts with `%PDF` and every page is 595.28 x 841.89 pt (FR-005); name and email are real text, found in order (SC-002); typical draft has sections in preview order Profile, Experience, Education, Skills (SC-006); partial draft has no "null", no placeholder wording, no empty heading, no dangling separator (FR-007, SC-004); empty draft gives one page containing only the target role (FR-008); Cyrillic and accented text read back exactly (FR-009); a 240-character link stays inside the right margin and reads back identical (FR-012); a long draft spans several pages, contains every string, has no text item beyond the margins, and no page ends with a section heading (FR-010, FR-011); the maximum-size draft (30 experience x 12 bullets, 10 education, 60 skills) renders (FR-013, SC-005).

### Implementation

- [ ] T006 [US3] Create `apps/api/src/modules/pdf/export/pdf-filename.ts` to satisfy T004: a pure `pdfFilename(name, role)` returning `{ ascii, utf8 }` and a helper that formats the `Content-Disposition` value.
- [ ] T007 [US3] Create `apps/api/src/modules/pdf/export/cv-pdf.fonts.ts`: register the embedded fonts once from `../../../../assets/fonts/` using `import.meta.url`-relative URLs, and disable hyphenation with `Font.registerHyphenationCallback((word) => [word])`. Fail with a clear error at first use if a font file is missing.
- [ ] T008 [US3] Create `apps/api/src/modules/pdf/export/cv-pdf.document.tsx`: the one A4 template (54 pt side margins, Lora body, Inter headings and meta, thin rules) mirroring `apps/web/src/app/cvs/[id]/cv-document.tsx` and the mapping in `data-model.md`; omit missing facts and empty sections; section headings use `minPresenceAhead`; an experience entry's title row and first bullet use `wrap={false}`; tokens longer than about 40 non-space characters render as chunks in a wrapping row (research D-5).
- [ ] T009 [US3] Create `apps/api/src/modules/pdf/export/cv-pdf-renderer.service.ts`: an injectable `CvPdfRenderer` with `render(input: { draft: CvDraft; targetRole: string }): Promise<Buffer>` using `renderToBuffer`; register and export it in `apps/api/src/modules/pdf/pdf.module.ts`. Make T004 and T005 pass.

**Checkpoint**: `pnpm --filter api test` is green for the new specs; the renderer is correct without HTTP.

---

## Phase 3: User Story 2 + API half of User Story 1 (Priority: P1)

**Goal**: an owner gets the PDF of a completed CV; everyone else gets nothing.

**Independent test**: the e2e suite below.

### Tests first

- [ ] T010 [US2] Write `apps/api/test/cv-export.e2e-spec.ts` (real PostgreSQL, Fastify `inject()`, helpers `createTestApp`, `registerUser`, `createCvFromText`, `seedCompleted`, `seedFailed`, `seedProcessing`, `seedQuestion`, `sampleDraft`). Cases:
  - owner: `200`, body starts with `%PDF`, `Content-Type: application/pdf`, `Content-Disposition` is `attachment` with a safe `filename` and `filename*`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Length` equals the body length;
  - foreign user: `404 CV_NOT_FOUND` identical to a nonexistent id (same body and status), no PDF bytes, no filename;
  - signed out `401`; malformed id `400`;
  - `409 GENERATION_NOT_READY` for pending, processing and failed CVs;
  - open clarification questions do not block export (`200`);
  - an `ANSWERED`-but-unapplied question with a distinctive answer: its text is absent from the extracted PDF text, and the question text is absent too (FR-003, SC-007);
  - an applied change (already in the draft) is present (FR-004);
  - latest saved state: after `PUT /api/cvs/:id/draft` the next export contains the new text;
  - read-only: `updatedAt` and `revision` are unchanged by an export (FR-016);
  - a client-sent `userId` (query and header) is ignored.
- [ ] T011 [P] [US1] Add a CORS assertion to `apps/api/test/cors.e2e-spec.ts` (additive case): a cross-origin request exposes `Content-Disposition` through `Access-Control-Expose-Headers`.

### Implementation

- [ ] T012 [US2] Create `apps/api/src/modules/cv/services/cv-export.service.ts`: `CvExportService.export(userId, cvId)` that uses `findOwnedOrThrow` (404) then the `COMPLETED` check (409 `GENERATION_NOT_READY`), loads `findFirst({ where: { id, userId, generationStatus: 'COMPLETED' }, select: { targetRole: true, draft: true } })` **without** questions, parses the draft with `cvDraftSchema`, calls `CvPdfRenderer.render`, builds the filename, and writes one structured log line (cv id, outcome, bytes, duration; no content).
- [ ] T013 [US2] Add `GET :id/pdf` to `apps/api/src/modules/cv/cv.controller.ts` (thin: `ZodValidationPipe(cvIdSchema)`, `@CurrentUser()`, set `Content-Type`, `Content-Disposition`, `Content-Length`, `Cache-Control`, `X-Content-Type-Options`, send the bytes) and provide `CvExportService` in `apps/api/src/modules/cv/cv.module.ts`. **Shared files, additive only.**
- [ ] T014 [US1] Add `exposedHeaders: ['Content-Disposition']` to the CORS options in `apps/api/src/app.setup.ts`. **Shared file, one line.** Make T010 and T011 pass.

**Checkpoint**: the whole API contract of `contracts/cv-pdf-api.md` passes in e2e; no web change yet.

---

## Phase 4: User Story 1 - web, editor action (Priority: P1)

**Goal**: the editor's Download PDF works with busy and failure states and never exports unsaved or invalid content.

**Independent test**: web unit tests plus the quickstart web scenarios.

### Tests first

- [ ] T015 [P] [US1] Write `apps/web/src/lib/cv/download-flow.test.ts`: `filename*` parsed before `filename`, then the fallback `CV.pdf`; percent-encoded UTF-8 names decoded; `downloadOutcome` gives sign-in for 401, "no longer available" for 404, "not ready yet" for 409, the generic retry message otherwise (and for a network error); `saveBlob` creates an object URL, clicks one anchor with the filename, then revokes the URL; `canDownloadFromList` is true only for display status `DRAFT` and `COMPLETED`.

### Implementation

- [ ] T016 [US1] Create `apps/web/src/lib/cv/download-flow.ts` (framework-free, browser APIs injected) to satisfy T015.
- [ ] T017 [US1] **Shared file, one word:** export `toApiError` from `apps/web/src/lib/api/fetcher.ts` (alternative: duplicate the small parser in T018). Report before editing.
- [ ] T018 [US1] Create `apps/web/src/lib/api/cv-pdf.ts`: `fetchCvPdf(id)` calling `GET /cvs/:id/pdf` with `credentials: 'include'` and `Accept: application/pdf`, mapping a non-OK response to `ApiError`, and returning `{ blob, filename }` read from `Content-Disposition`. No `any`, no cast: check `response.ok` and the content type before reading the blob.
- [ ] T019 [US1] Create `apps/web/src/app/cvs/download-pdf-button.tsx` (client component): the existing compact `Button` look with the `Download` icon, `aria-busy`, label "Preparing PDF…" while busy, ignores clicks while busy, inline `role="alert"` message from `downloadOutcome` with a retry, redirect to `/login` on 401; accepts an optional `beforeDownload` that can refuse with a message and a `disabledReason`.
- [ ] T020 [P] [US1] Write `apps/web/src/lib/cv/download-flow.test.ts` additions (or a sibling `before-download.test.ts`) for the editor gate: invalid form, unresolved conflict and a failed flush all refuse with the editor's existing wording and do not call `fetchCvPdf`; a successful flush proceeds. (Pure function in `download-flow.ts`.)
- [ ] T021 [US1] **Shared file, one block; report and wait for the go-ahead (T024 gate):** in `apps/web/src/app/cvs/[id]/editor-workspace.tsx` replace the disabled `Button ... Download PDF` block with `<DownloadPdfButton>` passing a `beforeDownload` built from the existing `invalid`, `saveState` and `autosaver.flush()`. Change nothing else in the file.

**Checkpoint**: from the editor the owner downloads the saved CV; unsaved edits are saved first; failures are clear.

---

## Phase 5: User Story 4 - My CVs card action (Priority: P2)

**Goal**: the existing card action works where a draft exists and is disabled with a reason otherwise.

- [ ] T022 [US4] **Shared file, one block; report and wait for the go-ahead:** in `apps/web/src/app/cvs/cv-card.tsx` replace the disabled `Download PDF` button with `<DownloadPdfButton>` using `canDownloadFromList(item)` for enabled state and a `disabledReason` ("Available once your CV is ready") otherwise. No layout or style change to the card.
- [ ] T023 [P] [US4] Update the stale comment in `apps/web/src/lib/cv/card-copy.ts` ("disabled until the PDF export feature exists") only if T022 is done; extend `apps/web/src/lib/cv/card-copy.test.ts` only if `cardActions` changes (it should not).

**Checkpoint**: both entry points work; the My CVs design is unchanged.

---

## Phase 6: Polish and verification

- [ ] T024 Before T021 and T022, send the owner the exact hunks for `editor-workspace.tsx` and `cv-card.tsx` and wait for approval; re-check `git log origin/<branch> -- <file>` for new commits by the other agent first and merge them.
- [ ] T025 [P] Run `pnpm --filter api typecheck`, `pnpm --filter api lint`, `pnpm --filter api test`, `pnpm --filter api test:e2e`, `pnpm --filter api build`, then confirm `apps/api/dist/assets/fonts/*.ttf` exists and a built-app export still renders Cyrillic (start `dist` and export a seeded CV).
- [ ] T026 [P] Run `pnpm --filter web typecheck`, `pnpm --filter web lint`, `pnpm --filter web test`, `pnpm --filter web build`.
- [ ] T027 Execute the manual parts of `quickstart.md` (sections 3 to 5): inspect with `pdfinfo`/`pdftotext`, open in a viewer (select and search text), Cyrillic, long link, long CV, and a phone-width browser; fix anything found.
- [ ] T028 Final review against the spec: FR-001 to FR-027 and SC-001 to SC-008 each map to a test or a quickstart step; no log line contains CV content; the editor, preview, clarification UX and My CVs design are unchanged except the Download PDF actions; list every shared file touched in the final report.

---

## Dependencies and order

- Phase 1 (T001 to T003) first; T001 and T002 are gated on approval.
- Phase 2 depends on Phase 1; within it, tests T004 and T005 first, then T006 to T009.
- Phase 3 depends on Phase 2 (T009).
- Phase 4 depends on Phase 3 for a real end-to-end check, but T015 to T019 only need the contract and can start once Phase 2 is done; T021 waits for the approval in T024.
- Phase 5 depends on T019 and the approval in T024.
- Phase 6 last.

## Parallel opportunities

- T004 and T005 (different specs); T011 alongside T010.
- T015, T016 and the API phase 3 can proceed in parallel once Phase 2 is done (different apps, no shared files).
- T025 and T026 (different apps).

## Implementation strategy

- **MVP**: Phases 1 to 4 (US1, US2, US3): export works from the editor with full security and output quality. US4 is an optional increment and can be cut first.
- **Cut order if time runs short**: T022 and T023 (card), then T020 extras, then the maximum-size case in T005 (keep a typical-plus-long case).
- Keep every shared-file edit last and minimal; commit config (T001, T003), assets (T002), API, web new files and the two web hunks separately.
