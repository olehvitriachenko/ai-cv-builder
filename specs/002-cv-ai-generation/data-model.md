# Data Model: CV Input and AI Generation Lifecycle

PostgreSQL via Prisma, one new migration. The `Cv` table gains the generation lifecycle, source and draft; one new table holds clarification questions. `User` and `Session` are unchanged.

## Design stance

- **The `Cv` row is the job.** One generation per CV (spec assumption). No separate jobs table and no queue: the state column plus compare-and-set updates are the mechanism (see research D-4).
- **The draft is one validated JSON document**, written only after validation and read back through Zod. Clarification questions are rows.
- Everything that can leak personal content (source text, draft) lives only in these columns and is never logged.

## Enums (new)

| Enum | Values | Notes |
|------|--------|-------|
| `GenerationStatus` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` | The lifecycle |
| `SourceType` | `FREE_TEXT`, `PDF` | How the source was supplied |
| `FailureReason` | `PROVIDER_UNAVAILABLE`, `PROVIDER_NOT_CONFIGURED`, `INVALID_OUTPUT`, `TIMED_OUT`, `INTERRUPTED`, `UNKNOWN` | Closed, safe, categorised (FR-018). Generation failures only: unreadable PDFs never reach this table (they are rejected at ingestion). A model refusal is `INVALID_OUTPUT` with detail `refusal`. `INTERRUPTED` = found `PROCESSING` at startup. `UNKNOWN` also marks rows from before this feature |
| `QuestionSection` | `CONTACT`, `SUMMARY`, `EXPERIENCE`, `EDUCATION`, `SKILLS` | The five draft sections |
| `QuestionStatus` | `OPEN`, `RESOLVED` | Only `OPEN` is written in this feature; `RESOLVED` is for the answers feature |

## `Cv` (extended)

Existing columns (`id`, `userId`, `targetRole`, `createdAt`, `updatedAt`, FK to `User` with cascade) are kept. `targetRole` stays nullable in the database so old rows remain valid, but the API always requires it for new CVs.

| Column | Type | Rules |
|--------|------|-------|
| `generationStatus` | `GenerationStatus`, not null | Set explicitly on every insert. Existing rows are backfilled to `FAILED` / `UNKNOWN` |
| `sourceType` | `SourceType`, nullable | Always set for new CVs; null only for pre-feature rows |
| `sourceText` | text, nullable | The free text or the text extracted from the PDF, trimmed, 50 to 20,000 characters. Always set for new CVs; null only for pre-feature rows. **Untrusted content**; never logged. The original PDF is never stored |
| `failureReason` | `FailureReason`, nullable | Set exactly when status is `FAILED` |
| `failureDetail` | text, nullable, at most 200 characters | Safe debugging tokens only: HTTP status code, error class name, validation rule ids and JSON paths. Never messages, values or source text |
| `generationAttempts` | int, default 0 | Incremented each time processing starts (initial run, each manual retry). Kept for diagnosis only; no logic depends on it |
| `processingStartedAt` | timestamp, nullable | Set when claimed; the reference for the timeout |
| `finishedAt` | timestamp, nullable | Set on `COMPLETED` or `FAILED`; cleared on retry |
| `draft` | JSON, nullable | The validated `CvDraft` (below). Set exactly when status is `COMPLETED` |
| `promptVersion` | text, nullable | e.g. `cv-draft-v1`, recorded with the draft |
| `aiModel` | text, nullable | The model id that produced the draft |

Relations: has many `ClarificationQuestion`.

### Database invariants (CHECK constraints added in the migration)

1. `COMPLETED` implies `draft IS NOT NULL`.
2. `FAILED` implies `failureReason IS NOT NULL`, and a non-`FAILED` row has `failureReason IS NULL`.
3. `PENDING` or `PROCESSING` implies `sourceText IS NOT NULL` (a job always has something to process).

Prisma cannot express CHECK constraints, so they are written as raw SQL in the migration file (constitution IX: invariants in the database where appropriate).

### Index (new, for real query patterns)

- `(generationStatus, createdAt)`: "oldest `PENDING`" for the runner and "`PROCESSING` older than X" for the timeout sweep. The existing `userId` index still serves the ownership query.

### Migration notes

- One migration: create the enums, add the columns, backfill existing rows (`generationStatus = 'FAILED'`, `failureReason = 'UNKNOWN'`, `finishedAt = now()`), add the CHECK constraints and the index, create `ClarificationQuestion`.
- Backfilling avoids leaving old rows as `PENDING` forever (they have no source). There is no data loss.

## `ClarificationQuestion` (new)

| Column | Type | Rules |
|--------|------|-------|
| `id` | cuid, primary key | |
| `cvId` | string, not null | FK to `Cv`, `ON DELETE CASCADE` |
| `section` | `QuestionSection`, not null | The CV section the question concerns |
| `itemId` | string, nullable | The `id` of a specific experience or education entry in the draft when the question is about one entry; null for section-level questions. A reference by value, not a foreign key, because entries live inside the JSON document |
| `missing` | text, not null, at most 300 characters | What is missing, vague or contradictory (the "issue") |
| `question` | text, not null, at most 300 characters | The question shown to the user |
| `status` | `QuestionStatus`, default `OPEN` | |
| `position` | int, not null | Display order within the CV |
| `createdAt` | timestamp, default now | |

Index: `cvId`. At most 10 rows per CV (enforced by validation before insert).

## `CvDraft` (the JSON stored in `Cv.draft`)

Validated by a Zod schema on write and again on read. All fact-bearing strings are nullable: **null means "the source did not support this"** (FR-027).

```text
CvDraft
  schemaVersion : 1
  contact
    fullName   : string | null     (<= 120)
    email      : string | null     (<= 254)
    phone      : string | null     (<= 40)
    location   : string | null     (<= 120)
    links      : string[]          (<= 5 items, each <= 200)
  summary      : string | null     (<= 1200)
  experience   : ExperienceEntry[] (<= 30)
  education    : EducationEntry[]  (<= 10)
  skills       : string[]          (<= 60 items, each <= 60)

ExperienceEntry
  id           : string            server-generated, stable
  employer     : string | null     (<= 200)
  title        : string | null     (<= 200)
  location     : string | null     (<= 120)
  startDate    : string | null     as written in the source (<= 40)
  endDate      : string | null     as written in the source (<= 40), may say "Present" only if the source does
  bullets      : string[]          (<= 12 items, each <= 300)

EducationEntry
  id           : string            server-generated, stable
  institution  : string | null     (<= 200)
  qualification: string | null     (<= 200)
  startDate    : string | null
  endDate      : string | null
  details      : string | null     (<= 300)
```

Invariants: an experience entry has at least one of `employer`/`title`; an education entry has at least one of `institution`/`qualification`; no empty strings (null instead); `bullets` items are non-empty. The `schemaVersion` lets the later editor migrate the document. It is sufficient for the manual editor, clarification updates (entry ids give questions a stable target) and A4 rendering, without a generic document engine.

### What the model returns (not persisted as is)

The model fills a looser, JSON-Schema-friendly shape: the same sections **without ids**, plus `questions[]` with `section`, `itemIndex` (the zero-based position of the entry inside its section, or null), `missing` and `question`. After Zod and domain validation the pipeline assigns entry ids and converts each `itemIndex` into the matching `itemId`. A question whose index does not exist fails validation. This keeps ids out of model output, so a model can never fabricate or collide ids.

## Lifecycle and transitions

```text
create (free text, or PDF with usable text) -> PENDING
create (PDF that cannot be used)            -> nothing is created (422 / 400 at ingestion)

PENDING     --claim (compare-and-set, attempts+1)-->            PROCESSING
PROCESSING  --valid output, compare-and-set + store draft-->   COMPLETED
PROCESSING  --failure after bounded retry, or abort-->         FAILED (reason)
PROCESSING  --older than the timeout (sweep / in-process)-->   FAILED (TIMED_OUT)
PROCESSING  --found at application start-->                    FAILED (INTERRUPTED)
FAILED      --owner retry (stored source present)-->           PENDING   (failure fields and timestamps cleared)
```

A `PROCESSING` row is **never** moved back to `PENDING` automatically: its in-flight request was lost with the process, and the user decides whether to retry.

Rules enforced by compare-and-set (`UPDATE ... WHERE id = ? AND generationStatus = <expected>`, success = exactly one row):

- Only the process that moved `PENDING` -> `PROCESSING` runs the job.
- A completion or failure is applied only if the row is still `PROCESSING`. A job that finishes after being timed out or marked interrupted cannot overwrite `FAILED`; its result is discarded. A stale or duplicate worker therefore cannot change a terminal state.
- Startup interruption and the timeout sweep also apply only to rows that are still `PROCESSING`.
- A retry applies only to a `FAILED` row of the authenticated owner that still has a stored source (every CV created by this feature does).
- `COMPLETED` is terminal in this feature.

`COMPLETED` with open clarification questions is a normal, valid end state (FR-030). The draft and its questions are written in one transaction together with the `COMPLETED` transition, so a reader never sees `COMPLETED` without its draft, or questions without their draft.

## Input validation rules (where the spec's limits live)

| Field | Rule |
|-------|------|
| `targetRole` | trimmed, 1 to 200 characters |
| free text | trimmed, 50 to 20,000 characters |
| PDF | at most 5 MiB, content must start with the PDF signature (not trusted from name or content type), exactly one file, no other source field; otherwise `400 VALIDATION_ERROR` |
| extracted PDF text | trimmed, 50 to 20,000 characters; otherwise the request is rejected with `422 PDF_EXTRACTION_FAILED` and nothing is created |
| `userId` anywhere | ignored; identity comes from the session |
