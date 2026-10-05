# API Contract: CV PDF Export

Under the global `/api` prefix. Everything from 001 to 003 applies unchanged: session-cookie authentication (`401 UNAUTHENTICATED`), the JSON error body `{ statusCode, code, message, fieldErrors? }`, identity only from the session (a client `userId` in the path, query, body or headers is ignored), and a foreign CV answered exactly like a missing one (`404 CV_NOT_FOUND`).

## `GET /api/cvs/:id/pdf`

Returns the latest **saved** draft of the caller's CV as an A4 PDF. No body, no query parameters. Read-only: nothing is written.

### Success

`200`, body = PDF bytes (`%PDF-...`).

| Header | Value |
|--------|-------|
| `Content-Type` | `application/pdf` |
| `Content-Disposition` | `attachment; filename="<ascii-name>.pdf"; filename*=UTF-8''<percent-encoded-name>.pdf` |
| `Content-Length` | byte length of the body |
| `Cache-Control` | `private, no-store` |
| `X-Content-Type-Options` | `nosniff` |
| `Access-Control-Expose-Headers` | includes `Content-Disposition` (so the browser app can read the file name) |

The file name is `<Candidate name>-<Target role>.pdf`, normalized (see research D-11): no path separators, quotes or control characters, at most 80 characters before the extension, `CV.pdf` when nothing usable remains.

### Errors (all JSON, never a partial or empty PDF)

| Status | `code` | When |
|--------|--------|------|
| `400` | `VALIDATION_ERROR` | `:id` is not a valid CV id |
| `401` | `UNAUTHENTICATED` | No valid session |
| `404` | `CV_NOT_FOUND` | The CV does not exist **or** belongs to someone else (identical) |
| `409` | `GENERATION_NOT_READY` | The CV is `PENDING`, `PROCESSING` or `FAILED`: there is no draft (same outcome as `GET /cvs/:id/result`) |
| `500` | `INTERNAL_ERROR` | Rendering failed or a stored draft no longer matches its schema. Generic message; nothing from the draft, database or file system is echoed |

Open clarification questions do **not** cause an error: the PDF is produced from the draft as it is.

## Behavior guarantees

- **Latest saved state**: the draft is read at request time, never cached or reused from an earlier export. An edit saved before the request is in the file; an unsaved browser edit is not.
- **Ownership first**: the ownership and status gate is the same one `GET /cvs/:id/result` uses; the document is only rendered after it passes.
- **No clarification content**: questions are not even read. Unanswered, answered-but-not-applied and dismissed answers cannot appear.
- **No raw internals**: the document contains no identifiers, revision, status, timestamps or source text.
- **Format**: A4 portrait, real text (selectable and searchable), one template, no page numbers.
- **Privacy in logs**: one structured line per export with the CV id, outcome category, byte size, page count and duration. Never the draft, the target role or the file name.

## Not part of this contract

Template choice, other formats, stored exports, share links, export history, and exporting a CV that is not `COMPLETED`.
