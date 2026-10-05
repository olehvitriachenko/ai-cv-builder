# API Contract: Authentication and CV Foundation

REST over JSON. All paths are served under the global prefix `/api` (set in `main.ts`), so the spec's `/auth/register` is `POST /api/auth/register`. Requests and responses use `application/json` unless noted.

## Conventions

### Session cookie

| Property | Value |
|----------|-------|
| Name | `sid` |
| Value | Opaque random token; meaningless to the client |
| `HttpOnly` | always |
| `SameSite` | `Lax` |
| `Path` | `/` |
| `Secure` | only when `NODE_ENV=production` |
| `Expires` | session expiry (7 days after issue) |

Set by register and login. Cleared by logout (same attributes, expired). Browser clients must send requests with credentials included. The server accepts the session **only** from this cookie.

### Error body (all error responses)

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Invalid request",
  "fieldErrors": { "password": ["Password must be at least 8 characters"] }
}
```

`fieldErrors` is present only for `VALIDATION_ERROR`. No stack traces, database details, hashes or tokens ever appear.

| `code` | Status | Meaning |
|--------|--------|---------|
| `VALIDATION_ERROR` | 400 | Body or route parameter failed validation |
| `UNAUTHENTICATED` | 401 | No valid session (missing, malformed, unknown, expired, logged out: all identical) |
| `INVALID_CREDENTIALS` | 401 | Login failed (unknown email and wrong password are identical) |
| `EMAIL_ALREADY_REGISTERED` | 409 | Registration with an existing email |
| `CV_NOT_FOUND` | 404 | CV does not exist **or** is not owned by the caller (identical) |
| `NOT_FOUND` | 404 | Unknown route |
| `INTERNAL_ERROR` | 500 | Unexpected failure; generic message |

### Shared shapes

```text
User = { id: string, email: string }
Cv   = { id: string, targetRole: string | null, createdAt: ISO-8601, updatedAt: ISO-8601 }
```

`passwordHash`, session data and the CV's `userId` are never part of a response.

### Request-body parsing happens before authentication

The server parses the JSON body before the authentication guard runs. A request with an unparseable body (malformed JSON, or an empty body sent as JSON) can therefore receive `400 VALIDATION_ERROR` even when it carries no valid session, including on protected routes such as `POST /api/cvs`. This leaks nothing and is accepted behavior. The "every invalid session is an identical `401`" guarantee applies to requests with a parseable body or no body.

### Identity and ownership rules (apply to every endpoint)

- The caller's identity comes only from the session cookie.
- `userId` (or any owner-like field) in a body, query string, route or header is ignored.
- Unknown body keys are ignored.

---

## `POST /api/auth/register` (public)

Request:

| Field | Rules |
|-------|-------|
| `email` | string; trimmed and lower-cased; valid email; at most 254 characters |
| `password` | string; 8-128 characters; not trimmed |

| Status | Body | Notes |
|--------|------|-------|
| `201` | `User` | Account created **and signed in**: `Set-Cookie: sid=...` |
| `400` | `VALIDATION_ERROR` with `fieldErrors` | No account created |
| `409` | `EMAIL_ALREADY_REGISTERED` | No account created, no cookie |

## `POST /api/auth/login` (public)

Request:

| Field | Rules |
|-------|-------|
| `email` | string; trimmed and lower-cased; non-empty; at most 254 characters (format not enforced) |
| `password` | string; 1-128 characters |

| Status | Body | Notes |
|--------|------|-------|
| `200` | `User` | `Set-Cookie: sid=...`; existing sessions of the user stay valid |
| `400` | `VALIDATION_ERROR` | Missing fields, wrong types, empty values |
| `401` | `INVALID_CREDENTIALS` | Identical for unknown email and wrong password (same status, code, message, shape) |

## `POST /api/auth/logout` (public, idempotent)

No body.

| Status | Body | Notes |
|--------|------|-------|
| `204` | none | If the cookie maps to a session, that session is deleted (only that one). The `sid` cookie is always cleared, even with no or an invalid session |

## `GET /api/auth/me` (authenticated)

| Status | Body | Notes |
|--------|------|-------|
| `200` | `User` | Identity of the session's user |
| `401` | `UNAUTHENTICATED` | |

## `POST /api/cvs` (authenticated)

Request:

| Field | Rules |
|-------|-------|
| `targetRole` | optional string; trimmed; non-blank when present; at most 200 characters |

| Status | Body | Notes |
|--------|------|-------|
| `201` | `Cv` | Owner is the session's user, regardless of any `userId` sent |
| `400` | `VALIDATION_ERROR` | e.g. blank or over-long `targetRole`, wrong type |
| `401` | `UNAUTHENTICATED` | |

## `GET /api/cvs/{id}` (authenticated)

Route parameter `id`: must be a valid CV identifier format.

| Status | Body | Notes |
|--------|------|-------|
| `200` | `Cv` | Only if the caller owns it |
| `400` | `VALIDATION_ERROR` | Malformed `id` |
| `401` | `UNAUTHENTICATED` | |
| `404` | `CV_NOT_FOUND` | Not found **or** owned by someone else; responses are byte-identical in status and body |

---

## Protected-route rule

Every route is protected unless explicitly marked public. Public routes: register, login, logout. Any route added later is protected by default.

## Not part of this contract

Listing CVs, updating or deleting a CV, password or email changes, "sign out everywhere", throttling, and CSRF tokens are out of scope (see spec).
