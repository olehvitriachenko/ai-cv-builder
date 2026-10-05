# Data Model: Authentication and User-Owned CV Foundation

PostgreSQL via Prisma. The three tables already exist from migration `20261005122610_init`. This feature adds **one migration**: make `Cv.targetRole` optional. Everything else below describes existing structure and how this feature uses it.

## Entities

### User

| Field | Type | Rules |
|-------|------|-------|
| `id` | string (cuid) | Primary key |
| `email` | string | **Unique**. Always stored trimmed and lower-cased, so the unique index enforces case-insensitive uniqueness |
| `passwordHash` | string | Argon2id encoded hash. Never returned, never logged |
| `createdAt` / `updatedAt` | timestamp | Defaults / auto-updated |

Relations: has many `Session`, has many `Cv`.

Validation (at the HTTP boundary, before the DB): email must be a valid address, at most 254 characters; password 8-128 characters.

### Session

| Field | Type | Rules |
|-------|------|-------|
| `id` | string (cuid) | Primary key. Internal only; never sent to the client |
| `tokenHash` | string | **Unique**. `sha256(rawToken)` hex. The raw token is never stored |
| `userId` | string | FK -> `User.id`, `ON DELETE CASCADE` |
| `expiresAt` | timestamp | `createdAt + 7 days`, fixed (no renewal) |
| `createdAt` | timestamp | Default now |

State model: a session is **valid** iff its row exists and `expiresAt > now`. Logout deletes the row; an expired row found on lookup is deleted. There is no "revoked" flag, so an invalidated session cannot be resurrected. Deleting a user cascades to its sessions, so a valid session always has a user.

Existing indexes: `tokenHash` (unique, the lookup path), `userId`, `expiresAt`. The `expiresAt` index is not used by any query in this feature (see plan, Complexity Tracking).

### Cv (minimal)

| Field | Type | Rules |
|-------|------|-------|
| `id` | string (cuid) | Primary key |
| `userId` | string | **Non-null** FK -> `User.id`, `ON DELETE CASCADE`. Set from the session at creation; never changed in this feature |
| `targetRole` | string, **nullable** (changed) | Optional; when provided: trimmed, non-blank, at most 200 characters |
| `createdAt` / `updatedAt` | timestamp | Default now / auto-updated |

Existing index: `userId`, which serves the ownership query `WHERE id = ? AND userId = ?`.

Content sections (contact, summary, experience, education, skills) are added by later features.

## Relationships

```text
User 1 ──── * Session      (cascade on user delete)
User 1 ──── * Cv           (cascade on user delete)
```

A CV has exactly one owner; a user may own any number of CVs.

## Migration (the only schema change)

- Prisma schema: `targetRole String` becomes `targetRole String?`.
- Generated SQL is expected to be a single statement dropping the `NOT NULL` constraint on `"Cv"."targetRole"`.
- Existing rows: none exist (the table is new), so no backfill is required.
- Created with `prisma migrate dev` through the `--config prisma7.config.ts` script; applied to tests with `prisma migrate deploy`.

## Invariants enforced by the database

- One account per normalised email (unique index; concurrent registrations resolve to one winner and one `P2002`).
- No session without a user, no CV without an owner (non-null FKs).
- A session token hash maps to at most one session (unique index).

## Invariants enforced by the application

- `email` is normalised before every write and lookup.
- CV `userId` is taken from the authenticated session, never from the request.
- Every CV read uses `WHERE id = ? AND userId = ?`.
