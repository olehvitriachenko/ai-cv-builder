# Data Model: CV PDF Export

**No database change.** No migration, no new table or column, no index. Exporting is a read-only operation on data defined by 002 and 003.

## Input (read)

| Source | Fields used | Notes |
|--------|-------------|-------|
| `Cv` (owned by the caller, `generationStatus = COMPLETED`) | `targetRole`, `draft` | Selected with an explicit `select`. `draft` is parsed again with the existing `cvDraftSchema` (database JSON is an external boundary). |

Never read for an export: `ClarificationQuestion` (any status), `sourceText`, `failureReason`, `failureDetail`, `revision`, `userId`, timestamps. The query does not select them, so they cannot reach the template.

## Derived (transient, never stored)

```text
CvPdfInput  = { draft: CvDraft, targetRole: string }     // all the renderer ever receives
CvPdfFile   = { bytes: Buffer, filename: string }          // what the service returns to the controller
```

`CvDraft` is the existing type (`apps/api/src/modules/cv/generation/draft.schema.ts`): contact (fullName, email, phone, location, links), summary, experience (id, employer, title, location, startDate, endDate, bullets), education (id, institution, qualification, startDate, endDate, details), skills. All fact-bearing strings are nullable; `null` means "not provided" and is left out of the document.

## Document content mapping

Mirrors the on-screen A4 preview (`apps/web/src/app/cvs/[id]/cv-document.tsx`) so what the owner sees is what they download.

| Draft | Document |
|-------|----------|
| `contact.fullName` | Large name line. Omitted when `null` (no "Name not provided" placeholder in the file) |
| `targetRole` | Uppercase role line under the name; always present |
| `contact.location`, `email`, `phone` | One meta line joined with a middle dot; omitted entirely when all are `null` |
| `contact.links[]` | Second meta line joined with a middle dot; omitted when empty |
| `summary` | "Profile" section; omitted when `null` |
| `experience[]` | "Experience" section; each entry: title (or employer), dates on the right, employer and location line (italic), bullets |
| `education[]` | "Education" section; each entry: qualification (or institution), dates, institution, details |
| `skills[]` | "Skills" section, joined as in the preview; omitted when empty |

A section whose data is empty is not rendered at all (no empty heading). A draft with nothing but a target role renders the role line only, on one A4 page.

## Invariants

1. The export never writes: `Cv.updatedAt`, `revision`, the draft and every question stay exactly as they were.
2. A document is produced only for an owned, `COMPLETED` CV; otherwise 404 (foreign or missing) or 409 (not ready).
3. The document contains only text derived from `draft` and `targetRole`.
