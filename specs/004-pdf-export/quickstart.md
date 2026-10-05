# Quickstart: Validating PDF Export

A run-and-verify guide for this feature once implemented. Behavior is defined in [contracts/cv-pdf-api.md](./contracts/cv-pdf-api.md). No Anthropic key is needed: the suites never call it, and the manual steps use a CV that is already completed.

## Prerequisites

- Node 24, pnpm 11, Docker; `docker compose up -d postgres`; `pnpm install`.
- Font files present in `apps/api/assets/fonts/` (see the plan's decision 1).

## 1. Automated checks

```bash
pnpm --filter api typecheck && pnpm --filter api lint
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api build
ls apps/api/dist/assets/fonts          # the fonts must be in the build output
pnpm --filter web typecheck && pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```

Expected: all pass with `ANTHROPIC_API_KEY` unset.

## 2. API scenarios (cookie jars as in earlier quickstarts)

```bash
API=http://localhost:3001/api
# A completed CV (use the seed helper, or finish a generation, or any CV that is COMPLETED)
curl -sD - -o cv.pdf -b a.jar $API/cvs/<CV_ID>/pdf | head -12
file cv.pdf                                  # PDF document, version 1.x
```

Expect `200`, `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="..."; filename*=UTF-8''...`, `Cache-Control: private, no-store`.

```bash
# Another user: identical to a missing id
curl -i -b b.jar $API/cvs/<CV_ID>/pdf                 # 404 CV_NOT_FOUND
curl -i -b b.jar $API/cvs/cnonexistentidxxxxxxxxxxx/pdf   # 404 CV_NOT_FOUND
# Signed out and malformed id
curl -i $API/cvs/<CV_ID>/pdf                          # 401
curl -i -b a.jar $API/cvs/not-an-id/pdf               # 400
# A CV that is generating or failed
curl -i -b a.jar $API/cvs/<PROCESSING_OR_FAILED_ID>/pdf   # 409 GENERATION_NOT_READY
```

Read-only check: note `updatedAt` and `revision` of the CV before and after an export; they must not change.

## 3. Inspect the file

```bash
pdfinfo cv.pdf                 # Page size: 595.276 x 841.89 pts (A4); Pages: N
pdftotext -layout cv.pdf -     # the CV text, selectable; no "null", no empty headings
```

Open in a viewer: select text and copy it; search for the candidate's name and email.

## 4. Content cases (use the editor to prepare each, then export)

| Case | Expected |
|------|----------|
| Typical one-page CV | One A4 page; sections in the same order as the preview |
| Only the target role (clear everything else) | One page showing just the role; no placeholders |
| Missing email, dates, locations | Those parts absent; no stray separators |
| Cyrillic and accented text | Exact characters; selectable |
| A very long link in a bullet | Wraps inside the margins; copying it gives the original link |
| Many long experience entries | Several pages; no text cut off; no heading alone at a page bottom; a title never separated from its first bullet |
| An answered but not applied question | Its answer text is not in the PDF; after Apply, the resulting content is |

## 5. Web scenarios (320 to 390 px as well as desktop)

| Step | Expected |
|------|----------|
| Editor, completed CV | Download PDF is enabled |
| Click it | Label shows "Preparing PDF…", further clicks ignored, then the file is saved with the server's file name |
| Type an edit and click immediately | The edit is saved first and is in the PDF |
| Clear a required field (invalid form) and click | No download; the editor's "fix the highlighted fields" guidance |
| Stop the API and click | A clear failure message and a retry; the editor keeps working; no reload needed |
| My CVs, Draft or Completed card | Action enabled, same behavior |
| My CVs, generating or failed card | Action disabled with the reason; no request |
| Phone browser | The file downloads (or the failure message appears) |

## 6. Final review

- The diff matches the spec's FR-001 to FR-027 and SC-001 to SC-008.
- No log line contains CV content, the target role or the file name.
- The editor, its preview, the clarification UX and the My CVs design are unchanged apart from the Download PDF action.
