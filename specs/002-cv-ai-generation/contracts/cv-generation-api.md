# API Contract: CV Generation

REST over JSON, served under the global `/api` prefix. Everything from the authentication feature applies unchanged: session cookie authentication, the same error body shape, identity only from the session, a client `userId` ignored, and a foreign CV answered exactly like a missing one.

## Changes to the previous contract

| Operation | Before (001) | Now (002) |
|-----------|--------------|-----------|
| `POST /api/cvs` | Created a placeholder CV (optional `targetRole`), `201 Cv` | Becomes the real generation-start contract: `targetRole` and `sourceText` are required, `202` with a status resource. The placeholder no longer exists (every CV has a source); there is no backward-compatibility requirement yet, so existing tests move to the new request shape |
| `GET /api/cvs/:id` | `{ id, targetRole, createdAt, updatedAt }` | Returns the **status resource** below (a superset: the same fields plus lifecycle fields) |

## Shared shapes

```text
CvStatus = {
  id: string,
  targetRole: string | null,
  sourceType: "FREE_TEXT" | "PDF" | null,
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED",
  failureReason: FailureReason | null,     // non-null exactly when status is FAILED
  createdAt: ISO-8601,
  updatedAt: ISO-8601,
  startedAt: ISO-8601 | null,              // when processing last started
  finishedAt: ISO-8601 | null              // when it reached COMPLETED or FAILED
}

FailureReason = "PROVIDER_UNAVAILABLE" | "PROVIDER_NOT_CONFIGURED" | "INVALID_OUTPUT"
              | "TIMED_OUT" | "INTERRUPTED" | "UNKNOWN"      // generation failures only

CvResult = {
  id: string,
  status: "COMPLETED",
  draft: CvDraft,
  questions: ClarificationQuestion[]       // ordered; may be empty
}

CvDraft = see data-model.md (schemaVersion, contact, summary, experience[], education[], skills[])

ClarificationQuestion = {
  id: string,
  section: "CONTACT" | "SUMMARY" | "EXPERIENCE" | "EDUCATION" | "SKILLS",
  itemId: string | null,                   // id of an experience/education entry in the draft, when applicable
  missing: string,                         // what is missing or ambiguous
  question: string,                        // the question to show the user
  status: "OPEN" | "RESOLVED"              // only OPEN is produced in this feature
}
```

The responses never contain `userId`, `sourceText`, `failureDetail`, prompts, or raw model output.

## Errors

Same body as before: `{ statusCode, code, message, fieldErrors? }`. New and relevant codes:

| `code` | Status | Meaning |
|--------|--------|---------|
| `VALIDATION_ERROR` | 400 | Invalid input: wrong file type, oversize file, missing/blank/too short or too long fields, both sources, malformed request. `fieldErrors` keys: `targetRole`, `sourceText`, `file`, `source` |
| `PDF_EXTRACTION_FAILED` | 422 | A file accepted as a PDF whose text cannot be parsed or is unusable: corrupt, password-protected, image-only or empty, more than 50 pages, or text outside the 50 to 20,000 character range. Nothing is created. The message states the safe reason; there is no `fieldErrors` |
| `UNAUTHENTICATED` | 401 | No valid session |
| `CV_NOT_FOUND` | 404 | The CV does not exist **or** belongs to someone else (identical) |
| `GENERATION_NOT_READY` | 409 | The result was requested before the CV is `COMPLETED` |
| `GENERATION_NOT_RETRYABLE` | 409 | Retry requested for a CV that is not `FAILED` |
| `INTERNAL_ERROR` | 500 | Unexpected failure; generic message |

---

## `POST /api/cvs` (start from free text)

`Content-Type: application/json`

| Field | Rules |
|-------|-------|
| `targetRole` | required string, trimmed, 1 to 200 characters |
| `sourceText` | required string, trimmed, 50 to 20,000 characters |

| Status | Body | Notes |
|--------|------|-------|
| `202` | `CvStatus` | CV persisted as `PENDING` before any AI work; response returns without waiting for the AI |
| `400` | `VALIDATION_ERROR` | Missing, blank, too short or too long fields; nothing is created |
| `401` | `UNAUTHENTICATED` | |

## `POST /api/cvs/upload` (start from a PDF)

`Content-Type: multipart/form-data`

| Part | Rules |
|------|-------|
| `targetRole` (text field) | required, trimmed, 1 to 200 characters |
| `file` (file part) | required, exactly one, at most 5 MiB, must be a PDF by content (its leading bytes), the declared name or content type is not trusted |
| `sourceText` (text field) | **must be absent**. Supplying it together with a file is rejected: exactly one source is allowed. Error key `source` |

| Status | Body | Notes |
|--------|------|-------|
| `202` | `CvStatus` | `status: "PENDING"`; the extracted text is stored as the source and the PDF itself is discarded |
| `400` | `VALIDATION_ERROR` | Not a PDF (no PDF signature, including a renamed file), over 5 MiB, no file, both sources, or missing/blank `targetRole`; nothing is created |
| `422` | `PDF_EXTRACTION_FAILED` | Accepted as a PDF, but its text cannot be parsed or is unusable; nothing is created. An input failure, not a generation failure |
| `401` | `UNAUTHENTICATED` | Refused before the body is read |

## `GET /api/cvs/{id}` (status)

| Status | Body | Notes |
|--------|------|-------|
| `200` | `CvStatus` | Always available to the owner; this is the polling target |
| `400` | `VALIDATION_ERROR` | Malformed `id` |
| `401` | `UNAUTHENTICATED` | |
| `404` | `CV_NOT_FOUND` | Missing or not owned (identical) |

## `GET /api/cvs/{id}/result` (draft and clarification questions)

| Status | Body | Notes |
|--------|------|-------|
| `200` | `CvResult` | Only when the CV is `COMPLETED` |
| `400` / `401` / `404` | as above | |
| `409` | `GENERATION_NOT_READY` | Status is `PENDING`, `PROCESSING` or `FAILED`: there is no draft |

This single operation satisfies both the spec's "get draft" and "get clarification questions" operations: one request, one `COMPLETED` check.

## `POST /api/cvs/{id}/retry`

No body.

| Status | Body | Notes |
|--------|------|-------|
| `202` | `CvStatus` | `status: "PENDING"`; failure fields cleared; `generationAttempts` is kept (it is the fencing token); generation re-runs on the stored source |
| `400` / `401` / `404` | as above | |
| `409` | `GENERATION_NOT_RETRYABLE` | The CV is not `FAILED`, or another retry has already moved it past the failure this request observed (an overlapping retry cannot succeed across a fast `FAILED` -> retry -> `FAILED` cycle). Two quick retries still run one generation |

---

## Behavior guarantees

- **Persist first**: a CV exists in the database in `PENDING` before any AI call can begin. Ingestion failures (`400`, `422`) create nothing.
- **Reload-safe**: `GET /api/cvs/{id}` returns the persisted state at any time, from any device, whether or not any request is open.
- **Never stuck**: a CV in `PROCESSING` reaches `COMPLETED` or `FAILED` within the configured timeout (default 5 minutes). When the API starts, any CV found `PROCESSING` becomes `FAILED` with reason `INTERRUPTED` (it is not silently resumed); `PENDING` CVs are processed. The owner can retry a `FAILED` CV.
- **No partial writes**: the draft and its questions appear together with `COMPLETED`, never before. Invalid or failed output changes nothing.
- **Polling guidance for clients**: poll `GET /api/cvs/{id}` about every 2 seconds while `PENDING` or `PROCESSING`; stop on `COMPLETED` or `FAILED`; then fetch `/result` once if `COMPLETED`.

## Not part of this contract

Listing CVs, editing a draft, answering or updating clarification questions, PDF export, deleting a CV, and cancelling a running generation.
