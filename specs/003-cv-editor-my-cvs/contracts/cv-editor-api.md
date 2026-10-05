# API Contract: CV List, Editing, Clarifications and Delete

REST over JSON under the global `/api` prefix. Everything from 001 and 002 applies unchanged: session cookie authentication (401 `UNAUTHENTICATED`), the error body `{ statusCode, code, message, fieldErrors? }`, identity only from the session (a client `userId` in the body, query, header or path is ignored), and a foreign CV answered exactly like a missing one (`404 CV_NOT_FOUND`).

Browser calls are cross-origin with credentials, so the CORS configuration allows `GET, HEAD, POST, PUT, DELETE`.

## Changes to the previous contract

| Operation | 002 | Now |
|-----------|-----|-----|
| `GET /api/cvs/:id/result` | `{ id, status, draft, questions[] }` | adds `revision`; questions gain `answer` and the four-state `status`; the `OPEN`/`RESOLVED` values no longer exist |
| `POST /api/cvs/:id/retry` | `FAILED` only | unchanged; the rule is now shared with the list's `canRetry` |
| Clarification `status` | `OPEN`, `RESOLVED` | `UNANSWERED`, `ANSWERED`, `APPLIED`, `DISMISSED` |

## Shared shapes

```text
DisplayStatus = "PROCESSING" | "FAILED" | "DRAFT" | "COMPLETED"

CvListItem = {
  id: string,
  targetRole: string,
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED",
  displayStatus: DisplayStatus,
  failureReason: FailureReason | null,    // non-null exactly when status is FAILED
  canRetry: boolean,                      // server-decided; true only when POST /retry would be accepted
  updatedAt: ISO-8601,
  candidateName: string | null,           // draft.contact.fullName, null when unavailable
  openQuestionsCount: number              // UNANSWERED + ANSWERED questions
}

QuestionStatus = "UNANSWERED" | "ANSWERED" | "APPLIED" | "DISMISSED"

ClarificationQuestion = {
  id: string,
  section: "CONTACT" | "SUMMARY" | "EXPERIENCE" | "EDUCATION" | "SKILLS",
  itemId: string | null,
  missing: string,
  question: string,
  status: QuestionStatus,
  answer: string | null                   // null while UNANSWERED (and for a dismissed question that never had one)
}

CvResult = {
  id: string,
  status: "COMPLETED",
  revision: number,                       // send this back with every draft save and apply
  draft: CvDraft,                         // unchanged shape, see 002 data-model.md
  questions: ClarificationQuestion[]      // ordered
}
```

Responses never contain `userId`, `sourceText`, `failureDetail`, prompts, raw model output, or the question's internal `field`.

## `GET /api/cvs`

The authenticated user's CVs, most recently updated first (`updatedAt DESC`, ties by id). No paging, no query parameters.

`200` -> `{ items: CvListItem[] }` (an empty array when the user has none). Never contains another user's CVs. Reading does not change `updatedAt`.

## `DELETE /api/cvs/:id`

Deletes an owned CV and (through the existing cascade) its clarification questions.

| Status | `code` | When |
|--------|--------|------|
| `204` | | Deleted. The CV was `COMPLETED` or `FAILED` |
| `404` | `CV_NOT_FOUND` | Missing or foreign (identical) |
| `409` | `CV_GENERATION_ACTIVE` | The CV is `PENDING` or `PROCESSING`; nothing is deleted |

## `PUT /api/cvs/:id/draft`

Replaces the draft. Body:

```text
{ revision: number,      // the revision this edit is based on
  draft: CvDraft }       // the whole document
```

Validation: the existing draft schema and its caps, plus unique entry ids and a valid email format when an email is set. `200` -> `{ revision: number, updatedAt: ISO-8601 }` where `revision` is the new revision.

| Status | `code` | When |
|--------|--------|------|
| `400` | `VALIDATION_ERROR` | Invalid body. `fieldErrors` keys are dotted draft paths, for example `contact.email`, `experience.0.bullets.2`, `skills.5` |
| `404` | `CV_NOT_FOUND` | Missing or foreign |
| `409` | `CV_NOT_EDITABLE` | The CV is not `COMPLETED` |
| `409` | `REVISION_CONFLICT` | `revision` is not the current revision. Nothing is stored. The client re-reads `GET .../result` to learn the latest revision and content |

## `PUT /api/cvs/:id/questions/:questionId/answer`

Body `{ answer: string }` (trimmed, 1 to 1000 characters). Sets or replaces the answer and moves the question to `ANSWERED`. The CV content and `revision` do not change; `updatedAt` does.

`200` -> `ClarificationQuestion`.

| Status | `code` | When |
|--------|--------|------|
| `400` | `VALIDATION_ERROR` | Blank or over-long answer (`fieldErrors.answer`) |
| `404` | `CV_NOT_FOUND` / `QUESTION_NOT_FOUND` | Foreign or missing CV / the question is not part of this CV |
| `409` | `CV_NOT_EDITABLE` | The CV is not `COMPLETED` |
| `409` | `QUESTION_STATE_CONFLICT` | The question is `APPLIED` or `DISMISSED` |

## `POST /api/cvs/:id/questions/:questionId/dismiss`

No body. Moves an `UNANSWERED` or `ANSWERED` question to `DISMISSED` without touching the CV content or `revision`. Only on an explicit request; nothing dismisses automatically.

`200` -> `ClarificationQuestion`. Errors: `404 CV_NOT_FOUND`, `404 QUESTION_NOT_FOUND`, `409 CV_NOT_EDITABLE`, `409 QUESTION_STATE_CONFLICT` (already `APPLIED` or `DISMISSED`).

## `POST /api/cvs/:id/questions/:questionId/apply`

Body `{ revision: number }`: the revision the user is looking at. Applies an `ANSWERED` question to the part of the CV it concerns (see data-model.md, Question-target resolution) and marks it `APPLIED` in the same transaction. A question with a `field` is applied deterministically (no AI call); the others go through the answer applier and its validated additive patch.

`200` -> `CvResult` (the new draft, new `revision`, all questions) so the client replaces its state with the server's.

| Status | `code` | When |
|--------|--------|------|
| `400` | `VALIDATION_ERROR` | Malformed body |
| `404` | `CV_NOT_FOUND` / `QUESTION_NOT_FOUND` | Foreign or missing CV / question not in this CV |
| `409` | `CV_NOT_EDITABLE` | The CV is not `COMPLETED` |
| `409` | `QUESTION_STATE_CONFLICT` | The question is not `ANSWERED` (includes the second of two concurrent applies) |
| `409` | `REVISION_CONFLICT` | The revision is stale, before the AI call or at commit time. Nothing changes |
| `409` | `TARGET_NOT_APPLICABLE` | The target entry was removed, the target value is already filled, or the summary is already present. Nothing changes; the user edits manually or dismisses |
| `422` | `APPLY_OUTPUT_INVALID` | AI output failed structure, unsupported-fact or no-overwrite validation after the single retry. Nothing changes |
| `503` | `AI_UNAVAILABLE` | Provider error, timeout or missing key. Nothing changes; deterministic questions are unaffected |

On every non-`200` response the draft, the `revision` and the question are exactly as before.

## Guarantees

- **Atomicity**: the draft change and `APPLIED` are one transaction.
- **At most once**: concurrent identical applies cannot both succeed (the second sees `ANSWERED` no more, or a changed revision).
- **Ownership**: each handler loads through `CvService.findOwnedOrThrow` or constrains its write by `userId`; question ids are always scoped by `cvId`.
- **Privacy**: logs for these operations carry ids, status and error category only; never draft content, answers, prompts or model output.
