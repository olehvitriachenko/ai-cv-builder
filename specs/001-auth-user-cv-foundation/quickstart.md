# Quickstart: Validating Authentication and User-Owned CVs

A run-and-verify guide for this feature once implemented. Endpoint behavior is defined in [contracts/auth-and-cv-api.md](./contracts/auth-and-cv-api.md); data in [data-model.md](./data-model.md).

## Prerequisites

- Node 24, pnpm 11, Docker.
- `apps/api/.env` with `DATABASE_URL` (already present). Optional: `WEB_ORIGIN` (default `http://localhost:3000`), `PORT` (default `3001`).

## Setup

```bash
docker compose up -d postgres   # PostgreSQL must be running before migrations or tests
pnpm install
pnpm --filter api prisma:generate         # the generated Prisma client is gitignored; required on a fresh clone
pnpm --filter api prisma:migrate:deploy
```

The `prisma:*` scripts are added by this feature; they pass `--config prisma7.config.ts`. Full-stack `docker compose up` (API and web in containers) is not part of this feature; compose currently provides only PostgreSQL.

## 1. Automated checks

```bash
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api exec tsc --noEmit
pnpm --filter api lint
```

Expected: all pass. The e2e run creates a `<db>_test` database on first use and applies migrations automatically; it never touches the dev database.

## 2. API scenarios (manual, with a cookie jar)

Start the API:

```bash
pnpm --filter api start:dev
```

Use `-c`/`-b` to keep cookies between calls. `A` and `B` are two cookie jars (two users).

```bash
# Register user A (auto signed in): expect 201 and a Set-Cookie: sid=...; HttpOnly; SameSite=Lax
curl -i -c a.jar -H 'content-type: application/json' \
  -d '{"email":"a@example.com","password":"correct horse battery"}' \
  http://localhost:3001/api/auth/register

# Current user ("reload"): expect 200 {id,email}
curl -i -b a.jar http://localhost:3001/api/auth/me

# Duplicate (different case): expect 409 EMAIL_ALREADY_REGISTERED
curl -i -H 'content-type: application/json' \
  -d '{"email":"A@Example.com","password":"correct horse battery"}' \
  http://localhost:3001/api/auth/register

# Invalid input: expect 400 with fieldErrors
curl -i -H 'content-type: application/json' \
  -d '{"email":"nope","password":"short"}' http://localhost:3001/api/auth/register

# Wrong password and unknown email: expect two identical 401 INVALID_CREDENTIALS bodies
curl -i -H 'content-type: application/json' \
  -d '{"email":"a@example.com","password":"wrong-password"}' http://localhost:3001/api/auth/login
curl -i -H 'content-type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrong-password"}' http://localhost:3001/api/auth/login

# Unauthenticated protected request: expect 401 UNAUTHENTICATED
curl -i http://localhost:3001/api/auth/me
```

Ownership (register a second user into jar `b.jar` the same way):

```bash
# A creates a CV; owner must be A even though a userId is supplied: expect 201
curl -i -b a.jar -H 'content-type: application/json' \
  -d '{"targetRole":"Backend Engineer","userId":"someone-else"}' http://localhost:3001/api/cvs

# A reads it: expect 200
curl -i -b a.jar http://localhost:3001/api/cvs/<CV_ID>

# B reads A's CV, and a non-existent id: expect two identical 404 CV_NOT_FOUND responses
curl -i -b b.jar "http://localhost:3001/api/cvs/<CV_ID>?userId=<A_ID>"
curl -i -b b.jar http://localhost:3001/api/cvs/cnonexistentidxxxxxxxxxxx

# Malformed id: expect 400
curl -i -b a.jar http://localhost:3001/api/cvs/not-an-id
```

Logout and replay:

```bash
cp a.jar a-old.jar
# Expect 204 and a Set-Cookie that clears sid
curl -i -b a.jar -c a.jar -X POST http://localhost:3001/api/auth/logout
# Replaying the old cookie: expect 401 UNAUTHENTICATED
curl -i -b a-old.jar http://localhost:3001/api/auth/me
```

## 3. Web scenarios (manual)

```bash
pnpm --filter web dev
```

Open `http://localhost:3000` in a browser (use the device toolbar at 320-390 px width for the mobile checks).

| Step | Expected |
|------|----------|
| Visit `/` while signed out | Redirected to `/login` |
| Register on `/register` with invalid values | Field-level messages shown; no horizontal scroll at 320 px |
| Register with a valid new email | Signed in; the signed-in page shows the email |
| Reload the page | Still signed in |
| Register the same email again (signed out) | Clear "already registered" message |
| Sign in with a wrong password, then with an unknown email | The same generic message in both cases |
| Browser dev tools: Application -> Local/Session Storage | No auth data. The `sid` cookie is marked HttpOnly |
| Sign out | Returned to `/login`; going back to `/` redirects to `/login` |

## 4. Expiry check

Use `psql` or any SQL client against the dev database: set `"expiresAt"` of the user's `Session` row to a past time, then call `GET /api/auth/me` with that cookie: expect `401 UNAUTHENTICATED`. (The automated e2e suite covers this.)

## 5. Final review

- Diff matches spec requirements and acceptance criteria AC-001 through AC-012.
- `grep` the API logs from the runs above: no passwords, cookie values or tokens.
- Stored data: `Session.tokenHash` differs from the cookie value; `User.passwordHash` starts with `$argon2id$`.
