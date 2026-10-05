# Implementation Plan: Authentication and User-Owned CV Foundation

**Branch**: `001-auth-user-cv-foundation` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-auth-user-cv-foundation/spec.md`

## Summary

Add email/password registration, login, logout and current-user lookup backed by server-side sessions stored in PostgreSQL and delivered as an HTTP-only cookie, plus a minimal `Cv` record (`POST /cvs`, `GET /cvs/:id`) whose ownership is enforced in the query itself. Authentication is default-deny: a global guard protects every route unless it is marked `@Public()`. The web app gets a register page, a login page and a bare signed-in page that proves reload persistence and logout.

The smallest robust approach, grounded in what already exists in the repo:

- The Prisma schema already has `User`, `Session` (with `tokenHash`) and `Cv`; the only schema change is making `Cv.targetRole` optional.
- No new infrastructure. Sessions are rows in the existing PostgreSQL. Two new API dependencies: `@fastify/cookie` and `@node-rs/argon2`.
- Two Nest feature modules (`AuthModule`, `CvModule`). Prisma stays in `infrastructure/`; services use `PrismaService` directly (no repository layer, no `UsersModule` for two queries).
- Tests are HTTP-level against real PostgreSQL via Fastify `inject()` (no ports, no mocks of our own code) plus a few pure unit tests.

## Technical Context

**Language/Version**: TypeScript 6 (strict) on Node 24 (API); TypeScript 5 (strict) with Next.js 16.3 / React 19.2 (web)

**Primary Dependencies**: NestJS 12 + `@nestjs/platform-fastify` (Fastify 5), Prisma 7 with `@prisma/adapter-pg`, Zod 4. **New (API)**: `@fastify/cookie` ^11, `@node-rs/argon2` ^2. **New (web)**: `react-hook-form`, `zod`, `@hookform/resolvers`.

**Storage**: PostgreSQL 17 (existing `docker-compose.yaml`), Prisma migrations. Existing migration `20261005122610_init` already creates the three tables; one new migration is added.

**Testing**: Vitest 4 (existing `vitest.config.ts` for `*.spec.ts`, `vitest.config.e2e.ts` for `*.e2e-spec.ts`). Existing spec confirms Nest constructor DI works under Vitest without extra plugins.

**Target Platform**: Linux/macOS server (Node), modern mobile and desktop browsers.

**Project Type**: Web application — pnpm monorepo (`apps/api`, `apps/web`; `packages/shared` is an empty placeholder and is not used).

**Performance Goals**: No special targets. Argon2id with library-default (OWASP-minimum) parameters; login/registration complete well under 1 s locally. Session lookup is a single indexed query per request.

**Constraints**: Constitution and `.claude/rules/*`; no `any`, no `@ts-ignore`; Zod validation at every HTTP boundary; no Redis/queues/external session store; no new abstractions without a concrete need.

**Scale/Scope**: Take-home scale. Six endpoints, three tables, two web pages plus a minimal signed-in page.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How this plan satisfies it |
|-----------|--------|----------------------------|
| I. Product contract | Pass | Registration, login, persisted CVs (create/read) and ownership are delivered. Nothing in the contract is removed; later features build on this one. |
| II. Strict type safety | Pass, with one tooling fix | All HTTP input is `unknown` until Zod parses it. No casts. **Found**: `apps/api/.oxlintrc.json` has `typescript/no-explicit-any: off`, which contradicts the constitution. Step 0 sets it to `error`. |
| III. Reliability | Pass | Account + first session are created in one atomic write. No in-memory auth state; reload and restart keep sessions. |
| IV. Generation lifecycle | N/A | Not part of this feature. |
| V. Auth and ownership | Pass | Server-side sessions, HTTP-only cookie, Argon2id, default-deny global guard, identity only from the session, ownership in the query (`WHERE id AND userId`). |
| VI. AI facts | N/A | No AI in this feature. |
| VII. Structured AI output | N/A | No AI in this feature. |
| VIII. Server-first | Pass | Modular monolith; thin controllers; web pages are Server Components that check the session server-side, with small Client Components only for forms and the sign-out button. |
| IX. Database integrity | Pass | Unique email, FK `Session -> User` and `Cv -> User` (cascade), non-null owner, migration-based change. Existing `Session.expiresAt` index has no query in this plan; it is left alone (see Complexity Tracking). |
| X. Testing | Pass | Every test the spec requires is mapped in [Test Strategy](#test-strategy). |
| XI. User control | N/A | CV editing is out of scope here. |
| XII. Simplicity | Pass | No repository layer, no Users module, no shared package, no TanStack Query, no job for expired sessions. |
| XIII. Scope | Pass | Throttling, extra CSRF hardening, listing CVs, editing, etc. stay out (spec "Out of Scope"). |
| XIV. Owned code | Pass | Review step + typecheck/lint/test gates in [Implementation Order](#implementation-order). |
| XV. Reproducibility | Deferred | The existing `docker-compose.yaml` provides only PostgreSQL, so full `docker compose up` for the API and web apps is **not** delivered by this feature. This feature keeps what it can: the database runs from compose, the test DB is created by the test harness, and no secrets are committed. Full-stack compose is a project-level follow-up that must be completed before final delivery (tracked in tasks.md T044). The constitution is not amended. |
| XVI. Documentation | Deferred | README is a project-level deliverable. This feature records the trade-offs it must mention (account enumeration, no throttling, CSRF) in the spec; the README task is out of this feature. |

**Post-design re-check (after Phase 1)**: unchanged; no new violations. Design adds one dependency pair per app and no new infrastructure.

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-user-cv-foundation/
├── plan.md              # This file
├── research.md          # Phase 0: decisions and alternatives
├── data-model.md        # Phase 1: entities, constraints, the one migration
├── quickstart.md        # Phase 1: run and validate end to end
├── contracts/
│   └── auth-and-cv-api.md   # Phase 1: endpoints, status codes, errors, cookie
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks) — not created here
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   ├── schema.prisma                         # MODIFY: Cv.targetRole -> String?
│   └── migrations/<ts>_cv_target_role_optional/migration.sql   # NEW
├── src/
│   ├── main.ts                               # MODIFY: call configureApp()
│   ├── app.setup.ts                          # NEW: prefix, cookie plugin, CORS, exception filter (shared with tests)
│   ├── app.module.ts                         # MODIFY: validated config, AuthModule, CvModule
│   ├── config/
│   │   └── env.ts                            # NEW: Zod env schema (fail fast)
│   ├── common/http/
│   │   ├── api-error.ts                      # NEW: ApiError (status, code, message, fieldErrors)
│   │   ├── api-exception.filter.ts           # NEW: one error shape, safe 500s
│   │   └── zod-validation.pipe.ts            # NEW: Zod -> 400 with field errors
│   ├── infrastructure/prisma/                # UNCHANGED
│   └── modules/
│       ├── auth/
│       │   ├── auth.module.ts                # registers global AuthGuard (APP_GUARD)
│       │   ├── auth.controller.ts            # register, login, logout, me (thin)
│       │   ├── auth.service.ts               # register / login / logout use-cases
│       │   ├── session.service.ts            # create, validate, revoke
│       │   ├── session-token.ts              # pure: generate token, hash token
│       │   ├── password.service.ts           # Argon2id hash/verify, dummy verify
│       │   ├── session-cookie.ts             # cookie name, set/clear/read helpers
│       │   ├── auth.guard.ts                 # default-deny, honours @Public()
│       │   ├── public.decorator.ts
│       │   ├── current-user.decorator.ts
│       │   ├── auth.schemas.ts               # Zod: register, login bodies
│       │   └── auth.types.ts                 # AuthUser, request augmentation
│       └── cv/
│           ├── cv.module.ts
│           ├── cv.controller.ts              # POST /cvs, GET /cvs/:id (thin)
│           ├── cv.service.ts                 # create, getOwned; findOwnedOrThrow is the one ownership gate
│           └── cv.schemas.ts                 # Zod: create body, id param
├── test/
│   ├── global-setup.ts                       # NEW: create test DB, migrate deploy
│   ├── helpers/                              # NEW: createTestApp(), cookie parsing, user factory
│   ├── smoke / register / login / session / logout .e2e-spec.ts   # NEW (one file per story)
│   ├── cv-ownership.e2e-spec.ts              # NEW (also covers CV-route 401s)
│   └── logging.e2e-spec.ts                   # NEW, OPTIONAL (cut-first)
├── .oxlintrc.json                            # MODIFY: no-explicit-any -> error
├── package.json                              # MODIFY: deps, prisma scripts
└── vitest.config.e2e.ts                      # MODIFY: globalSetup

apps/web/src/
├── app/
│   ├── page.tsx                              # MODIFY: minimal signed-in view (Server Component; redirects to /login)
│   ├── login/{page.tsx,login-form.tsx}       # NEW
│   └── register/{page.tsx,register-form.tsx} # NEW
├── components/
│   ├── ui/{button.tsx,text-field.tsx}        # NEW: only the two primitives the forms need
│   └── sign-out-button.tsx                   # NEW (Client Component)
└── lib/
    ├── api/fetcher.ts                        # NEW: generic apiFetch<TResponse, TBody>, typed ApiError
    ├── api/auth.ts                           # NEW: register, login, logout, getCurrentUser
    └── auth/server.ts                        # NEW: server-side current-user (forwards cookie); form Zod schemas live next to their forms
```

**Structure Decision**: Keep the existing `apps/api` + `apps/web` monorepo layout. Feature modules live under `apps/api/src/modules/`, the folder that already exists and is empty. `common/http` holds only the two HTTP-boundary helpers that every module will reuse; nothing else is shared. `packages/shared` stays unused (see research D-14).

## Design Notes

### Auth and session flow

1. **Register** (`POST /api/auth/register`, `@Public`): Zod-parse body -> hash password (Argon2id) -> one nested `user.create` that also creates the first `Session` (atomic: no account without session, none half-written) -> `Set-Cookie` -> `201 {id, email}`. A unique-violation on `email` (Prisma `P2002`) becomes `409`.
2. **Login** (`POST /api/auth/login`, `@Public`): Zod-parse -> find user by normalised email -> Argon2 verify (against a precomputed dummy hash when the user is missing, to keep timing and outcome alike) -> create `Session` -> `Set-Cookie` -> `200 {id, email}`. Any failure is the same `401 INVALID_CREDENTIALS`.
3. **Token**: 32 bytes from `crypto.randomBytes`, base64url. Only `sha256(token)` is stored in `Session.tokenHash`. The raw token exists only in the cookie. SHA-256 (not Argon2) is correct here because the token is high-entropy.
4. **Cookie** (`sid`): `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` only when `NODE_ENV=production`, `Expires` = session expiry. The `secure` flag comes from validated application config (`NODE_ENV` through `ConfigService`), read once in the controller and passed to the cookie helpers; no inline `process.env`.
5. **Guard** (global, default-deny): skip if `@Public()`; read the cookie; hash it; load the session with its user where `tokenHash` matches and `expiresAt > now`; attach `{id, email}` to the request; otherwise `401 UNAUTHENTICATED`. Missing cookie, malformed value, unknown hash, expired and logged-out sessions are all the same outcome. An expired row found during lookup is deleted (no cleanup job).
6. **Logout** (`POST /api/auth/logout`, `@Public`, idempotent): if the cookie maps to a session, delete that row (other sessions of the user are untouched); always clear the cookie and return `204`.
7. **Me** (`GET /api/auth/me`): guard-protected; returns the user attached by the guard.
8. **Web**: pages are Server Components that call `/auth/me` through the server-side fetcher, forwarding the incoming `cookie` header. 401 -> `redirect('/login')` (a convenience only). Forms are client components that call the API with `credentials: 'include'`. Reload persistence comes from the cookie plus the server-side `/auth/me` call; nothing is stored in `localStorage`/`sessionStorage`. API requests from the browser rely on CORS configured for the single `WEB_ORIGIN` with `credentials: true`.

### Ownership enforcement

- Identity comes only from the guard (`@CurrentUser()`); controllers never read a `userId` from body, query, route or headers. Zod body schemas strip unknown keys, so a client `userId` is dropped before it reaches a service.
- `CvService.create(userId, input)` writes `userId` from the session.
- `CvService.findOwnedOrThrow(userId, cvId)` runs `findFirst({ where: { id, userId } })` and throws `NotFound` on `null`. Not-found and not-owned are therefore the same code path and the same response (FR-029). This is the single gate that later update/delete/generate/clarify/export operations must call (FR-031).
- Route `:id` is Zod-validated first (malformed -> `400`).

### Validation boundaries

| Boundary | Where | Rule |
|----------|-------|------|
| Environment | `config/env.ts` via `ConfigModule.forRoot({ validate })` | App refuses to start on missing/invalid `DATABASE_URL`, `NODE_ENV`, `PORT`, `WEB_ORIGIN` |
| Register body | `ZodValidationPipe(registerSchema)` | email trimmed + lower-cased + valid + <=254; password 8-128 |
| Login body | `ZodValidationPipe(loginSchema)` | email trimmed + lower-cased, non-empty, <=254 (format not enforced so a malformed email is just a failed login); password 1-128 |
| CV create body | `ZodValidationPipe(createCvSchema)` | `targetRole` optional; trimmed, non-blank, <=200 |
| CV id param | `ZodValidationPipe(cvIdSchema)` | valid Prisma id format |
| Session cookie | Guard | Treated as untrusted string; hashed before lookup |
| Error output | `ApiExceptionFilter` | One shape; unknown errors are logged server-side and returned as a generic `500` |

### Error behavior

One body shape for every error (see [contract](./contracts/auth-and-cv-api.md)): `{ statusCode, code, message, fieldErrors? }`. The filter handles only `ApiError`, Fastify body-parsing errors, the unknown-route 404 and a generic 500 fallback. Request bodies are parsed before the auth guard runs, so an unparseable body can return `400` even without a session (documented in the contract; not part of the 401 test matrix). `fieldErrors` appears only for validation errors. The filter never forwards stack traces, Prisma errors, hashes or tokens (FR-035). Logging uses Nest's `Logger` with event category and user id only; no emails, passwords, cookies or tokens (FR-036).

### Test Strategy

Real PostgreSQL, real Nest app, Fastify `inject()` (no network port). No mocks: the only external boundary here is the database, and the spec forbids nothing that needs faking.

- **Harness**: `global-setup.ts` derives a `<db>_test` database from `DATABASE_URL`, creates it if missing and runs `prisma migrate deploy`. `createTestApp()` calls the same `configureApp()` as `main.ts`, so tests cannot drift from production wiring. Each test creates users with random emails, so tests are isolated and order-independent without truncating tables.
- **Expiry**: tests move `Session.expiresAt` into the past directly in the DB; no clock mocking.

| Spec-required test | Where |
|--------------------|-------|
| Registration success (sets cookie, auto-login, `me` works) | the per-story e2e files (see tasks.md) |
| Duplicate email, incl. case/whitespace variants | the per-story e2e files (see tasks.md) |
| Invalid registration input (bad email, short/long password, missing fields, wrong types) | the per-story e2e files (see tasks.md) (table-driven) |
| Password not stored in plaintext | the per-story e2e files (see tasks.md) (read `passwordHash`, assert Argon2id format and not equal to input) |
| Login success + cookie attributes | the per-story e2e files (see tasks.md) |
| Invalid password; unknown email; identical responses | the per-story e2e files (see tasks.md) |
| Authenticated `me`; unauthenticated protected request | the per-story e2e files (see tasks.md) |
| Expired / malformed / unknown session | the per-story e2e files (see tasks.md) |
| Raw token not persisted (`tokenHash != cookie value`) | the per-story e2e files (see tasks.md) |
| Logout clears cookie; replay of old cookie -> 401; other session survives; logout without session -> 204 | the per-story e2e files (see tasks.md) |
| Every protected route returns an identical 401 | `session.e2e-spec.ts` (`/auth/me`) and `cv-ownership.e2e-spec.ts` (CV routes) |
| Create CV for authenticated user (owner from session) | `cv-ownership.e2e-spec.ts` |
| Read own CV | `cv-ownership.e2e-spec.ts` |
| Read another user's CV == read non-existent CV (same status and body) | `cv-ownership.e2e-spec.ts` |
| Client `userId` in body / query / header cannot change owner or identity | `cv-ownership.e2e-spec.ts` |
| Malformed CV id -> 400; invalid `targetRole` -> 400 | `cv-ownership.e2e-spec.ts` |
| Unit: token generation and hashing; cookie options for production vs non-production (`Secure`); register/login/CV Zod schemas (boundaries 7/8/128/129, normalisation) | `session-token.spec.ts`, `session-cookie.spec.ts`, `auth.schemas.spec.ts`, `cv.schemas.spec.ts` |

**Web**: no component tests in this feature (spec's required tests are all API behavior; adding a web test runner is extra infrastructure). Web is verified by `pnpm lint`, `tsc`, `next build` and the manual mobile-width scenarios in the quickstart. Recorded as a deliberate simplification.

### Implementation Order

Test-first for critical logic (`testing.md`): write the failing e2e test for each step, then implement.

0. **Prep (API)**: add `@fastify/cookie` and `@node-rs/argon2` (confirm both import under ESM first; fallback to `argon2` with `allowBuilds` if not); set `no-explicit-any` to `error` in `.oxlintrc.json`; add `prisma` scripts that pass `--config prisma7.config.ts` (the config file is not named `prisma.config.ts`, so the CLI will not find it by default); remove the dead Nest starter files (`app.controller.ts`, `app.service.ts`, its spec, and the starter e2e test that asserts `Hello World!` against an `AppModule` that no longer registers that controller); add `config/env.ts`; extract `app.setup.ts` and use it from `main.ts`.
1. **Schema**: make `Cv.targetRole` optional; generate the migration; apply to dev DB.
2. **Test harness**: `global-setup.ts`, `createTestApp()`, cookie and user helpers. Smoke test: the app boots and an unknown route returns the standard error shape.
3. **HTTP infra**: `ApiError`, `ApiExceptionFilter`, `ZodValidationPipe` (no standalone specs; covered by the smoke test and the register invalid-input table).
4. **Session core** (red -> green): `session-token.ts`, `PasswordService`, `SessionService`, `session-cookie.ts`.
5. **Auth endpoints** (red -> green, one e2e group at a time): register -> login -> `me` + guard + `@Public` -> logout -> expiry/invalid-session cases.
6. **CV** (red -> green): create -> read own -> cross-user 404 parity -> client-`userId` bypass attempts -> malformed id.
7. **Web**: fetcher and auth API functions -> server-side current-user helper -> register page -> login page -> signed-in page + sign-out -> manual check at 320 px. Read the Next.js docs under `apps/web/node_modules/next/dist/docs/` first, as `apps/web/AGENTS.md` instructs, before using `cookies()`, `redirect()` and route conventions.
8. **Verification**: API `pnpm test`, `pnpm test:e2e`, `tsc --noEmit`, `pnpm lint`; web `pnpm lint`, `tsc`, `next build`; walk the [quickstart](./quickstart.md); review the diff against the spec's acceptance criteria AC-001..AC-012.

## Complexity Tracking

> No constitution violations to justify. Items below are deliberate deviations or leftovers worth knowing about.

| Item | Why | Decision |
|------|-----|----------|
| Existing `Session.expiresAt` index | No query in this feature filters on it (expired rows are removed lazily on lookup). Principle IX discourages speculative indexes. | Leave as is; it was committed before this plan and is harmless. Drop it later if a cleanup job never uses it. |
| Removing starter `app.controller.ts` / `app.service.ts` / specs | They are dead (not registered in `AppModule`) and the starter e2e test would fail. | Remove in step 0; this is the only edit to code outside the feature, and it is trivially revertible. |
| Duplicated email/password rules in API and web Zod schemas | `packages/shared` has no package setup; wiring a shared workspace package (build, ESM/CJS) costs more than it saves. | Duplicate the two small schemas; the server stays authoritative. |

## Project-level follow-ups before final delivery

These are outside this feature but must be completed before the project is delivered. The constitution is not amended.

1. **README (constitution XVI)**: must explain how to run and test, the architecture and decisions, how hallucination is prevented, what was simplified, what would change with more time, and how AI tools were used. It must also repeat this feature's known trade-offs as production follow-ups: registration reveals that an email is already registered (account enumeration, accepted because there is no email verification); there is no failed-login throttling or lockout (FR-012); CSRF protection relies on the HTTP-only `SameSite=Lax` cookie alone, with no additional hardening.
2. **Full-stack `docker compose up` (constitution XV, deferred here)**: `docker-compose.yaml` currently provides only PostgreSQL. API and web containers (with `ANTHROPIC_API_KEY` supplied via the environment) must be added so the whole application starts with one command.

