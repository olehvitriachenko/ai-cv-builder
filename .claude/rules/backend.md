# Backend Rules

These rules apply to NestJS, Fastify, Prisma, auth, authorization, background work and REST API design.

## Architecture

- MUST use a modular monolith.
- MUST keep controllers thin.
- MUST keep business logic in services/use cases.
- SHOULD keep infrastructure concerns in dedicated adapters/services.

Expected modules may include:
- Auth
- Users
- CV
- AI
- PDF

MUST NOT introduce unless explicitly required:
- microservices
- Kafka
- RabbitMQ
- Redis
- CQRS frameworks
- event sourcing
- distributed queues

## Controllers

Controllers MAY:
- receive HTTP input
- validate input
- read auth context
- call application services
- map results to responses

Controllers MUST NOT contain business logic.

## Prisma / database

- MUST use PostgreSQL with Prisma.
- MUST use Prisma migrations for schema changes.
- MUST use DB constraints for important invariants where appropriate.
- SHOULD add indexes only for real query patterns.
- MUST NOT add speculative indexes.
- MUST NOT create generic repository wrappers over Prisma without a concrete need.

## REST API

- MUST use REST.
- SHOULD use predictable resource-oriented endpoints.
- MUST validate route params, query params, bodies and uploads.
- MUST use appropriate HTTP status codes.
- SHOULD avoid exposing raw Prisma models directly as public contracts.

## Authentication

Authentication:
- email + password
- server-side sessions
- HTTP-only cookies

- Passwords MUST NOT be stored in plaintext.
- MUST use Argon2 unless the chosen auth library intentionally provides an equivalent secure mechanism.
- MUST validate sessions on the server.
- MUST invalidate session on logout.
- MUST NOT store auth credentials in:
  - localStorage
  - sessionStorage
  - client-readable cookies

Cookie defaults:
- `httpOnly: true`
- `sameSite: 'lax'`
- `secure: true` in production
- explicit expiration/TTL

## Authorization / ownership

Every CV operation MUST enforce ownership on the backend.

A user MUST NOT be able to:
- read another user's CV
- edit another user's CV
- delete another user's CV
- regenerate another user's CV
- export another user's CV
- answer another user's clarification questions

Frontend hiding is NOT authorization.

Prefer ownership-aware queries such as:

`WHERE id = cvId AND userId = authenticatedUserId`

## CV persistence

- One user MAY own multiple CVs.
- CVs MUST persist so users can return later from another device.
- MUST NOT assume one master CV per user unless the specification changes.

## Generation lifecycle

CV generation MUST use persistent state.

Use explicit states:
- `PENDING`
- `PROCESSING`
- `COMPLETED`
- `FAILED`

- MUST NOT keep generation status only in browser state or process memory.
- Reloading the page MUST NOT lose generation progress.
- Failed work MUST end in a clear persisted state.
- SHOULD minimize accidental duplicate processing.

## Background work

Long-running generation MUST NOT depend on the original HTTP request remaining open.

Use the simplest reliable persistent mechanism.

A database-backed generation/job state is acceptable.

If using DB-backed processing, consider:
- retry count
- last error
- timestamps
- stale `PROCESSING`
- duplicate execution
- restart recovery

Do not overengineer this into distributed infrastructure unless required.

## PDF

- MUST use `@react-pdf/renderer`.
- MUST enforce authentication and ownership before export.
- MUST generate A4 PDF.
- MUST produce selectable text.
- MUST use persisted CV data.
- MUST NOT generate screenshot-based PDFs.

## Uploads

Uploaded PDFs are untrusted.

- MUST validate file type.
- MUST validate file size.
- MUST NOT trust file extension alone.
- MUST NOT execute uploaded content.
- MUST NOT expose internal filesystem paths.

## Validation

Treat these as untrusted:
- HTTP input
- cookies
- uploads
- environment values
- LLM output
- third-party responses

- MUST validate runtime data at boundaries.
- MUST NOT assume TypeScript types validate runtime input.

## Configuration

- SHOULD centralize configuration.
- MUST validate critical env vars at startup.
- SHOULD fail fast when required configuration is missing.
- SHOULD avoid random `process.env` access across the codebase.

## Errors

- MUST NOT silently swallow errors.
- Expected errors SHOULD be handled explicitly.
- Unexpected errors SHOULD be logged and returned safely.
- MUST NOT expose:
  - stack traces
  - Prisma internals
  - raw DB errors
  - secrets
  - API keys
  - session identifiers

## Logging

- SHOULD use structured logging.
- MUST NOT log:
  - passwords
  - session cookies
  - session IDs
  - secrets
  - API keys
- SHOULD log useful context such as:
  - CV ID
  - generation ID
  - lifecycle state
  - error category