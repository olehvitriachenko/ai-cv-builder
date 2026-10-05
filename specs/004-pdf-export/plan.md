# Implementation Plan: CV PDF Export

**Branch**: `004-pdf-export` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-pdf-export/spec.md`

## Summary

Make the existing, currently disabled **Download PDF** actions work. One read-only endpoint, `GET /api/cvs/:id/pdf`, renders the latest saved draft of an owned, completed CV into an A4 PDF with selectable text, using the library the repository already mandates (`@react-pdf/renderer`). The browser fetches it as a blob (cookie, cross-origin), reads the server's file name, and saves it, with busy, success and failure states.

The smallest shape grounded in what exists (details in [research.md](./research.md)):

- **No database change.** Nothing stored, no migration. The PDF is rendered per request from `Cv.draft` + `Cv.targetRole`.
- **Ownership and "not ready" reuse the existing gate** (`findOwnedOrThrow`, the `GENERATION_NOT_READY` outcome of `/result`).
- **Clarification text cannot leak by construction**: the export query never selects questions, and the renderer only receives `{ draft, targetRole }`.
- **One template mirroring the on-screen A4 preview**, so the downloaded file is what the owner saw.
- **The editor's existing saved-state pattern** (`autosaver.flush()`, `unsaved`, `blockedReason`) gates the download; no change to the autosaver.
- **Findings that shape the work** (all verified with throwaway scripts, see research): the library works here and yields real A4 text; it is missing its `react` peer in `apps/api`; built-in fonts corrupt Cyrillic, so fonts must be embedded; default hyphenation corrupts links and long unbroken text overflows the margin, solved by disabling hyphenation and chunking pathological tokens; `Content-Disposition` must be exposed through CORS for the cross-origin browser app.

## Technical Context

**Language/Version**: TypeScript (strict), ESM. API: NestJS 12 + Fastify 5 on Node 24. Web: Next.js 16 / React 19.

**Primary Dependencies**: `@react-pdf/renderer` 4.9.0 (already declared), `unpdf` (already used, tests read PDFs back). **One addition to `apps/api`: `react@19.2.8` + `@types/react`** (the library's peer; same version as `apps/web`). No new library. Font files are vendored assets (Inter and Lora, SIL OFL), not a dependency.

**Storage**: none. No migration, no new column, no index.

**Testing**: Vitest. Unit: filename normalization, template/renderer (read back with `unpdf`: A4, page count, text, order, margins), the web download flow. E2E on real PostgreSQL via Fastify `inject()`: ownership, headers, states, no-clarification-leak, latest-state. No Anthropic anywhere.

**Target Platform**: Linux/macOS Node server; desktop and mobile browsers.

**Project Type**: Web application (pnpm monorepo `apps/api`, `apps/web`).

**Performance Goals**: A typical CV renders in well under a second (measured ~200 ms for a 4-page document); maximum-size draft renders within the same request without a timer. Draft caps (002) bound the work.

**Constraints**: Constitution and `.claude/rules/*` (A4, selectable text, `@react-pdf/renderer`, ownership before export, persisted data only, no screenshots); no `any`, no unsafe casts; follow `.claude/rules/file-structure.md`; do not redesign the editor, clarification UX or My CVs.

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Product contract | Delivers "export the final CV as an A4 PDF with selectable text". One template, as required |
| II. Strict types | The renderer takes `CvPdfInput`; the stored draft is parsed with `cvDraftSchema` before use; no casts |
| IV/V. Ownership and auth | Same owner-scoped query and 404/409 gate as `/result`; session identity only |
| Untrusted data | Database JSON re-parsed; file name derived through a normalizer; no CV text in logs |
| Simplicity | No storage, no queue, no cache, no template system, no new library |
| Testing | Ownership, headers, empty/partial/long/maximum drafts, no-leak and web flow all covered; no real AI call |

No violations; no entry needed in a complexity table.

## Project Structure

### Documentation (this feature)

```text
specs/004-pdf-export/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/cv-pdf-api.md
├── quickstart.md
├── tasks.md
└── checklists/requirements.md
```

### Source Code (changes only)

```text
apps/api/
├── assets/fonts/                         NEW  Inter-{Regular,Medium,SemiBold}.ttf, Lora-{Regular,Italic}.ttf + OFL texts
├── nest-cli.json                         EDIT copy assets/fonts/** to dist (shared config)
├── tsconfig.json                         EDIT "jsx": "react-jsx" (shared config)
├── package.json (+ pnpm-lock.yaml)       EDIT add react, @types/react (shared)
└── src/
    ├── app.setup.ts                      EDIT CORS exposedHeaders: Content-Disposition (shared)
    └── modules/
        ├── pdf/
        │   ├── pdf.module.ts             EDIT provide + export CvPdfRenderer
        │   └── export/
        │       ├── cv-pdf.document.tsx   NEW  the one A4 template
        │       ├── cv-pdf.fonts.ts       NEW  register embedded fonts once; hyphenation off
        │       ├── cv-pdf-renderer.service.ts NEW  render({draft,targetRole}) -> Buffer
        │       ├── pdf-filename.ts       NEW  safe file name (+ Content-Disposition value)
        │       └── *.spec.ts             NEW  filename, renderer (via unpdf)
        └── cv/
            ├── cv.controller.ts          EDIT +GET :id/pdf (shared; additive)
            ├── cv.module.ts              EDIT +CvExportService provider (shared; additive)
            └── services/cv-export.service.ts NEW  ownership gate + load + render + log
apps/api/test/cv-export.e2e-spec.ts       NEW

apps/web/src/
├── lib/api/fetcher.ts                    EDIT (1 word) export toApiError  [shared, see overlap]
├── lib/api/cv-pdf.ts                     NEW  fetchCvPdf(id) -> { blob, filename }
├── lib/cv/download-flow.ts (+ .test.ts)  NEW  pure flow: canDownload, outcome copy, filename parsing, save
├── app/cvs/download-pdf-button.tsx       NEW  button + busy/failure UI, shared by editor and card
├── app/cvs/[id]/editor-workspace.tsx     EDIT replace the disabled button block only  [OVERLAP]
└── app/cvs/cv-card.tsx                   EDIT replace the disabled button only (US4, P2)  [OVERLAP]
```

## Design

### API

`GET /api/cvs/:id/pdf` ([contract](./contracts/cv-pdf-api.md)). The controller is thin: validate `:id`, get `@CurrentUser()`, call `CvExportService.export(userId, id)`, set the headers, send the bytes.

`CvExportService.export`:
1. `findOwnedOrThrow(userId, id)` -> 404 `CV_NOT_FOUND` for foreign and missing; not `COMPLETED` -> 409 `GENERATION_NOT_READY` (same helper pattern as `getResult`).
2. `findFirst({ where: { id, userId, generationStatus: 'COMPLETED' }, select: { targetRole, draft } })`. No questions selected.
3. `cvDraftSchema.parse(draft)` (a failure is the generic 500; nothing is echoed).
4. `CvPdfRenderer.render({ draft, targetRole })` -> `Buffer`.
5. `pdfFilename(draft.contact.fullName, targetRole)` -> safe name.
6. One structured log line: cv id, outcome, bytes, pages (if cheap), duration. Never content.

`CvPdfRenderer` (in `PdfModule`, beside the text extractor) is a pure function of its input; it calls `renderToBuffer(<CvPdfDocument .../>)`. Fonts are registered once at module load from `assets/fonts` via `import.meta.url`-relative paths; hyphenation is disabled so text is exactly the draft's.

### Template and pagination

A4 portrait, 54 pt side margins (matches the preview's 54 px padding), Lora for body, Inter for name meta and headings, section headings with a thin rule, same order and wording as `cv-document.tsx` ("Profile", "Experience", "Education", "Skills"). Missing facts and empty sections are not rendered. Pagination uses `wrap` with `minPresenceAhead` on headings and `wrap={false}` on an entry's title row plus its first bullet. Tokens longer than a threshold (about 40 characters without whitespace) render as chunks in a wrapping row so they stay inside the margins; the extracted text still equals the original (verified).

### Web

`fetchCvPdf(id)` does `fetch(.../cvs/:id/pdf, { credentials: 'include' })`; a non-OK response is turned into the same `ApiError` the rest of the app uses (so 401 and 404 handling stays uniform); on success it returns the blob and the filename parsed from `Content-Disposition` (`filename*` first, then `filename`, then `CV.pdf`).

`download-flow.ts` is framework-free with browser APIs injected: `canDownloadFromList(item)` (display status Draft or Completed), `downloadOutcome(error)` to user-facing copy (401 -> sign in, 404/409 -> no longer available / not ready, other -> "We couldn't prepare your PDF. Try again."), and `saveBlob(blob, filename, deps)` (object URL, anchor click, revoke).

`DownloadPdfButton` owns the busy state (`aria-busy`, label "Preparing PDF…", ignores clicks while busy) and an inline `role="alert"` failure message under or next to the action. In the editor it receives a `beforeDownload` callback that runs the existing `flush()` and refuses with the editor's existing wording when the form is invalid, a conflict is unresolved or the flush fails. In the My CVs card it has no precondition.

### Concurrency and consistency

The export reads the row once and renders from that snapshot, so a concurrent edit cannot produce a half-old, half-new document. A save that lands after the read is simply not in this file. Exporting never writes, so it cannot race with the editor's revision checks.

## Test Strategy

| Layer | What |
|-------|------|
| Unit `pdf-filename` | unsafe characters, separators, quotes, control chars, emoji, long text, Cyrillic (kept in `filename*`, ASCII fallback), empty, default, extension |
| Unit renderer (read back with `unpdf`) | A4 size on every page; real text (name and email present and in order); partial draft (no placeholders, no empty headings); empty draft (one page, role only); typical draft (section order matches preview); Cyrillic and accents exact; long unbroken token inside margins and text identical; page breaks (long draft: several pages, every string present, no text beyond margins, no heading as the last line of a page); maximum-size draft succeeds |
| E2E `cv-export` | 200 with PDF bytes (`%PDF`), `application/pdf`, attachment + safe filename, `no-store`, `nosniff`; user B gets 404 identical to a missing id; 401 signed out; 400 malformed id; 409 for pending, processing, failed; open questions do not block; an **unapplied answer's text is absent** from the PDF and an applied change is present; latest saved state after `PUT /draft`; export leaves `updatedAt` and `revision` unchanged; client `userId` ignored |
| Unit web `download-flow` | filename parsing (`filename*`, `filename`, fallback), outcome copy per status, `saveBlob` creates and revokes the URL and clicks once, list eligibility |
| Manual (quickstart) | open the file in a viewer: select text, A4, Cyrillic, phone download |

No test calls Anthropic or the network.

## Implementation Order (for `/speckit-tasks`)

1. Gates and setup: confirm the three decisions below; add `react`, `jsx`, assets config, fonts.
2. Pure parts first, test-first: filename, fonts registration, template, renderer (this proves A4/text/margins before any HTTP).
3. Endpoint + service + CORS, with the e2e suite (US2 and the API half of US1).
4. Web: flow and button (new files, no overlap), then the one-block edits in the editor (US1) and the card (US4).
5. Polish: typecheck, lint, unit, e2e, build (API and web), `nest build` font check, quickstart.

API work first because it overlaps nothing the other agent is redesigning.

## Overlap with the editor redesign (report before editing)

The other agent is committing on the same feature line (`apps/web` editor, My CVs, create flow). The plan keeps every shared-file edit tiny and last.

| File | Overlap risk | Change | Mitigation |
|------|--------------|--------|-----------|
| `apps/web/src/app/cvs/[id]/editor-workspace.tsx` | **High** (edited in 3 recent commits) | Replace the one disabled `Button ... Download PDF` block with `<DownloadPdfButton ...>` and pass the existing `flush`/`invalid`/`saveState` | Land after all new files; one hunk; ask the owner before editing |
| `apps/web/src/app/cvs/cv-card.tsx` | **High** (3 recent commits) | Replace the one disabled button (US4, P2) | Same; can be deferred or dropped without affecting US1 |
| `apps/web/src/lib/api/fetcher.ts` | Medium (3 commits) | Add `export` to the existing `toApiError` so the new download code reuses error parsing | One word; alternative is to duplicate ~20 lines in `lib/api/cv-pdf.ts` |
| `apps/web/src/lib/cv/card-copy.ts` | Low | A comment says the action is "disabled until the PDF export feature exists"; update only if `cv-card.tsx` is edited | Optional |
| `apps/api/src/app.setup.ts` | Low-Medium | `exposedHeaders: ['Content-Disposition']` in the CORS config | One line |
| `apps/api/src/modules/cv/cv.controller.ts`, `cv.module.ts` | Low | Additive: one route, one provider | None |
| `apps/api/package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `nest-cli.json` | Low (repo config) | `react`, `@types/react`, `jsx`, assets copy | Single commit, reviewed separately |
| `apps/web/src/lib/api/cvs.ts` (hot file) | **Avoided** | Not touched; the PDF call lives in a new `lib/api/cv-pdf.ts` | |
| `apps/web/src/components/ui/*`, `globals.css`, editor sections, `cv-document.tsx`, clarification files | **Avoided** | Not touched | |

## Decisions needed before implementation

1. **Fonts (download).** Embed Inter (400/500/600) and Lora (400, 400 italic), SIL OFL, as vendored TTFs under `apps/api/assets/fonts/` with licences. Without embedded fonts Cyrillic is garbled. Needs your OK to fetch the files.
2. **One dependency addition to `apps/api`**: `react@19.2.8` and `@types/react` (peer of `@react-pdf/renderer`), plus `"jsx": "react-jsx"` in `apps/api/tsconfig.json`.
3. **Shared-file edits** listed above, in particular the two `apps/web` hunks (editor header action, My CVs card action).

## Trade-offs

- **Render per request, no cache or storage**: simplest and always the latest saved state; costs a few hundred ms per click, acceptable at this scale. Caching would add invalidation risk for no benefit.
- **Synchronous render inside the request**: fine for bounded drafts; a queue would be over-engineering. If a render ever became slow, the busy state already covers the UX.
- **Blob download over a plain link**: lets the UI show errors and keeps the editor usable, at the cost of holding the file in memory (tens of KB).
- **Chunking only pathological tokens**: ordinary text keeps normal word wrapping and selection behavior.
- **No page numbers or footer**: keeps ATS-friendly output and the template minimal.

## Risks

- **`@react-pdf` layout surprises** (orphans, odd breaks): mitigated by position-based tests and the manual quickstart check; the fallback is a smaller threshold or `wrap={false}` on larger groups.
- **Font assets not copied by `nest build`**: mitigated by the `assets` setting and an explicit build-output check in the tasks.
- **CORS header not exposed**: the browser would still download but lose the filename; covered by a test of the header and a fallback name in the client.
- **Merge friction in the two shared web files**: mitigated by order, minimal hunks and asking first.
